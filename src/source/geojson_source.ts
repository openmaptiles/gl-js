import {Event, ErrorEvent, Evented} from '../util/evented';

import {extend, warnOnce} from '../util/util';
import {EXTENT} from '../data/extent';
import {ResourceType} from '../util/request_manager';
import {browser} from '../util/browser';

import type {Source} from './source';
import type {Map} from '../ui/map';
import type {Dispatcher} from '../util/dispatcher';
import type {Tile} from './tile';
import type {Actor} from '../util/actor';
import type {GeoJSONSourceSpecification, PromoteIdSpecification} from '@maplibre/maplibre-gl-style-spec';
import type {GeoJSONSourceDiff} from './geojson_source_diff';
import type {GeoJSONWorkerOptions, LoadGeoJSONParameters} from './geojson_worker_source';
import {type WorkerTileParameters} from './worker_source';
import {MessageType} from '../util/actor_messages';
import {LngLatBounds} from '../geo/lng_lat_bounds';
import type {Point, MultiPoint, LineString, MultiLineString, Polygon, MultiPolygon} from 'geojson';

/**
 * Options object for GeoJSONSource.
 */
export type GeoJSONSourceOptions = GeoJSONSourceSpecification & {
    workerOptions?: GeoJSONWorkerOptions;
    collectResourceTiming?: boolean;
    data: GeoJSON.GeoJSON | string;
};

export type GeoJSONSourceInternalOptions = {
    data?: GeoJSON.GeoJSON | string | undefined;
    cluster?: boolean;
    clusterMaxZoom?: number;
    clusterRadius?: number;
    clusterMinPoints?: number;
    generateId?: boolean;
};

/**
 * The cluster options to set
 */
export type SetClusterOptions = {
    /**
     * Whether or not to cluster
     */
    cluster?: boolean;
    /**
     * The cluster's max zoom
     */
    clusterMaxZoom?: number;
    /**
     * The cluster's radius
     */
    clusterRadius?: number;
};

/**
 * A source containing GeoJSON.
 * (See the [Style Specification](https://maplibre.org/maplibre-style-spec/#sources-geojson) for detailed documentation of options.)
 *
 * @group Sources
 *
 * @example
 * ```ts
 * map.addSource('some id', {
 *     type: 'geojson',
 *     data: 'https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_10m_ports.geojson'
 * });
 * ```
 *
 * @example
 * ```ts
 * map.addSource('some id', {
 *    type: 'geojson',
 *    data: {
 *        "type": "FeatureCollection",
 *        "features": [{
 *            "type": "Feature",
 *            "properties": {},
 *            "geometry": {
 *                "type": "Point",
 *                "coordinates": [
 *                    -76.53063297271729,
 *                    39.18174077994108
 *                ]
 *            }
 *        }]
 *    }
 * });
 * ```
 *
 * @example
 * ```ts
 * map.getSource('some id').setData({
 *   "type": "FeatureCollection",
 *   "features": [{
 *       "type": "Feature",
 *       "properties": { "name": "Null Island" },
 *       "geometry": {
 *           "type": "Point",
 *           "coordinates": [ 0, 0 ]
 *       }
 *   }]
 * });
 * ```
 * @see [Draw GeoJSON points](https://maplibre.org/maplibre-gl-js/docs/examples/geojson-markers/)
 * @see [Add a GeoJSON line](https://maplibre.org/maplibre-gl-js/docs/examples/geojson-line/)
 * @see [Create a heatmap from points](https://maplibre.org/maplibre-gl-js/docs/examples/heatmap-layer/)
 * @see [Create and style clusters](https://maplibre.org/maplibre-gl-js/docs/examples/cluster/)
 */
export class GeoJSONSource extends Evented implements Source {
    type: 'geojson';
    id: string;
    minzoom: number;
    maxzoom: number;
    tileSize: number;
    attribution: string;
    promoteId: PromoteIdSpecification;

    isTileClipped: boolean;
    reparseOverscaled: boolean;
    _data: GeoJSON.GeoJSON | string | undefined;
    _options: GeoJSONSourceInternalOptions;
    workerOptions: GeoJSONWorkerOptions;
    map: Map;
    actor: Actor;
    _pendingLoads: number;
    _collectResourceTiming: boolean;
    _removed: boolean;

    /** @internal */
    constructor(id: string, options: GeoJSONSourceOptions, dispatcher: Dispatcher, eventedParent: Evented) {
        super();

        this.id = id;

        // `type` is a property rather than a constant to make it easy for 3rd
        // parties to use GeoJSONSource to build their own source types.
        this.type = 'geojson';

        this.minzoom = 0;
        this.maxzoom = 18;
        this.tileSize = 512;
        this.isTileClipped = true;
        this.reparseOverscaled = true;
        this._removed = false;
        this._pendingLoads = 0;

        this.actor = dispatcher.getActor();
        this.setEventedParent(eventedParent);

        this._data = (options.data as any);
        this._options = extend({}, options);

        this._collectResourceTiming = options.collectResourceTiming;

        if (options.maxzoom !== undefined) this.maxzoom = options.maxzoom;
        if (options.type) this.type = options.type;
        if (options.attribution) this.attribution = options.attribution;
        this.promoteId = options.promoteId;

        if (options.clusterMaxZoom !== undefined && this.maxzoom <= options.clusterMaxZoom) {
            warnOnce(`The maxzoom value "${this.maxzoom}" is expected to be greater than the clusterMaxZoom value "${options.clusterMaxZoom}".`);
        }

        // sent to the worker, along with `url: ...` or `data: literal geojson`,
        // so that it can load/parse/index the geojson data
        // extending with `options.workerOptions` helps to make it easy for
        // third-party sources to hack/reuse GeoJSONSource.
        this.workerOptions = extend({
            source: this.id,
            cluster: options.cluster || false,
            geojsonVtOptions: {
                buffer: this._pixelsToTileUnits(options.buffer !== undefined ? options.buffer : 128),
                tolerance: this._pixelsToTileUnits(options.tolerance !== undefined ? options.tolerance : 0.375),
                extent: EXTENT,
                maxZoom: this.maxzoom,
                lineMetrics: options.lineMetrics || false,
                generateId: options.generateId || false
            },
            superclusterOptions: {
                maxZoom: options.clusterMaxZoom !== undefined ? options.clusterMaxZoom : this.maxzoom - 1,
                minPoints: Math.max(2, options.clusterMinPoints || 2),
                extent: EXTENT,
                radius: this._pixelsToTileUnits(options.clusterRadius || 50),
                log: false,
                generateId: options.generateId || false
            },
            clusterProperties: options.clusterProperties,
            filter: options.filter
        }, options.workerOptions);

        // send the promoteId to the worker to have more flexible updates, but only if it is a string
        if (typeof this.promoteId === 'string') {
            this.workerOptions.promoteId = this.promoteId;
        }
    }

    private _pixelsToTileUnits(pixelValue: number): number {
        return pixelValue * (EXTENT / this.tileSize);
    }

    async load() {
        await this._updateWorkerData();
    }

    onAdd(map: Map) {
        this.map = map;
        this.load();
    }

    /**
     * Sets the GeoJSON data and re-renders the map.
     *
     * @param data - A GeoJSON data object or a URL to one. The latter is preferable in the case of large GeoJSON files.
     */
    setData(data: GeoJSON.GeoJSON | string): this {
        this._data = data;
        this._updateWorkerData();

        return this;
    }

    /**
     * Updates the source's GeoJSON, and re-renders the map.
     *
     * For sources with lots of features, this method can be used to make updates more quickly.
     *
     * This approach requires unique IDs for every feature in the source. The IDs can either be specified on the feature,
     * or by using the promoteId option to specify which property should be used as the ID.
     *
     * It is an error to call updateData on a source that did not have unique IDs for each of its features already.
     *
     * Updates are applied on a best-effort basis, updating an ID that does not exist will not result in an error.
     *
     * @param diff - The changes that need to be applied.
     */
    updateData(diff: GeoJSONSourceDiff): this {
        this._updateWorkerData(diff);

        return this;
    }

    /**
     * Allows to get the source's actual GeoJSON data.
     *
     * @returns a promise which resolves to the source's actual GeoJSON data
     */
    async getData(): Promise<GeoJSON.GeoJSON> {
        const options: LoadGeoJSONParameters = extend({type: this.type}, this.workerOptions);
        return this.actor.sendAsync({type: MessageType.getData, data: options});
    }

    /**
     * Allows to get the source's actual boundaries.
     *
     * @returns a promise which resolves to the source's actual boundaries
     */

    async getBounds(): Promise<LngLatBounds> {
        type justGeometry = Point | MultiPoint | LineString | MultiLineString | Polygon | MultiPolygon;
        const bounds: LngLatBounds = new LngLatBounds();
        const data: GeoJSON.GeoJSON = await this.getData();
        let coordinates: number[];
        if (!!data) return bounds;
        switch(data.type){
            case 'Feature':
                if (data.geometry.type === 'GeometryCollection') {
                    coordinates = data.geometry.geometries.map((g: justGeometry) => g.coordinates).flat(Infinity) as number[];
                }else{
                    coordinates = data.geometry.coordinates.flat(Infinity) as number[];
                }
                break;
            case 'FeatureCollection':
                coordinates = data.features.map(f => {
                    if (f.geometry.type === 'GeometryCollection') {
                        return f.geometry.geometries.map((g: justGeometry) => g.coordinates);
                    }else{
                        return f.geometry.coordinates;
                    }
                }).flat(Infinity) as number[];
                break;
            case 'GeometryCollection':
                coordinates = data.geometries.map((g: justGeometry) => g.coordinates).flat(Infinity) as number[];
                break;
            default:
                coordinates = data.coordinates.flat(Infinity) as number[];
        }
        if(coordinates.length == 0) return bounds;
        for(let i = 0; i < coordinates.length - 1; i += 2){
            bounds.extend([coordinates[i], coordinates[i+1]]);
        }
        return bounds;
    }

    /**
     * To disable/enable clustering on the source options
     * @param options - The options to set
     * @example
     * ```ts
     * map.getSource('some id').setClusterOptions({cluster: false});
     * map.getSource('some id').setClusterOptions({cluster: false, clusterRadius: 50, clusterMaxZoom: 14});
     * ```
     */
    setClusterOptions(options: SetClusterOptions): this {
        this.workerOptions.cluster = options.cluster;
        if (options) {
            if (options.clusterRadius !== undefined) this.workerOptions.superclusterOptions.radius = this._pixelsToTileUnits(options.clusterRadius);
            if (options.clusterMaxZoom !== undefined) this.workerOptions.superclusterOptions.maxZoom = options.clusterMaxZoom;
        }
        this._updateWorkerData();
        return this;
    }

    /**
     * For clustered sources, fetches the zoom at which the given cluster expands.
     *
     * @param clusterId - The value of the cluster's `cluster_id` property.
     * @returns a promise that is resolved with the zoom number
     */
    getClusterExpansionZoom(clusterId: number): Promise<number> {
        return this.actor.sendAsync({type: MessageType.getClusterExpansionZoom, data: {type: this.type, clusterId, source: this.id}});
    }

    /**
     * For clustered sources, fetches the children of the given cluster on the next zoom level (as an array of GeoJSON features).
     *
     * @param clusterId - The value of the cluster's `cluster_id` property.
     * @returns a promise that is resolved when the features are retrieved
     */
    getClusterChildren(clusterId: number): Promise<Array<GeoJSON.Feature>> {
        return this.actor.sendAsync({type: MessageType.getClusterChildren, data: {type: this.type, clusterId, source: this.id}});
    }

    /**
     * For clustered sources, fetches the original points that belong to the cluster (as an array of GeoJSON features).
     *
     * @param clusterId - The value of the cluster's `cluster_id` property.
     * @param limit - The maximum number of features to return.
     * @param offset - The number of features to skip (e.g. for pagination).
     * @returns a promise that is resolved when the features are retrieved
     * @example
     * Retrieve cluster leaves on click
     * ```ts
     * map.on('click', 'clusters', (e) => {
     *   let features = map.queryRenderedFeatures(e.point, {
     *     layers: ['clusters']
     *   });
     *
     *   let clusterId = features[0].properties.cluster_id;
     *   let pointCount = features[0].properties.point_count;
     *   let clusterSource = map.getSource('clusters');
     *
     *   const features = await clusterSource.getClusterLeaves(clusterId, pointCount);
     *   // Print cluster leaves in the console
     *   console.log('Cluster leaves:', features);
     * });
     * ```
     */
    getClusterLeaves(clusterId: number, limit: number, offset: number): Promise<Array<GeoJSON.Feature>> {
        return this.actor.sendAsync({type: MessageType.getClusterLeaves, data: {
            type: this.type,
            source: this.id,
            clusterId,
            limit,
            offset
        }});
    }

    /**
     * Responsible for invoking WorkerSource's geojson.loadData target, which
     * handles loading the geojson data and preparing to serve it up as tiles,
     * using geojson-vt or supercluster as appropriate.
     * @param diff - the diff object
     */
    async _updateWorkerData(diff?: GeoJSONSourceDiff) {
        const options: LoadGeoJSONParameters = extend({type: this.type}, this.workerOptions);
        if (diff) {
            options.dataDiff = diff;
        } else if (typeof this._data === 'string') {
            options.request = this.map._requestManager.transformRequest(browser.resolveURL(this._data as string), ResourceType.Source);
            options.request.collectResourceTiming = this._collectResourceTiming;
        } else {
            options.data = JSON.stringify(this._data);
        }
        this._pendingLoads++;
        this.fire(new Event('dataloading', {dataType: 'source'}));
        try {
            const result = await this.actor.sendAsync({type: MessageType.loadData, data: options});
            this._pendingLoads--;
            if (this._removed || result.abandoned) {
                this.fire(new Event('dataabort', {dataType: 'source'}));
                return;
            }

            let resourceTiming: PerformanceResourceTiming[] = null;
            if (result.resourceTiming && result.resourceTiming[this.id]) {
                resourceTiming = result.resourceTiming[this.id].slice(0);
            }

            const data: any = {dataType: 'source'};
            if (this._collectResourceTiming && resourceTiming && resourceTiming.length > 0) {
                extend(data, {resourceTiming});
            }

            // although GeoJSON sources contain no metadata, we fire this event to let the SourceCache
            // know its ok to start requesting tiles.
            this.fire(new Event('data', {...data, sourceDataType: 'metadata'}));
            this.fire(new Event('data', {...data, sourceDataType: 'content'}));
        } catch (err) {
            this._pendingLoads--;
            if (this._removed) {
                this.fire(new Event('dataabort', {dataType: 'source'}));
                return;
            }
            this.fire(new ErrorEvent(err));
        }
    }

    loaded(): boolean {
        return this._pendingLoads === 0;
    }

    async loadTile(tile: Tile): Promise<void> {
        const message = !tile.actor ?  MessageType.loadTile :  MessageType.reloadTile;
        tile.actor = this.actor;
        const params: WorkerTileParameters = {
            type: this.type,
            uid: tile.uid,
            tileID: tile.tileID,
            zoom: tile.tileID.overscaledZ,
            maxZoom: this.maxzoom,
            tileSize: this.tileSize,
            source: this.id,
            pixelRatio: this.map.getPixelRatio(),
            showCollisionBoxes: this.map.showCollisionBoxes,
            promoteId: this.promoteId,
            subdivisionGranularity: this.map.style.projection.subdivisionGranularity
        };

        tile.abortController = new AbortController();
        const data = await this.actor.sendAsync({type: message, data: params}, tile.abortController);
        delete tile.abortController;
        tile.unloadVectorData();

        if (!tile.aborted) {
            tile.loadVectorData(data, this.map.painter, message ===  MessageType.reloadTile);
        }
    }

    async abortTile(tile: Tile) {
        if (tile.abortController) {
            tile.abortController.abort();
            delete tile.abortController;
        }
        tile.aborted = true;
    }

    async unloadTile(tile: Tile) {
        tile.unloadVectorData();
        await this.actor.sendAsync({type: MessageType.removeTile, data: {uid: tile.uid, type: this.type, source: this.id}});
    }

    onRemove() {
        this._removed = true;
        this.actor.sendAsync({type: MessageType.removeSource, data: {type: this.type, source: this.id}});
    }

    serialize(): GeoJSONSourceSpecification {
        return extend({}, this._options, {
            type: this.type,
            data: this._data
        });
    }

    hasTransition() {
        return false;
    }
}
