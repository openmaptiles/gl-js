import {create as createSource} from './source';

import {Tile} from './tile';
import {Event, ErrorEvent, Evented} from '../util/evented';
import {TileCache} from './tile_cache';
import {MercatorCoordinate} from '../geo/mercator_coordinate';
import {keysDifference} from '../util/util';
import {EXTENT} from '../data/extent';
import {Context} from '../gl/context';
import Point from '@mapbox/point-geometry';
import {browser} from '../util/browser';
import {OverscaledTileID} from './tile_id';
import {SourceFeatureState} from './source_state';
import {config} from '../util/config';

import type {Source} from './source';
import type {Map} from '../ui/map';
import type {Style} from '../style/style';
import type {Dispatcher} from '../util/dispatcher';
import type {IReadonlyTransform, ITransform} from '../geo/transform_interface';
import type {TileState} from './tile';
import type {SourceSpecification} from '@maplibre/maplibre-gl-style-spec';
import type {MapSourceDataEvent} from '../ui/events';
import type {Terrain} from '../render/terrain';
import type {CanvasSourceSpecification} from './canvas_source';
import {PerformanceMarkers, PerformanceUtils} from '../util/performance';

type TileResult = {
    tile: Tile;
    tileID: OverscaledTileID;
    queryGeometry: Array<Point>;
    cameraQueryGeometry: Array<Point>;
    scale: number;
}

/**
 * @internal
 * `SourceCache` is responsible for
 *
 *  - creating an instance of `Source`
 *  - forwarding events from `Source`
 *  - caching tiles loaded from an instance of `Source`
 *  - loading the tiles needed to render a given viewport
 *  - unloading the cached tiles not needed to render a given viewport
 */
export class SourceCache extends Evented {
    id: string;
    dispatcher: Dispatcher;
    map: Map;
    style: Style;

    _source: Source;

    /**
     * @internal
     * signifies that the TileJSON is loaded if applicable.
     * if the source type does not come with a TileJSON, the flag signifies the
     * source data has loaded (i.e geojson has been tiled on the worker and is ready)
     */
    _sourceLoaded: boolean;

    _sourceErrored: boolean;
    _tiles: {[_: string]: Tile};
    _prevLng: number;
    _cache: TileCache;
    _timers: {
        [_ in any]: ReturnType<typeof setTimeout>;
    };
    _cacheTimers: {
        [_ in any]: ReturnType<typeof setTimeout>;
    };
    _maxTileCacheSize: number;
    _maxTileCacheZoomLevels: number;
    _paused: boolean;
    _shouldReloadOnResume: boolean;
    _coveredTiles: {[_: string]: boolean};
    transform: ITransform;
    terrain: Terrain;
    used: boolean;
    usedForTerrain: boolean;
    tileSize: number;
    _state: SourceFeatureState;
    _loadedParentTiles: {[_: string]: Tile};
    _loadedSiblingTiles: {[_: string]: Tile};
    _didEmitContent: boolean;
    _updated: boolean;

    static maxUnderzooming: number;
    static maxOverzooming: number;

    constructor(id: string, options: SourceSpecification | CanvasSourceSpecification, dispatcher: Dispatcher) {
        super();
        this.id = id;
        this.dispatcher = dispatcher;

        this.on('data', (e: MapSourceDataEvent) => this._dataHandler(e));

        this.on('dataloading', () => {
            this._sourceErrored = false;
        });

        this.on('error', () => {
            // Only set _sourceErrored if the source does not have pending loads.
            this._sourceErrored = this._source.loaded();
        });

        this._source = createSource(id, options, dispatcher, this);

        this._tiles = {};
        this._cache = new TileCache(0, (tile) => this._unloadTile(tile));
        this._timers = {};
        this._cacheTimers = {};
        this._maxTileCacheSize = null;
        this._maxTileCacheZoomLevels = null;
        this._loadedParentTiles = {};

        this._coveredTiles = {};
        this._state = new SourceFeatureState();
        this._didEmitContent = false;
        this._updated = false;
    }

    onAdd(map: Map) {
        this.map = map;
        this._maxTileCacheSize = map ? map._maxTileCacheSize : null;
        this._maxTileCacheZoomLevels = map ? map._maxTileCacheZoomLevels : null;
        if (this._source && this._source.onAdd) {
            this._source.onAdd(map);
        }
    }

    onRemove(map: Map) {
        this.clearTiles();
        if (this._source && this._source.onRemove) {
            this._source.onRemove(map);
        }
    }

    /**
     * Return true if no tile data is pending, tiles will not change unless
     * an additional API call is received.
     */
    loaded(): boolean {
        if (this._sourceErrored) { return true; }
        if (!this._sourceLoaded) { return false; }
        if (!this._source.loaded()) { return false; }
        if ((this.used !== undefined || this.usedForTerrain !== undefined) && !this.used && !this.usedForTerrain) { return true; }
        // do not consider as loaded if the update hasn't been called yet (we do not know if we will have any tiles to fetch)
        if (!this._updated) { return false; }

        for (const t in this._tiles) {
            const tile = this._tiles[t];
            if (tile.state !== 'loaded' && tile.state !== 'errored')
                return false;
        }
        return true;
    }

    getSource(): Source {
        return this._source;
    }

    pause() {
        this._paused = true;
    }

    resume() {
        if (!this._paused) return;
        const shouldReload = this._shouldReloadOnResume;
        this._paused = false;
        this._shouldReloadOnResume = false;
        if (shouldReload) this.reload();
        if (this.transform) this.update(this.transform, this.terrain);
    }

    async _loadTile(tile: Tile, id: string, state: TileState): Promise<void> {
        PerformanceUtils.mark(PerformanceMarkers.lastTileRequested);
        
        try {
            await this._source.loadTile(tile);
            PerformanceUtils.mark(PerformanceMarkers.tileReceived);
            this._tileLoaded(tile, id, state);
        } catch (err) {
            tile.state = 'errored';
            if ((err as any).status !== 404) {
                this._source.fire(new ErrorEvent(err, {tile}));
            } else {
                // continue to try loading parent/children tiles if a tile doesn't exist (404)
                this.update(this.transform, this.terrain);
            }
        }
    }

    _unloadTile(tile: Tile) {
        if (this._source.unloadTile)
            this._source.unloadTile(tile);
    }

    _abortTile(tile: Tile) {
        if (this._source.abortTile)
            this._source.abortTile(tile);

        this._source.fire(new Event('dataabort', {tile, coord: tile.tileID, dataType: 'source'}));
    }

    serialize() {
        return this._source.serialize();
    }

    prepare(context: Context) {
        if  (this._source.prepare) {
            this._source.prepare();
        }

        this._state.coalesceChanges(this._tiles, this.map ? this.map.painter : null);
        for (const i in this._tiles) {
            const tile = this._tiles[i];
            tile.upload(context);
            tile.prepare(this.map.style.imageManager);
        }
    }

    /**
     * Return all tile ids ordered with z-order, and cast to numbers
     */
    getIds(): Array<string> {
        return (Object.values(this._tiles) as any).map((tile: Tile) => tile.tileID).sort(compareTileId).map(id => id.key);
    }

    getRenderableIds(symbolLayer?: boolean): Array<string> {
        const renderables: Array<Tile> = [];
        for (const id in this._tiles) {
            if (this._isIdRenderable(id, symbolLayer)) renderables.push(this._tiles[id]);
        }
        if (symbolLayer) {
            return renderables.sort((a_: Tile, b_: Tile) => {
                const a = a_.tileID;
                const b = b_.tileID;
                const rotatedA = (new Point(a.canonical.x, a.canonical.y))._rotate(-this.transform.bearingInRadians);
                const rotatedB = (new Point(b.canonical.x, b.canonical.y))._rotate(-this.transform.bearingInRadians);
                return a.overscaledZ - b.overscaledZ || rotatedB.y - rotatedA.y || rotatedB.x - rotatedA.x;
            }).map(tile => tile.tileID.key);
        }
        return renderables.map(tile => tile.tileID).sort(compareTileId).map(id => id.key);
    }

    hasRenderableParent(tileID: OverscaledTileID) {
        const parentTile = this.findLoadedParent(tileID, 0);
        if (parentTile) {
            return this._isIdRenderable(parentTile.tileID.key);
        }
        return false;
    }

    _isIdRenderable(id: string, symbolLayer?: boolean) {
        return this._tiles[id] && this._tiles[id].hasData() &&
            !this._coveredTiles[id] && (symbolLayer || !this._tiles[id].holdingForFade());
    }

    reload(sourceDataChanged?: boolean) {
        if (this._paused) {
            this._shouldReloadOnResume = true;
            return;
        }

        this._cache.reset();

        for (const i in this._tiles) {
            if (sourceDataChanged || this._tiles[i].state !== 'errored') {
                this._reloadTile(i, 'reloading');
            }
        }
    }

    async _reloadTile(id: string, state: TileState) {
        const tile = this._tiles[id];

        // this potentially does not address all underlying
        // issues https://github.com/mapbox/mapbox-gl-js/issues/4252
        // - hard to tell without repro steps
        if (!tile) return;

        // The difference between "loading" tiles and "reloading" or "expired"
        // tiles is that "reloading"/"expired" tiles are "renderable".
        // Therefore, a "loading" tile cannot become a "reloading" tile without
        // first becoming a "loaded" tile.
        if (tile.state !== 'loading') {
            tile.state = state;
        }
        await this._loadTile(tile, id, state);
    }

    _tileLoaded(tile: Tile, id: string, previousState: TileState) {
        tile.timeAdded = browser.now();
        if (previousState === 'expired') tile.refreshedUponExpiration = true;
        this._setTileReloadTimer(id, tile);
        if (this.getSource().type === 'raster-dem' && tile.dem) this._backfillDEM(tile);
        this._state.initializeTileState(tile, this.map ? this.map.painter : null);

        if (!tile.aborted) {
            this._source.fire(new Event('data', {dataType: 'source', tile, coord: tile.tileID}));
        }
    }

    /**
     * For raster terrain source, backfill DEM to eliminate visible tile boundaries
     */
    _backfillDEM(tile: Tile) {
        const renderables = this.getRenderableIds();
        for (let i = 0; i < renderables.length; i++) {
            const borderId = renderables[i];
            if (tile.neighboringTiles && tile.neighboringTiles[borderId]) {
                const borderTile = this.getTileByID(borderId);
                fillBorder(tile, borderTile);
                fillBorder(borderTile, tile);
            }
        }

        function fillBorder(tile, borderTile) {
            tile.needsHillshadePrepare = true;
            tile.needsTerrainPrepare = true;
            let dx = borderTile.tileID.canonical.x - tile.tileID.canonical.x;
            const dy = borderTile.tileID.canonical.y - tile.tileID.canonical.y;
            const dim = Math.pow(2, tile.tileID.canonical.z);
            const borderId = borderTile.tileID.key;
            if (dx === 0 && dy === 0) return;

            if (Math.abs(dy) > 1) {
                return;
            }
            if (Math.abs(dx) > 1) {
                // Adjust the delta coordinate for world wraparound.
                if (Math.abs(dx + dim) === 1) {
                    dx += dim;
                } else if (Math.abs(dx - dim) === 1) {
                    dx -= dim;
                }
            }
            if (!borderTile.dem || !tile.dem) return;
            tile.dem.backfillBorder(borderTile.dem, dx, dy);
            if (tile.neighboringTiles && tile.neighboringTiles[borderId])
                tile.neighboringTiles[borderId].backfilled = true;
        }
    }
    /**
     * Get a specific tile by TileID
     */
    getTile(tileID: OverscaledTileID): Tile {
        return this.getTileByID(tileID.key);
    }

    /**
     * Get a specific tile by id
     */
    getTileByID(id: string): Tile {
        return this._tiles[id];
    }

    /**
     * For a given set of tiles, retain children that are loaded and have a zoom
     * between `zoom` (exclusive) and `maxCoveringZoom` (inclusive)
     */
    _retainLoadedChildren(
        idealTiles: {
            [_ in any]: OverscaledTileID;
        },
        zoom: number,
        maxCoveringZoom: number,
        retain: {
            [_ in any]: OverscaledTileID;
        }
    ) {
        for (const id in this._tiles) {
            let tile = this._tiles[id];

            // only consider renderable tiles up to maxCoveringZoom
            if (retain[id] ||
                !tile.hasData() ||
                tile.tileID.overscaledZ <= zoom ||
                tile.tileID.overscaledZ > maxCoveringZoom
            ) continue;

            // loop through parents and retain the topmost loaded one if found
            let topmostLoadedID = tile.tileID;
            while (tile && tile.tileID.overscaledZ > zoom + 1) {
                const parentID = tile.tileID.scaledTo(tile.tileID.overscaledZ - 1);

                tile = this._tiles[parentID.key];

                if (tile && tile.hasData()) {
                    topmostLoadedID = parentID;
                }
            }

            // loop through ancestors of the topmost loaded child to see if there's one that needed it
            let tileID = topmostLoadedID;
            while (tileID.overscaledZ > zoom) {
                tileID = tileID.scaledTo(tileID.overscaledZ - 1);

                if (idealTiles[tileID.key]) {
                    // found a parent that needed a loaded child; retain that child
                    retain[topmostLoadedID.key] = topmostLoadedID;
                    break;
                }
            }
        }
    }

    /**
     * Find a loaded parent of the given tile (up to minCoveringZoom)
     */
    findLoadedParent(tileID: OverscaledTileID, minCoveringZoom: number): Tile {
        if (tileID.key in this._loadedParentTiles) {
            const parent = this._loadedParentTiles[tileID.key];
            if (parent && parent.tileID.overscaledZ >= minCoveringZoom) {
                return parent;
            } else {
                return null;
            }
        }
        for (let z = tileID.overscaledZ - 1; z >= minCoveringZoom; z--) {
            const parentTileID = tileID.scaledTo(z);
            const tile = this._getLoadedTile(parentTileID);
            if (tile) {
                return tile;
            }
        }
    }

    /**
     * Find a loaded sibling of the given tile
     */
    findLoadedSibling(tileID: OverscaledTileID): Tile {
        // If a tile with this ID already exists, return it
        return this._getLoadedTile(tileID);
    }

    _getLoadedTile(tileID: OverscaledTileID): Tile {
        const tile = this._tiles[tileID.key];
        if (tile && tile.hasData()) {
            return tile;
        }
        // TileCache ignores wrap in lookup.
        const cachedTile = this._cache.getByKey(tileID.wrapped().key);
        return cachedTile;
    }

    /**
     * Resizes the tile cache based on the current viewport's size
     * or the maxTileCacheSize option passed during map creation
     *
     * Larger viewports use more tiles and need larger caches. Larger viewports
     * are more likely to be found on devices with more memory and on pages where
     * the map is more important.
     */
    updateCacheSize(transform: IReadonlyTransform) {
        const widthInTiles = Math.ceil(transform.width / this._source.tileSize) + 1;
        const heightInTiles = Math.ceil(transform.height / this._source.tileSize) + 1;
        const approxTilesInView = widthInTiles * heightInTiles;
        const commonZoomRange = this._maxTileCacheZoomLevels === null ?
            config.MAX_TILE_CACHE_ZOOM_LEVELS : this._maxTileCacheZoomLevels;
        const viewDependentMaxSize = Math.floor(approxTilesInView * commonZoomRange);
        const maxSize = typeof this._maxTileCacheSize === 'number' ?
            Math.min(this._maxTileCacheSize, viewDependentMaxSize) : viewDependentMaxSize;

        this._cache.setMaxSize(maxSize);
    }

    handleWrapJump(lng: number) {
        // On top of the regular z/x/y values, TileIDs have a `wrap` value that specify
        // which copy of the world the tile belongs to. For example, at `lng: 10` you
        // might render z/x/y/0 while at `lng: 370` you would render z/x/y/1.
        //
        // When lng values get wrapped (going from `lng: 370` to `long: 10`) you expect
        // to see the same thing on the screen (370 degrees and 10 degrees is the same
        // place in the world) but all the TileIDs will have different wrap values.
        //
        // In order to make this transition seamless, we calculate the rounded difference of
        // "worlds" between the last frame and the current frame. If the map panned by
        // a world, then we can assign all the tiles new TileIDs with updated wrap values.
        // For example, assign z/x/y/1 a new id: z/x/y/0. It is the same tile, just rendered
        // in a different position.
        //
        // This enables us to reuse the tiles at more ideal locations and prevent flickering.
        const prevLng = this._prevLng === undefined ? lng : this._prevLng;
        const lngDifference = lng - prevLng;
        const worldDifference = lngDifference / 360;
        const wrapDelta = Math.round(worldDifference);
        this._prevLng = lng;

        if (wrapDelta) {
            const tiles: {[_: string]: Tile} = {};
            for (const key in this._tiles) {
                const tile = this._tiles[key];
                tile.tileID = tile.tileID.unwrapTo(tile.tileID.wrap + wrapDelta);
                tiles[tile.tileID.key] = tile;
            }
            this._tiles = tiles;

            // Reset tile reload timers
            for (const id in this._timers) {
                clearTimeout(this._timers[id]);
                delete this._timers[id];
            }
            for (const id in this._tiles) {
                const tile = this._tiles[id];
                this._setTileReloadTimer(id, tile);
            }
        }
    }

    _updateCoveredAndRetainedTiles(
        retain: { [_: string]: OverscaledTileID },
        minCoveringZoom: number,
        maxCoveringZoom: number,
        zoom: number,
        idealTileIDs: OverscaledTileID[],
        terrain?: Terrain
    ) {
        const tilesForFading: { [_: string]: OverscaledTileID } = {};
        const fadingTiles = {};
        const ids = Object.keys(retain);
        const now = browser.now();
        for (const id of ids) {
            const tileID = retain[id];

            const tile = this._tiles[id];

            // when fadeEndTime is 0, the tile is created but registerFadeDuration
            // has not been called, therefore must be kept in fadingTiles dictionary
            // for next round of rendering
            if (!tile || (tile.fadeEndTime !== 0 && tile.fadeEndTime <= now)) {
                continue;
            }

            // if the tile is loaded but still fading in, find parents to cross-fade with it
            const parentTile = this.findLoadedParent(tileID, minCoveringZoom);
            const siblingTile = this.findLoadedSibling(tileID);
            const fadeTileRef = parentTile || siblingTile || null;
            if (fadeTileRef) {
                this._addTile(fadeTileRef.tileID);
                tilesForFading[fadeTileRef.tileID.key] = fadeTileRef.tileID;
            }

            fadingTiles[id] = tileID;
        }

        // for tiles that are still fading in, also find children to cross-fade with
        this._retainLoadedChildren(fadingTiles, zoom, maxCoveringZoom, retain);

        for (const id in tilesForFading) {
            if (!retain[id]) {
                // If a tile is only needed for fading, mark it as covered so that it isn't rendered on it's own.
                this._coveredTiles[id] = true;
                retain[id] = tilesForFading[id];
            }
        }

        // disable fading logic in terrain3D mode to avoid rendering two tiles on the same place
        if (terrain) {
            const idealRasterTileIDs: { [_: string]: OverscaledTileID } = {};
            const missingTileIDs: { [_: string]: OverscaledTileID } = {};
            for (const tileID of idealTileIDs) {
                if (this._tiles[tileID.key].hasData())
                    idealRasterTileIDs[tileID.key] = tileID;
                else
                    missingTileIDs[tileID.key] = tileID;
            }
            // search for a complete set of children for each missing tile
            for (const key in missingTileIDs) {
                const children = missingTileIDs[key].children(this._source.maxzoom);
                if (this._tiles[children[0].key] && this._tiles[children[1].key] && this._tiles[children[2].key] && this._tiles[children[3].key]) {
                    idealRasterTileIDs[children[0].key] = retain[children[0].key] = children[0];
                    idealRasterTileIDs[children[1].key] = retain[children[1].key] = children[1];
                    idealRasterTileIDs[children[2].key] = retain[children[2].key] = children[2];
                    idealRasterTileIDs[children[3].key] = retain[children[3].key] = children[3];
                    delete missingTileIDs[key];
                }
            }
            // search for parent or sibling for each missing tile
            for (const key in missingTileIDs) {
                const tileID = missingTileIDs[key];
                const parentTile = this.findLoadedParent(tileID, this._source.minzoom);
                const siblingTile = this.findLoadedSibling(tileID);
                const fadeTileRef = parentTile || siblingTile || null;
                if (fadeTileRef) {
                    idealRasterTileIDs[fadeTileRef.tileID.key] = retain[fadeTileRef.tileID.key] = fadeTileRef.tileID;
                    // remove idealTiles which would be rendered twice
                    for (const key in idealRasterTileIDs) {
                        if (idealRasterTileIDs[key].isChildOf(fadeTileRef.tileID)) delete idealRasterTileIDs[key];
                    }
                }
            }
            // cover all tiles which are not needed
            for (const key in this._tiles) {
                if (!idealRasterTileIDs[key]) this._coveredTiles[key] = true;
            }
        }
    }

    /**
     * Removes tiles that are outside the viewport and adds new tiles that
     * are inside the viewport.
     */
    update(transform: ITransform, terrain?: Terrain) {
        if (!this._sourceLoaded || this._paused) {
            return;
        }
        this.transform = transform;
        this.terrain = terrain;

        this.updateCacheSize(transform);
        this.handleWrapJump(this.transform.center.lng);

        // Covered is a list of retained tiles who's areas are fully covered by other,
        // better, retained tiles. They are not drawn separately.
        this._coveredTiles = {};

        let idealTileIDs: OverscaledTileID[];

        if (!this.used && !this.usedForTerrain) {
            idealTileIDs = [];
        } else if (this._source.tileID) {
            idealTileIDs = transform.getVisibleUnwrappedCoordinates(this._source.tileID)
                .map((unwrapped) => new OverscaledTileID(unwrapped.canonical.z, unwrapped.wrap, unwrapped.canonical.z, unwrapped.canonical.x, unwrapped.canonical.y));
        } else {
            idealTileIDs = transform.coveringTiles({
                tileSize: this.usedForTerrain ? this.tileSize : this._source.tileSize,
                minzoom: this._source.minzoom,
                maxzoom: this._source.maxzoom,
                roundZoom: this.usedForTerrain ? false : this._source.roundZoom,
                reparseOverscaled: this._source.reparseOverscaled,
                terrain
            });

            if (this._source.hasTile) {
                idealTileIDs = idealTileIDs.filter((coord) => (this._source.hasTile as any)(coord));
            }
        }

        // Determine the overzooming/underzooming amounts.
        const zoom = transform.coveringZoomLevel(this._source);
        const minCoveringZoom = Math.max(zoom - SourceCache.maxOverzooming, this._source.minzoom);
        const maxCoveringZoom = Math.max(zoom + SourceCache.maxUnderzooming,  this._source.minzoom);

        // When sourcecache is used for terrain also load parent tiles to avoid flickering when zooming out
        if (this.usedForTerrain) {
            const parents = {};
            for (const tileID of idealTileIDs) {
                if (tileID.canonical.z > this._source.minzoom) {
                    const parent = tileID.scaledTo(tileID.canonical.z - 1);
                    parents[parent.key] = parent;
                    // load very low zoom to calculate tile visibility in transform.coveringTiles and high zoomlevels correct
                    const parent2 = tileID.scaledTo(Math.max(this._source.minzoom, Math.min(tileID.canonical.z, 5)));
                    parents[parent2.key] = parent2;
                }
            }
            idealTileIDs = idealTileIDs.concat(Object.values(parents));
        }

        const noPendingDataEmissions = idealTileIDs.length === 0 && !this._updated && this._didEmitContent;
        this._updated = true;
        // if we won't have any tiles to fetch and content is already emitted
        // there will be no more data emissions, so we need to emit the event with isSourceLoaded = true
        if (noPendingDataEmissions) {
            this.fire(new Event('data', {sourceDataType: 'idle', dataType: 'source', sourceId: this.id}));
        }

        // Retain is a list of tiles that we shouldn't delete, even if they are not
        // the most ideal tile for the current viewport. This may include tiles like
        // parent or child tiles that are *already* loaded.
        const retain = this._updateRetainedTiles(idealTileIDs, zoom);

        if (isRasterType(this._source.type)) {
            this._updateCoveredAndRetainedTiles(retain, minCoveringZoom, maxCoveringZoom, zoom, idealTileIDs, terrain);
        }

        for (const retainedId in retain) {
            // Make sure retained tiles always clear any existing fade holds
            // so that if they're removed again their fade timer starts fresh.
            this._tiles[retainedId].clearFadeHold();
        }

        // Remove the tiles we don't need anymore.
        const remove = keysDifference(this._tiles, retain);
        for (const tileID of remove) {
            const tile = this._tiles[tileID];
            if (tile.hasSymbolBuckets && !tile.holdingForFade()) {
                tile.setHoldDuration(this.map._fadeDuration);
            } else if (!tile.hasSymbolBuckets || tile.symbolFadeFinished()) {
                this._removeTile(tileID);
            }
        }

        // Construct caches of loaded parents & siblings
        this._updateLoadedParentTileCache();
        this._updateLoadedSiblingTileCache();
    }

    releaseSymbolFadeTiles() {
        for (const id in this._tiles) {
            if (this._tiles[id].holdingForFade()) {
                this._removeTile(id);
            }
        }
    }

    _updateRetainedTiles(idealTileIDs: Array<OverscaledTileID>, zoom: number): {[_: string]: OverscaledTileID} {
        const retain: {[_: string]: OverscaledTileID} = {};
        const checked: {[_: string]: boolean} = {};
        const minCoveringZoom = Math.max(zoom - SourceCache.maxOverzooming, this._source.minzoom);
        const maxCoveringZoom = Math.max(zoom + SourceCache.maxUnderzooming,  this._source.minzoom);

        const missingTiles = {};
        for (const tileID of idealTileIDs) {
            const tile = this._addTile(tileID);

            // retain the tile even if it's not loaded because it's an ideal tile.
            retain[tileID.key] = tileID;

            if (tile.hasData()) continue;

            if (zoom < this._source.maxzoom) {
                // save missing tiles that potentially have loaded children
                missingTiles[tileID.key] = tileID;
            }
        }

        // retain any loaded children of ideal tiles up to maxCoveringZoom
        this._retainLoadedChildren(missingTiles, zoom, maxCoveringZoom, retain);

        for (const tileID of idealTileIDs) {
            let tile = this._tiles[tileID.key];

            if (tile.hasData()) continue;

            // The tile we require is not yet loaded or does not exist;
            // Attempt to find children that fully cover it.

            if (zoom + 1 > this._source.maxzoom) {
                // We're looking for an overzoomed child tile.
                const childCoord = tileID.children(this._source.maxzoom)[0];
                const childTile = this.getTile(childCoord);
                if (!!childTile && childTile.hasData()) {
                    retain[childCoord.key] = childCoord;
                    continue; // tile is covered by overzoomed child
                }
            } else {
                // check if all 4 immediate children are loaded (i.e. the missing ideal tile is covered)
                const children = tileID.children(this._source.maxzoom);

                if (retain[children[0].key] &&
                    retain[children[1].key] &&
                    retain[children[2].key] &&
                    retain[children[3].key]) continue; // tile is covered by children
            }

            // We couldn't find child tiles that entirely cover the ideal tile; look for parents now.

            // As we ascend up the tile pyramid of the ideal tile, we check whether the parent
            // tile has been previously requested (and errored because we only loop over tiles with no data)
            // in order to determine if we need to request its parent.
            let parentWasRequested = tile.wasRequested();

            for (let overscaledZ = tileID.overscaledZ - 1; overscaledZ >= minCoveringZoom; --overscaledZ) {
                const parentId = tileID.scaledTo(overscaledZ);

                // Break parent tile ascent if this route has been previously checked by another child.
                if (checked[parentId.key]) break;
                checked[parentId.key] = true;

                tile = this.getTile(parentId);
                if (!tile && parentWasRequested) {
                    tile = this._addTile(parentId);
                }
                if (tile) {
                    const hasData = tile.hasData();
                    if (hasData || !this.map?.cancelPendingTileRequestsWhileZooming || parentWasRequested) {
                        retain[parentId.key] = parentId;
                    }
                    // Save the current values, since they're the parent of the next iteration
                    // of the parent tile ascent loop.
                    parentWasRequested = tile.wasRequested();
                    if (hasData) break;
                }
            }
        }

        return retain;
    }

    _updateLoadedParentTileCache() {
        this._loadedParentTiles = {};

        for (const tileKey in this._tiles) {
            const path = [];
            let parentTile: Tile;
            let currentId = this._tiles[tileKey].tileID;

            // Find the closest loaded ancestor by traversing the tile tree towards the root and
            // caching results along the way
            while (currentId.overscaledZ > 0) {

                // Do we have a cached result from previous traversals?
                if (currentId.key in this._loadedParentTiles) {
                    parentTile = this._loadedParentTiles[currentId.key];
                    break;
                }

                path.push(currentId.key);

                // Is the parent loaded?
                const parentId = currentId.scaledTo(currentId.overscaledZ - 1);
                parentTile = this._getLoadedTile(parentId);
                if (parentTile) {
                    break;
                }

                currentId = parentId;
            }

            // Cache the result of this traversal to all newly visited tiles
            for (const key of path) {
                this._loadedParentTiles[key] = parentTile;
            }
        }
    }

    /**
     * Update the cache of loaded sibling tiles
     *
     * Sibling tiles are tiles that share the same zoom level and
     * x/y position but have different wrap values
     * Maintaining sibling tile cache allows fading from old to new tiles
     * of the same position and zoom level
     */
    _updateLoadedSiblingTileCache() {
        this._loadedSiblingTiles = {};

        for (const tileKey in this._tiles) {
            const currentId = this._tiles[tileKey].tileID;
            const siblingTile: Tile = this._getLoadedTile(currentId);
            this._loadedSiblingTiles[currentId.key] = siblingTile;
        }
    }

    /**
     * Add a tile, given its coordinate, to the pyramid.
     */
    _addTile(tileID: OverscaledTileID): Tile {
        let tile = this._tiles[tileID.key];
        if (tile)
            return tile;

        tile = this._cache.getAndRemove(tileID);
        if (tile) {
            this._setTileReloadTimer(tileID.key, tile);
            // set the tileID because the cached tile could have had a different wrap value
            tile.tileID = tileID;
            this._state.initializeTileState(tile, this.map ? this.map.painter : null);
            if (this._cacheTimers[tileID.key]) {
                clearTimeout(this._cacheTimers[tileID.key]);
                delete this._cacheTimers[tileID.key];
                this._setTileReloadTimer(tileID.key, tile);
            }
        }

        const cached = tile;

        if (!tile) {
            tile = new Tile(tileID, this._source.tileSize * tileID.overscaleFactor());
            this._loadTile(tile, tileID.key, tile.state);
        }

        tile.uses++;
        this._tiles[tileID.key] = tile;
        if (!cached) {
            this._source.fire(new Event('dataloading', {tile, coord: tile.tileID, dataType: 'source'}));
        }

        return tile;
    }

    _setTileReloadTimer(id: string, tile: Tile) {
        if (id in this._timers) {
            clearTimeout(this._timers[id]);
            delete this._timers[id];
        }

        const expiryTimeout = tile.getExpiryTimeout();
        if (expiryTimeout) {
            this._timers[id] = setTimeout(() => {
                this._reloadTile(id, 'expired');
                delete this._timers[id];
            }, expiryTimeout);
        }
    }

    /**
     * Remove a tile, given its id, from the pyramid
     */
    _removeTile(id: string) {
        const tile = this._tiles[id];
        if (!tile)
            return;

        tile.uses--;
        delete this._tiles[id];
        if (this._timers[id]) {
            clearTimeout(this._timers[id]);
            delete this._timers[id];
        }

        if (tile.uses > 0)
            return;

        if (tile.hasData() && tile.state !== 'reloading') {
            this._cache.add(tile.tileID, tile, tile.getExpiryTimeout());
        } else {
            tile.aborted = true;
            this._abortTile(tile);
            this._unloadTile(tile);
        }
    }

    /** @internal */
    private _dataHandler(e: MapSourceDataEvent) {

        const eventSourceDataType = e.sourceDataType;
        if (e.dataType === 'source' && eventSourceDataType === 'metadata') {
            this._sourceLoaded = true;
        }

        // for sources with mutable data, this event fires when the underlying data
        // to a source is changed. (i.e. GeoJSONSource#setData and ImageSource#serCoordinates)
        if (this._sourceLoaded && !this._paused && e.dataType === 'source' && eventSourceDataType === 'content') {
            this.reload(e.sourceDataChanged);
            if (this.transform) {
                this.update(this.transform, this.terrain);
            }

            this._didEmitContent = true;
        }
    }

    /**
     * Remove all tiles from this pyramid
     */
    clearTiles() {
        this._shouldReloadOnResume = false;
        this._paused = false;

        for (const id in this._tiles)
            this._removeTile(id);

        this._cache.reset();
    }

    /**
     * Search through our current tiles and attempt to find the tiles that
     * cover the given bounds.
     * @param pointQueryGeometry - coordinates of the corners of bounding rectangle
     * @returns result items have `{tile, minX, maxX, minY, maxY}`, where min/max bounding values are the given bounds transformed in into the coordinate space of this tile.
     */
    tilesIn(pointQueryGeometry: Array<Point>, maxPitchScaleFactor: number, has3DLayer: boolean) {
        const tileResults: TileResult[] = [];

        const transform = this.transform;
        if (!transform) return tileResults;

        const cameraPointQueryGeometry = has3DLayer ?
            transform.getCameraQueryGeometry(pointQueryGeometry) :
            pointQueryGeometry;

        const queryGeometry = pointQueryGeometry.map((p: Point) => transform.screenPointToMercatorCoordinate(p, this.terrain));
        const cameraQueryGeometry = cameraPointQueryGeometry.map((p: Point) => transform.screenPointToMercatorCoordinate(p, this.terrain));

        const ids = this.getIds();

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const p of cameraQueryGeometry) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        }

        for (let i = 0; i < ids.length; i++) {
            const tile = this._tiles[ids[i]];
            if (tile.holdingForFade()) {
                // Tiles held for fading are covered by tiles that are closer to ideal
                continue;
            }
            const tileID = tile.tileID;
            const scale = Math.pow(2, transform.zoom - tile.tileID.overscaledZ);
            const queryPadding = maxPitchScaleFactor * tile.queryPadding * EXTENT / tile.tileSize / scale;

            const tileSpaceBounds = [
                tileID.getTilePoint(new MercatorCoordinate(minX, minY)),
                tileID.getTilePoint(new MercatorCoordinate(maxX, maxY))
            ];

            if (tileSpaceBounds[0].x - queryPadding < EXTENT && tileSpaceBounds[0].y - queryPadding < EXTENT &&
                tileSpaceBounds[1].x + queryPadding >= 0 && tileSpaceBounds[1].y + queryPadding >= 0) {

                const tileSpaceQueryGeometry: Array<Point> = queryGeometry.map((c) => tileID.getTilePoint(c));
                const tileSpaceCameraQueryGeometry = cameraQueryGeometry.map((c) => tileID.getTilePoint(c));

                tileResults.push({
                    tile,
                    tileID,
                    queryGeometry: tileSpaceQueryGeometry,
                    cameraQueryGeometry: tileSpaceCameraQueryGeometry,
                    scale
                });
            }
        }

        return tileResults;
    }

    getVisibleCoordinates(symbolLayer?: boolean): Array<OverscaledTileID> {
        const coords = this.getRenderableIds(symbolLayer).map((id) => this._tiles[id].tileID);
        if (this.transform) {
            this.transform.precacheTiles(coords);
        }
        return coords;
    }

    hasTransition() {
        if (this._source.hasTransition()) {
            return true;
        }

        if (isRasterType(this._source.type)) {
            const now = browser.now();
            for (const id in this._tiles) {
                const tile = this._tiles[id];
                if (tile.fadeEndTime >= now) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Set the value of a particular state for a feature
     */
    setFeatureState(sourceLayer: string, featureId: number | string, state: any) {
        sourceLayer = sourceLayer || '_geojsonTileLayer';
        this._state.updateState(sourceLayer, featureId, state);
    }

    /**
     * Resets the value of a particular state key for a feature
     */
    removeFeatureState(sourceLayer?: string, featureId?: number | string, key?: string) {
        sourceLayer = sourceLayer || '_geojsonTileLayer';
        this._state.removeFeatureState(sourceLayer, featureId, key);
    }

    /**
     * Get the entire state object for a feature
     */
    getFeatureState(sourceLayer: string, featureId: number | string) {
        sourceLayer = sourceLayer || '_geojsonTileLayer';
        return this._state.getState(sourceLayer, featureId);
    }

    /**
     * Sets the set of keys that the tile depends on. This allows tiles to
     * be reloaded when their dependencies change.
     */
    setDependencies(tileKey: string, namespace: string, dependencies: Array<string>) {
        const tile = this._tiles[tileKey];
        if (tile) {
            tile.setDependencies(namespace, dependencies);
        }
    }

    /**
     * Reloads all tiles that depend on the given keys.
     */
    reloadTilesForDependencies(namespaces: Array<string>, keys: Array<string>) {
        for (const id in this._tiles) {
            const tile = this._tiles[id];
            if (tile.hasDependency(namespaces, keys)) {
                this._reloadTile(id, 'reloading');
            }
        }
        this._cache.filter(tile => !tile.hasDependency(namespaces, keys));
    }
}

SourceCache.maxOverzooming = 10;
SourceCache.maxUnderzooming = 3;

function compareTileId(a: OverscaledTileID, b: OverscaledTileID): number {
    // Different copies of the world are sorted based on their distance to the center.
    // Wrap values are converted to unsigned distances by reserving odd number for copies
    // with negative wrap and even numbers for copies with positive wrap.
    const aWrap = Math.abs(a.wrap * 2) - +(a.wrap < 0);
    const bWrap = Math.abs(b.wrap * 2) - +(b.wrap < 0);
    return a.overscaledZ - b.overscaledZ || bWrap - aWrap || b.canonical.y - a.canonical.y || b.canonical.x - a.canonical.x;
}

function isRasterType(type) {
    return type === 'raster' || type === 'image' || type === 'video';
}
