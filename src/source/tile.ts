import {uniqueId, parseCacheControl} from '../util/util';
import {deserialize as deserializeBucket} from '../data/bucket';
import '../data/feature_index';
import {GeoJSONFeature} from '../util/vectortile_to_geojson';
import {featureFilter} from '@maplibre/maplibre-gl-style-spec';
import {SymbolBucket} from '../data/bucket/symbol_bucket';
import {CollisionBoxArray} from '../data/array_types.g';
import {Texture} from '../render/texture';
import {browser} from '../util/browser';
import {toEvaluationFeature} from '../data/evaluation_feature';
import {EvaluationParameters} from '../style/evaluation_parameters';
import {type SourceFeatureState} from '../source/source_state';
import {rtlMainThreadPluginFactory} from './rtl_text_plugin_main_thread';

const CLOCK_SKEW_RETRY_TIMEOUT = 30000;

import type {Bucket} from '../data/bucket';
import type {StyleLayer} from '../style/style_layer';
import type {WorkerTileResult} from './worker_source';
import type {Actor} from '../util/actor';
import type {DEMData} from '../data/dem_data';
import type {AlphaImage} from '../util/image';
import type {ImageAtlas} from '../render/image_atlas';
import type {ImageManager} from '../render/image_manager';
import type {Context} from '../gl/context';
import type {OverscaledTileID} from './tile_id';
import type {Framebuffer} from '../gl/framebuffer';
import type {IReadonlyTransform} from '../geo/transform_interface';
import type {LayerFeatureStates} from './source_state';
import type {FilterSpecification} from '@maplibre/maplibre-gl-style-spec';
import type Point from '@mapbox/point-geometry';
import type {mat4} from 'gl-matrix';
import type {VectorTileLayer} from '@mapbox/vector-tile';
import type {ExpiryData} from '../util/ajax';
import type {QueryRenderedFeaturesOptionsStrict} from './query_features';
import type {FeatureIndex, QueryResults} from '../data/feature_index';
/**
 * The tile's state, can be:
 *
 * - `loading` Tile data is in the process of loading.
 * - `loaded` Tile data has been loaded. Tile can be rendered.
 * - `reloading` Tile data has been loaded and is being updated. Tile can be rendered.
 * - `unloaded` Tile data has been deleted.
 * - `errored` Tile data was not loaded because of an error.
 * - `expired` Tile data was previously loaded, but has expired per its HTTP headers and is in the process of refreshing.
 */
export type TileState = 'loading' | 'loaded' | 'reloading' | 'unloaded' | 'errored' | 'expired';

/**
 * A tile object is the combination of a Coordinate, which defines
 * its place, as well as a unique ID and data tracking for its content
 */
export class Tile {
    tileID: OverscaledTileID;
    uid: number;
    uses: number;
    tileSize: number;
    buckets: {[_: string]: Bucket};
    latestFeatureIndex: FeatureIndex;
    latestRawTileData: ArrayBuffer;
    imageAtlas: ImageAtlas;
    imageAtlasTexture: Texture;
    glyphAtlasImage: AlphaImage;
    glyphAtlasTexture: Texture;
    expirationTime: any;
    expiredRequestCount: number;
    state: TileState;
    timeAdded: number = 0;
    fadeEndTime: number = 0;
    collisionBoxArray: CollisionBoxArray;
    redoWhenDone: boolean;
    showCollisionBoxes: boolean;
    placementSource: any;
    actor: Actor;
    vtLayers: {[_: string]: VectorTileLayer};

    neighboringTiles: any;
    dem: DEMData;
    demMatrix: mat4;
    aborted: boolean;
    needsHillshadePrepare: boolean;
    needsTerrainPrepare: boolean;
    abortController: AbortController;
    texture: any;
    fbo: Framebuffer;
    demTexture: Texture;
    refreshedUponExpiration: boolean;
    reloadPromise: {resolve: () => void; reject: () => void};
    resourceTiming: Array<PerformanceResourceTiming>;
    queryPadding: number;

    symbolFadeHoldUntil: number;
    hasSymbolBuckets: boolean;
    hasRTLText: boolean;
    dependencies: any;
    rtt: Array<{id: number; stamp: number}>;
    rttCoords: {[_:string]: string};

    /**
     * @param tileID - the tile ID
     * @param size - The tile size
     */
    constructor(tileID: OverscaledTileID, size: number) {
        this.tileID = tileID;
        this.uid = uniqueId();
        this.uses = 0;
        this.tileSize = size;
        this.buckets = {};
        this.expirationTime = null;
        this.queryPadding = 0;
        this.hasSymbolBuckets = false;
        this.hasRTLText = false;
        this.dependencies = {};
        this.rtt = [];
        this.rttCoords = {};

        // Counts the number of times a response was already expired when
        // received. We're using this to add a delay when making a new request
        // so we don't have to keep retrying immediately in case of a server
        // serving expired tiles.
        this.expiredRequestCount = 0;

        this.state = 'loading';
    }

    registerFadeDuration(duration: number) {
        const fadeEndTime = duration + this.timeAdded;

        if (fadeEndTime < this.fadeEndTime) {
            return;
        }

        this.fadeEndTime = fadeEndTime;
    }

    wasRequested() {
        return this.state === 'errored' || this.state === 'loaded' || this.state === 'reloading';
    }

    clearTextures(painter: any) {
        if (this.demTexture) painter.saveTileTexture(this.demTexture);
        this.demTexture = null;
    }

    /**
     * Given a data object with a 'buffers' property, load it into
     * this tile's elementGroups and buffers properties and set loaded
     * to true. If the data is null, like in the case of an empty
     * GeoJSON tile, no-op but still set loaded to true.
     * @param data - The data from the worker
     * @param painter - the painter
     * @param justReloaded - `true` to just reload
     */
    loadVectorData(data: WorkerTileResult, painter: any, justReloaded?: boolean | null) {
        if (this.hasData()) {
            this.unloadVectorData();
        }

        this.state = 'loaded';

        // empty GeoJSON tile
        if (!data) {
            this.collisionBoxArray = new CollisionBoxArray();
            return;
        }

        if (data.featureIndex) {
            this.latestFeatureIndex = data.featureIndex;
            if (data.rawTileData) {
                // Only vector tiles have rawTileData, and they won't update it for
                // 'reloadTile'
                this.latestRawTileData = data.rawTileData;
                this.latestFeatureIndex.rawTileData = data.rawTileData;
            } else if (this.latestRawTileData) {
                // If rawTileData hasn't updated, hold onto a pointer to the last
                // one we received
                this.latestFeatureIndex.rawTileData = this.latestRawTileData;
            }
        }
        this.collisionBoxArray = data.collisionBoxArray;
        this.buckets = deserializeBucket(data.buckets, painter?.style);

        this.hasSymbolBuckets = false;
        for (const id in this.buckets) {
            const bucket = this.buckets[id];
            if (bucket instanceof SymbolBucket) {
                this.hasSymbolBuckets = true;
                if (justReloaded) {
                    bucket.justReloaded = true;
                } else {
                    break;
                }
            }
        }

        this.hasRTLText = false;
        if (this.hasSymbolBuckets) {
            for (const id in this.buckets) {
                const bucket = this.buckets[id];
                if (bucket instanceof SymbolBucket) {
                    if (bucket.hasRTLText) {
                        this.hasRTLText = true;
                        rtlMainThreadPluginFactory().lazyLoad();
                        break;
                    }
                }
            }
        }

        this.queryPadding = 0;
        for (const id in this.buckets) {
            const bucket = this.buckets[id];
            this.queryPadding = Math.max(this.queryPadding, painter.style.getLayer(id).queryRadius(bucket));
        }

        if (data.imageAtlas) {
            this.imageAtlas = data.imageAtlas;
        }
        if (data.glyphAtlasImage) {
            this.glyphAtlasImage = data.glyphAtlasImage;
        }
    }

    /**
     * Release any data or WebGL resources referenced by this tile.
     */
    unloadVectorData() {
        for (const id in this.buckets) {
            this.buckets[id].destroy();
        }
        this.buckets = {};

        if (this.imageAtlasTexture) {
            this.imageAtlasTexture.destroy();
        }

        if (this.imageAtlas) {
            this.imageAtlas = null;
        }

        if (this.glyphAtlasTexture) {
            this.glyphAtlasTexture.destroy();
        }

        this.latestFeatureIndex = null;
        this.state = 'unloaded';
    }

    getBucket(layer: StyleLayer) {
        return this.buckets[layer.id];
    }

    upload(context: Context) {
        for (const id in this.buckets) {
            const bucket = this.buckets[id];
            if (bucket.uploadPending()) {
                bucket.upload(context);
            }
        }

        const gl = context.gl;
        if (this.imageAtlas && !this.imageAtlas.uploaded) {
            this.imageAtlasTexture = new Texture(context, this.imageAtlas.image, gl.RGBA);
            this.imageAtlas.uploaded = true;
        }

        if (this.glyphAtlasImage) {
            this.glyphAtlasTexture = new Texture(context, this.glyphAtlasImage, gl.ALPHA);
            this.glyphAtlasImage = null;
        }
    }

    prepare(imageManager: ImageManager) {
        if (this.imageAtlas) {
            this.imageAtlas.patchUpdatedImages(imageManager, this.imageAtlasTexture);
        }
    }

    // Queries non-symbol features rendered for this tile.
    // Symbol features are queried globally
    queryRenderedFeatures(
        layers: {[_: string]: StyleLayer},
        serializedLayers: {[_: string]: any},
        sourceFeatureState: SourceFeatureState,
        queryGeometry: Array<Point>,
        cameraQueryGeometry: Array<Point>,
        scale: number,
        params: Pick<QueryRenderedFeaturesOptionsStrict, 'filter' | 'layers' | 'availableImages'> | undefined,
        transform: IReadonlyTransform,
        maxPitchScaleFactor: number,
        pixelPosMatrix: mat4
    ): QueryResults {
        if (!this.latestFeatureIndex || !this.latestFeatureIndex.rawTileData)
            return {};

        return this.latestFeatureIndex.query({
            queryGeometry,
            cameraQueryGeometry,
            scale,
            tileSize: this.tileSize,
            pixelPosMatrix,
            transform,
            params,
            queryPadding: this.queryPadding * maxPitchScaleFactor
        }, layers, serializedLayers, sourceFeatureState);
    }

    querySourceFeatures(result: Array<GeoJSONFeature>, params?: {
        sourceLayer?: string;
        filter?: FilterSpecification;
        validate?: boolean;
    }) {
        const featureIndex = this.latestFeatureIndex;
        if (!featureIndex || !featureIndex.rawTileData) return;

        const vtLayers = featureIndex.loadVTLayers();

        const sourceLayer = params && params.sourceLayer ? params.sourceLayer : '';
        const layer = vtLayers._geojsonTileLayer || vtLayers[sourceLayer];

        if (!layer) return;

        const filter = featureFilter(params && params.filter);
        const {z, x, y} = this.tileID.canonical;
        const coord = {z, x, y};

        for (let i = 0; i < layer.length; i++) {
            const feature = layer.feature(i);
            if (filter.needGeometry) {
                const evaluationFeature = toEvaluationFeature(feature, true);
                if (!filter.filter(new EvaluationParameters(this.tileID.overscaledZ), evaluationFeature, this.tileID.canonical)) continue;
            } else if (!filter.filter(new EvaluationParameters(this.tileID.overscaledZ), feature)) {
                continue;
            }
            const id = featureIndex.getId(feature, sourceLayer);
            const geojsonFeature = new GeoJSONFeature(feature, z, x, y, id);
            (geojsonFeature as any).tile = coord;
            result.push(geojsonFeature);
        }
    }

    hasData() {
        return this.state === 'loaded' || this.state === 'reloading' || this.state === 'expired';
    }

    patternsLoaded() {
        return this.imageAtlas && !!Object.keys(this.imageAtlas.patternPositions).length;
    }

    setExpiryData(data: ExpiryData) {
        const prior = this.expirationTime;

        if (data.cacheControl) {
            const parsedCC = parseCacheControl(data.cacheControl);
            if (parsedCC['max-age']) this.expirationTime = Date.now() + parsedCC['max-age'] * 1000;
        } else if (data.expires) {
            this.expirationTime = new Date(data.expires).getTime();
        }

        if (this.expirationTime !== null) {
            const now = Date.now();
            let isExpired = false;

            if (this.expirationTime > now) {
                isExpired = false;
            } else if (!prior) {
                isExpired = true;
            } else if (this.expirationTime < prior) {
                // Expiring date is going backwards:
                // fall back to exponential backoff
                isExpired = true;

            } else {
                const delta = this.expirationTime - prior;

                if (!delta) {
                    // Server is serving the same expired resource over and over: fall
                    // back to exponential backoff.
                    isExpired = true;

                } else {
                    // Assume that either the client or the server clock is wrong and
                    // try to interpolate a valid expiration date (from the client POV)
                    // observing a minimum timeout.
                    this.expirationTime = now + Math.max(delta, CLOCK_SKEW_RETRY_TIMEOUT);

                }
            }

            if (isExpired) {
                this.expiredRequestCount++;
                this.state = 'expired';
            } else {
                this.expiredRequestCount = 0;
            }
        }
    }

    getExpiryTimeout() {
        if (this.expirationTime) {
            if (this.expiredRequestCount) {
                return 1000 * (1 << Math.min(this.expiredRequestCount - 1, 31));
            } else {
                // Max value for `setTimeout` implementations is a 32 bit integer; cap this accordingly
                return Math.min(this.expirationTime - new Date().getTime(), Math.pow(2, 31) - 1);
            }
        }
    }

    setFeatureState(states: LayerFeatureStates, painter: any) {
        if (!this.latestFeatureIndex ||
            !this.latestFeatureIndex.rawTileData ||
            Object.keys(states).length === 0) {
            return;
        }

        const vtLayers = this.latestFeatureIndex.loadVTLayers();

        for (const id in this.buckets) {
            if (!painter.style.hasLayer(id)) continue;

            const bucket = this.buckets[id];
            // Buckets are grouped by common source-layer
            const sourceLayerId = bucket.layers[0]['sourceLayer'] || '_geojsonTileLayer';
            const sourceLayer = vtLayers[sourceLayerId];
            const sourceLayerStates = states[sourceLayerId];
            if (!sourceLayer || !sourceLayerStates || Object.keys(sourceLayerStates).length === 0) continue;

            bucket.update(sourceLayerStates, sourceLayer, this.imageAtlas && this.imageAtlas.patternPositions || {});
            const layer = painter && painter.style && painter.style.getLayer(id);
            if (layer) {
                this.queryPadding = Math.max(this.queryPadding, layer.queryRadius(bucket));
            }
        }
    }

    holdingForFade(): boolean {
        return this.symbolFadeHoldUntil !== undefined;
    }

    symbolFadeFinished(): boolean {
        return !this.symbolFadeHoldUntil || this.symbolFadeHoldUntil < browser.now();
    }

    clearFadeHold() {
        this.symbolFadeHoldUntil = undefined;
    }

    setHoldDuration(duration: number) {
        this.symbolFadeHoldUntil = browser.now() + duration;
    }

    setDependencies(namespace: string, dependencies: Array<string>) {
        const index = {};
        for (const dep of dependencies) {
            index[dep] = true;
        }
        this.dependencies[namespace] = index;
    }

    hasDependency(namespaces: Array<string>, keys: Array<string>) {
        for (const namespace of namespaces) {
            const dependencies = this.dependencies[namespace];
            if (dependencies) {
                for (const key of keys) {
                    if (dependencies[key]) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
}
