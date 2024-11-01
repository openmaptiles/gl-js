import {Event, ErrorEvent, Evented} from '../util/evented';
import {StyleLayer} from './style_layer';
import {createStyleLayer} from './create_style_layer';
import {loadSprite} from './load_sprite';
import {ImageManager} from '../render/image_manager';
import {GlyphManager} from '../render/glyph_manager';
import {Light} from './light';
import {Sky} from './sky';
import {LineAtlas} from '../render/line_atlas';
import {clone, extend, deepEqual, filterObject, mapObject} from '../util/util';
import {coerceSpriteToArray} from '../util/style';
import {getJSON, getReferrer} from '../util/ajax';
import {ResourceType} from '../util/request_manager';
import {browser} from '../util/browser';
import {Dispatcher} from '../util/dispatcher';
import {validateStyle, emitValidationErrors as _emitValidationErrors} from './validate_style';
import {Source} from '../source/source';
import {QueryRenderedFeaturesOptions, QueryRenderedFeaturesOptionsStrict, QuerySourceFeatureOptions, queryRenderedFeatures, queryRenderedSymbols, querySourceFeatures} from '../source/query_features';
import {SourceCache} from '../source/source_cache';
import {GeoJSONSource} from '../source/geojson_source';
import {latest as styleSpec, derefLayers as deref, emptyStyle, diff as diffStyles, DiffCommand} from '@maplibre/maplibre-gl-style-spec';
import {getGlobalWorkerPool} from '../util/global_worker_pool';
import {rtlMainThreadPluginFactory} from '../source/rtl_text_plugin_main_thread';
import {RTLPluginLoadedEventName} from '../source/rtl_text_plugin_status';
import {PauseablePlacement} from './pauseable_placement';
import {ZoomHistory} from './zoom_history';
import {CrossTileSymbolIndex} from '../symbol/cross_tile_symbol_index';
import {validateCustomStyleLayer} from './style_layer/custom_style_layer';
import type {MapGeoJSONFeature} from '../util/vectortile_to_geojson';

// We're skipping validation errors with the `source.canvas` identifier in order
// to continue to allow canvas sources to be added at runtime/updated in
// smart setStyle (see https://github.com/mapbox/mapbox-gl-js/pull/6424):
const emitValidationErrors = (evented: Evented, errors?: ReadonlyArray<{
    message: string;
    identifier?: string;
}> | null) =>
    _emitValidationErrors(evented, errors && errors.filter(error => error.identifier !== 'source.canvas'));

import type {Map} from '../ui/map';
import type {IReadonlyTransform, ITransform} from '../geo/transform_interface';
import type {StyleImage} from './style_image';
import type {EvaluationParameters} from './evaluation_parameters';
import type {Placement} from '../symbol/placement';
import type {
    LayerSpecification,
    FilterSpecification,
    StyleSpecification,
    LightSpecification,
    SourceSpecification,
    SpriteSpecification,
    DiffOperations,
    ProjectionSpecification,
    SkySpecification
} from '@maplibre/maplibre-gl-style-spec';
import type {CanvasSourceSpecification} from '../source/canvas_source';
import type {CustomLayerInterface} from './style_layer/custom_style_layer';
import type {Validator} from './validate_style';
import {
    MessageType,
    type GetGlyphsParameters,
    type GetGlyphsResponse,
    type GetImagesParameters,
    type GetImagesResponse
} from '../util/actor_messages';
import {Projection} from '../geo/projection/projection';
import {createProjectionFromName} from '../geo/projection/projection_factory';
import {PerformanceMarkers, PerformanceUtils} from '../util/performance';

const empty = emptyStyle() as StyleSpecification;
/**
 * A feature identifier that is bound to a source
 */
export type FeatureIdentifier = {
    /**
     * Unique id of the feature.
     */
    id?: string | number | undefined;
    /**
     * The id of the vector or GeoJSON source for the feature.
     */
    source: string;
    /**
     * *For vector tile sources, `sourceLayer` is required.*
     */
    sourceLayer?: string | undefined;
};

/**
 * The options object related to the {@link Map}'s style related methods
 */
export type StyleOptions = {
    /**
     * If false, style validation will be skipped. Useful in production environment.
     */
    validate?: boolean;
    /**
     * Defines a CSS
     * font-family for locally overriding generation of Chinese, Japanese, and Korean characters.
     * For these characters, font settings from the map's style will be ignored, except for font-weight keywords (light/regular/medium/bold).
     * Set to `false`, to enable font settings from the map's style for these glyph ranges.
     * Forces a full update.
     */
    localIdeographFontFamily?: string | false;
};

/**
 * Supporting type to add validation to another style related type
 */
export type StyleSetterOptions = {
    /**
     * Whether to check if the filter conforms to the MapLibre Style Specification. Disabling validation is a performance optimization that should only be used if you have previously validated the values you will be passing to this function.
     */
    validate?: boolean;
};

/**
 * Part of {@link Map#setStyle} options, transformStyle is a convenience function that allows to modify a style after it is fetched but before it is committed to the map state.
 *
 * This function exposes previous and next styles, it can be commonly used to support a range of functionalities like:
 *
 * - when previous style carries certain 'state' that needs to be carried over to a new style gracefully;
 * - when a desired style is a certain combination of previous and incoming style;
 * - when an incoming style requires modification based on external state.
 *
 * @param previous - The current style.
 * @param next - The next style.
 * @returns resulting style that will to be applied to the map
 *
 * @example
 * ```ts
 * map.setStyle('https://demotiles.maplibre.org/style.json', {
 *   transformStyle: (previousStyle, nextStyle) => ({
 *       ...nextStyle,
 *       sources: {
 *           ...nextStyle.sources,
 *           // copy a source from previous style
 *           'osm': previousStyle.sources.osm
 *       },
 *       layers: [
 *           // background layer
 *           nextStyle.layers[0],
 *           // copy a layer from previous style
 *           previousStyle.layers[0],
 *           // other layers from the next style
 *           ...nextStyle.layers.slice(1).map(layer => {
 *               // hide the layers we don't need from demotiles style
 *               if (layer.id.startsWith('geolines')) {
 *                   layer.layout = {...layer.layout || {}, visibility: 'none'};
 *               // filter out US polygons
 *               } else if (layer.id.startsWith('coastline') || layer.id.startsWith('countries')) {
 *                   layer.filter = ['!=', ['get', 'ADM0_A3'], 'USA'];
 *               }
 *               return layer;
 *           })
 *       ]
 *   })
 * });
 * ```
 */
export type TransformStyleFunction = (previous: StyleSpecification | undefined, next: StyleSpecification) => StyleSpecification;

/**
 * The options object related to the {@link Map}'s style related methods
 */
export type StyleSwapOptions = {
    /**
     * If false, force a 'full' update, removing the current style
     * and building the given one instead of attempting a diff-based update.
     */
    diff?: boolean;
    /**
     * TransformStyleFunction is a convenience function
     * that allows to modify a style after it is fetched but before it is committed to the map state. Refer to {@link TransformStyleFunction}.
     */
    transformStyle?: TransformStyleFunction;
}

/**
 * Specifies a layer to be added to a {@link Style}. In addition to a standard {@link LayerSpecification}
 * or a {@link CustomLayerInterface}, a {@link LayerSpecification} with an embedded {@link SourceSpecification} can also be provided.
 */
export type AddLayerObject = LayerSpecification | (Omit<LayerSpecification, 'source'> & {source: SourceSpecification}) | CustomLayerInterface;

/**
 * The Style base class
 */
export class Style extends Evented {
    map: Map;
    stylesheet: StyleSpecification;
    dispatcher: Dispatcher;
    imageManager: ImageManager;
    glyphManager: GlyphManager;
    lineAtlas: LineAtlas;
    light: Light;
    projection: Projection;
    sky: Sky;

    _frameRequest: AbortController;
    _loadStyleRequest: AbortController;
    _spriteRequest: AbortController;
    _layers: {[_: string]: StyleLayer};
    _serializedLayers: {[_: string]: LayerSpecification};
    _order: Array<string>;
    sourceCaches: {[_: string]: SourceCache};
    zoomHistory: ZoomHistory;
    _loaded: boolean;
    _changed: boolean;
    _updatedSources: {[_: string]: 'clear' | 'reload'};
    _updatedLayers: {[_: string]: true};
    _removedLayers: {[_: string]: StyleLayer};
    _changedImages: {[_: string]: true};
    _glyphsDidChange: boolean;
    _updatedPaintProps: {[layer: string]: true};
    _layerOrderChanged: boolean;
    // image ids of images loaded from style's sprite
    _spritesImagesIds: {[spriteId: string]: string[]};
    // image ids of all images loaded (sprite + user)
    _availableImages: Array<string>;

    crossTileSymbolIndex: CrossTileSymbolIndex;
    pauseablePlacement: PauseablePlacement;
    placement: Placement;
    z: number;

    constructor(map: Map, options: StyleOptions = {}) {
        super();

        this.map = map;
        this.dispatcher = new Dispatcher(getGlobalWorkerPool(), map._getMapId());
        this.dispatcher.registerMessageHandler(MessageType.getGlyphs, (mapId, params) => {
            return this.getGlyphs(mapId, params);
        });
        this.dispatcher.registerMessageHandler(MessageType.getImages, (mapId, params) => {
            return this.getImages(mapId, params);
        });
        this.imageManager = new ImageManager();
        this.imageManager.setEventedParent(this);
        this.glyphManager = new GlyphManager(map._requestManager, options.localIdeographFontFamily);
        this.lineAtlas = new LineAtlas(256, 512);
        this.crossTileSymbolIndex = new CrossTileSymbolIndex();

        this._spritesImagesIds = {};
        this._layers = {};

        this._order = [];
        this.sourceCaches = {};
        this.zoomHistory = new ZoomHistory();
        this._loaded = false;
        this._availableImages = [];

        this._resetUpdates();

        this.dispatcher.broadcast(MessageType.setReferrer, getReferrer());
        rtlMainThreadPluginFactory().on(RTLPluginLoadedEventName, this._rtlPluginLoaded);

        this.on('data', (event) => {
            if (event.dataType !== 'source' || event.sourceDataType !== 'metadata') {
                return;
            }

            const sourceCache = this.sourceCaches[event.sourceId];
            if (!sourceCache) {
                return;
            }

            const source = sourceCache.getSource();
            if (!source || !source.vectorLayerIds) {
                return;
            }

            for (const layerId in this._layers) {
                const layer = this._layers[layerId];
                if (layer.source === source.id) {
                    this._validateLayer(layer);
                }
            }
        });
    }

    _rtlPluginLoaded = () => {
        for (const id in this.sourceCaches) {
            const sourceType = this.sourceCaches[id].getSource().type;
            if (sourceType === 'vector' || sourceType === 'geojson') {
                // Non-vector sources don't have any symbols buckets to reload when the RTL text plugin loads
                // They also load more quickly, so they're more likely to have already displaying tiles
                // that would be unnecessarily booted by the plugin load event
                this.sourceCaches[id].reload(); // Should be a no-op if the plugin loads before any tiles load
            }
        }
    };

    loadURL(url: string, options: StyleSwapOptions & StyleSetterOptions = {}, previousStyle?: StyleSpecification) {
        this.fire(new Event('dataloading', {dataType: 'style'}));

        options.validate = typeof options.validate === 'boolean' ?
            options.validate : true;

        const request = this.map._requestManager.transformRequest(url, ResourceType.Style);
        this._loadStyleRequest = new AbortController();
        const abortController = this._loadStyleRequest;
        getJSON<StyleSpecification>(request, this._loadStyleRequest).then((response) => {
            this._loadStyleRequest = null;
            this._load(response.data, options, previousStyle);
        }).catch((error) => {
            this._loadStyleRequest = null;
            if (error && !abortController.signal.aborted) { // ignore abort
                this.fire(new ErrorEvent(error));
            }
        });
    }

    loadJSON(json: StyleSpecification, options: StyleSetterOptions & StyleSwapOptions = {}, previousStyle?: StyleSpecification) {
        this.fire(new Event('dataloading', {dataType: 'style'}));

        this._frameRequest = new AbortController();
        browser.frameAsync(this._frameRequest).then(() => {
            this._frameRequest = null;
            options.validate = options.validate !== false;
            this._load(json, options, previousStyle);
            PerformanceUtils.mark(PerformanceMarkers.styleLoaded);
        }).catch(() => {}); // ignore abort
    }

    loadEmpty() {
        this.fire(new Event('dataloading', {dataType: 'style'}));
        this._load(empty, {validate: false});
    }

    _load(json: StyleSpecification, options: StyleSwapOptions & StyleSetterOptions, previousStyle?: StyleSpecification) {
        const nextState = options.transformStyle ? options.transformStyle(previousStyle, json) : json;
        if (options.validate && emitValidationErrors(this, validateStyle(nextState))) {
            return;
        }

        this._loaded = true;
        this.stylesheet = nextState;

        for (const id in nextState.sources) {
            this.addSource(id, nextState.sources[id], {validate: false});
        }

        if (nextState.sprite) {
            this._loadSprite(nextState.sprite);
        } else {
            this.imageManager.setLoaded(true);
        }

        this.glyphManager.setURL(nextState.glyphs);
        this._createLayers();

        this.light = new Light(this.stylesheet.light);
        this._setProjectionInternal(this.stylesheet.projection?.type || 'mercator');

        this.sky = new Sky(this.stylesheet.sky);

        this.map.setTerrain(this.stylesheet.terrain ?? null);

        this.fire(new Event('data', {dataType: 'style'}));
        this.fire(new Event('style.load'));
    }

    private _createLayers() {
        const dereferencedLayers = deref(this.stylesheet.layers);

        // Broadcast layers to workers first, so that expensive style processing (createStyleLayer)
        // can happen in parallel on both main and worker threads.
        this.dispatcher.broadcast(MessageType.setLayers, dereferencedLayers);

        this._order = dereferencedLayers.map((layer) => layer.id);
        this._layers = {};

        // reset serialization field, to be populated only when needed
        this._serializedLayers = null;
        for (const layer of dereferencedLayers) {
            const styledLayer = createStyleLayer(layer);
            styledLayer.setEventedParent(this, {layer: {id: layer.id}});
            this._layers[layer.id] = styledLayer;
        }
    }

    _loadSprite(sprite: SpriteSpecification, isUpdate: boolean = false, completion: (err: Error) => void = undefined) {
        this.imageManager.setLoaded(false);

        this._spriteRequest = new AbortController();
        let err: Error;
        loadSprite(sprite, this.map._requestManager, this.map.getPixelRatio(), this._spriteRequest).then((images) => {
            this._spriteRequest = null;
            if (images) {
                for (const spriteId in images) {
                    this._spritesImagesIds[spriteId] = [];

                    // remove old sprite's loaded images (for the same sprite id) that are not in new sprite
                    const imagesToRemove = this._spritesImagesIds[spriteId] ? this._spritesImagesIds[spriteId].filter(id => !(id in images)) : [];
                    for (const id of imagesToRemove) {
                        this.imageManager.removeImage(id);
                        this._changedImages[id] = true;
                    }

                    for (const id in images[spriteId]) {
                        // don't prefix images of the "default" sprite
                        const imageId = spriteId === 'default' ? id : `${spriteId}:${id}`;
                        // save all the sprite's images' ids to be able to delete them in `removeSprite`
                        this._spritesImagesIds[spriteId].push(imageId);
                        if (imageId in this.imageManager.images) {
                            this.imageManager.updateImage(imageId, images[spriteId][id], false);
                        } else {
                            this.imageManager.addImage(imageId, images[spriteId][id]);
                        }

                        if (isUpdate) {
                            this._changedImages[imageId] = true;
                        }
                    }
                }
            }
        }).catch((error) => {
            this._spriteRequest = null;
            err = error;
            this.fire(new ErrorEvent(err));
        }).finally(() => {
            this.imageManager.setLoaded(true);
            this._availableImages = this.imageManager.listImages();

            if (isUpdate) {
                this._changed = true;
            }

            this.dispatcher.broadcast(MessageType.setImages, this._availableImages);
            this.fire(new Event('data', {dataType: 'style'}));

            if (completion) {
                completion(err);
            }
        });
    }

    _unloadSprite() {
        for (const id of Object.values(this._spritesImagesIds).flat()) {
            this.imageManager.removeImage(id);
            this._changedImages[id] = true;
        }

        this._spritesImagesIds = {};
        this._availableImages = this.imageManager.listImages();
        this._changed = true;
        this.dispatcher.broadcast(MessageType.setImages, this._availableImages);
        this.fire(new Event('data', {dataType: 'style'}));
    }

    _validateLayer(layer: StyleLayer) {
        const sourceCache = this.sourceCaches[layer.source];
        if (!sourceCache) {
            return;
        }

        const sourceLayer = layer.sourceLayer;
        if (!sourceLayer) {
            return;
        }

        const source = sourceCache.getSource();
        if (source.type === 'geojson' || (source.vectorLayerIds && source.vectorLayerIds.indexOf(sourceLayer) === -1)) {
            this.fire(new ErrorEvent(new Error(
                `Source layer "${sourceLayer}" ` +
                `does not exist on source "${source.id}" ` +
                `as specified by style layer "${layer.id}".`
            )));
        }
    }

    loaded() {
        if (!this._loaded)
            return false;

        if (Object.keys(this._updatedSources).length)
            return false;

        for (const id in this.sourceCaches)
            if (!this.sourceCaches[id].loaded())
                return false;

        if (!this.imageManager.isLoaded())
            return false;

        return true;
    }

    /**
     * @hidden
     * take an array of string IDs, and based on this._layers, generate an array of LayerSpecification
     * @param ids - an array of string IDs, for which serialized layers will be generated. If omitted, all serialized layers will be returned
     * @param returnClose - if true, return a clone of the layer object
     * @returns generated result
     */
    private _serializeByIds(ids: Array<string>, returnClone: boolean = false): Array<LayerSpecification> {

        const serializedLayersDictionary = this._serializedAllLayers();
        if (!ids || ids.length === 0) {
            return returnClone ? Object.values(clone(serializedLayersDictionary)) : Object.values(serializedLayersDictionary);
        }

        const serializedLayers = [];
        for (const id of ids) {
            // this check will skip all custom layers
            if (serializedLayersDictionary[id]) {
                const toPush = returnClone ? clone(serializedLayersDictionary[id]) : serializedLayersDictionary[id];
                serializedLayers.push(toPush);
            }
        }

        return serializedLayers;
    }

    /**
     * @hidden
     * Lazy initialization of this._serializedLayers dictionary and return it
     * @returns this._serializedLayers dictionary
     */
    private _serializedAllLayers(): {[_: string]: LayerSpecification} {
        let serializedLayers = this._serializedLayers;
        if (serializedLayers) {
            return serializedLayers;
        }

        serializedLayers = this._serializedLayers = {};
        const allLayerIds: string [] = Object.keys(this._layers);
        for (const layerId of allLayerIds) {
            const layer = this._layers[layerId];
            if (layer.type !== 'custom') {
                serializedLayers[layerId] = layer.serialize();
            }
        }

        return serializedLayers;
    }

    hasTransitions() {
        if (this.light && this.light.hasTransition()) {
            return true;
        }

        if (this.sky && this.sky.hasTransition()) {
            return true;
        }

        for (const id in this.sourceCaches) {
            if (this.sourceCaches[id].hasTransition()) {
                return true;
            }
        }

        for (const id in this._layers) {
            if (this._layers[id].hasTransition()) {
                return true;
            }
        }

        return false;
    }

    _checkLoaded() {
        if (!this._loaded) {
            throw new Error('Style is not done loading.');
        }
    }

    /**
     * @internal
     * Apply queued style updates in a batch and recalculate zoom-dependent paint properties.
     */
    update(parameters: EvaluationParameters) {
        if (!this._loaded) {
            return;
        }

        const changed = this._changed;
        if (changed) {
            const updatedIds = Object.keys(this._updatedLayers);
            const removedIds = Object.keys(this._removedLayers);

            if (updatedIds.length || removedIds.length) {
                this._updateWorkerLayers(updatedIds, removedIds);
            }
            for (const id in this._updatedSources) {
                const action = this._updatedSources[id];

                if (action === 'reload') {
                    this._reloadSource(id);
                } else if (action === 'clear') {
                    this._clearSource(id);
                } else {
                    throw new Error(`Invalid action ${action}`);
                }
            }

            this._updateTilesForChangedImages();
            this._updateTilesForChangedGlyphs();

            for (const id in this._updatedPaintProps) {
                this._layers[id].updateTransitions(parameters);
            }

            this.light.updateTransitions(parameters);
            this.sky.updateTransitions(parameters);

            this._resetUpdates();
        }

        const sourcesUsedBefore = {};

        // save 'used' status to sourcesUsedBefore object and reset all sourceCaches 'used' field to false
        for (const sourceCacheId in this.sourceCaches) {
            const sourceCache = this.sourceCaches[sourceCacheId];

            // sourceCache.used could be undefined, and sourcesUsedBefore[sourceCacheId] is also 'undefined'
            sourcesUsedBefore[sourceCacheId] = sourceCache.used;
            sourceCache.used = false;
        }

        // loop all layers and find layers that are not hidden at parameters.zoom
        // and set used to true in sourceCaches dictionary for the sources of these layers
        for (const layerId of this._order) {
            const layer = this._layers[layerId];

            layer.recalculate(parameters, this._availableImages);
            if (!layer.isHidden(parameters.zoom) && layer.source) {
                this.sourceCaches[layer.source].used = true;
            }
        }

        // cross check sourcesUsedBefore against updated this.sourceCaches dictionary
        // if "used" field is different fire visibility event
        for (const sourcesUsedBeforeId in sourcesUsedBefore) {
            const sourceCache = this.sourceCaches[sourcesUsedBeforeId];

            // (undefine !== false) will evaluate to true and fire an useless visibility event
            // need force "falsy" values to boolean to avoid the case above
            if (!!sourcesUsedBefore[sourcesUsedBeforeId] !== !!sourceCache.used) {
                sourceCache.fire(new Event('data',
                    {
                        sourceDataType: 'visibility',
                        dataType: 'source',
                        sourceId: sourcesUsedBeforeId
                    }));
            }
        }

        this.light.recalculate(parameters);
        this.sky.recalculate(parameters);
        this.z = parameters.zoom;

        if (changed) {
            this.fire(new Event('data', {dataType: 'style'}));
        }
    }

    /*
     * Apply any queued image changes.
     */
    _updateTilesForChangedImages() {
        const changedImages = Object.keys(this._changedImages);
        if (changedImages.length) {
            for (const name in this.sourceCaches) {
                this.sourceCaches[name].reloadTilesForDependencies(['icons', 'patterns'], changedImages);
            }
            this._changedImages = {};
        }
    }

    _updateTilesForChangedGlyphs() {
        if (this._glyphsDidChange) {
            for (const name in this.sourceCaches) {
                this.sourceCaches[name].reloadTilesForDependencies(['glyphs'], ['']);
            }
            this._glyphsDidChange = false;
        }
    }

    _updateWorkerLayers(updatedIds: Array<string>, removedIds: Array<string>) {
        this.dispatcher.broadcast(MessageType.updateLayers, {
            layers: this._serializeByIds(updatedIds, false),
            removedIds
        });
    }

    _resetUpdates() {
        this._changed = false;

        this._updatedLayers = {};
        this._removedLayers = {};

        this._updatedSources = {};
        this._updatedPaintProps = {};

        this._changedImages = {};
        this._glyphsDidChange = false;
    }

    /**
     * Update this style's state to match the given style JSON, performing only
     * the necessary mutations.
     *
     * May throw an Error ('Unimplemented: METHOD') if the mapbox-gl-style-spec
     * diff algorithm produces an operation that is not supported.
     *
     * @returns true if any changes were made; false otherwise
     */
    setState(nextState: StyleSpecification, options: StyleSwapOptions & StyleSetterOptions = {}) {
        this._checkLoaded();

        const serializedStyle =  this.serialize();
        nextState = options.transformStyle ? options.transformStyle(serializedStyle, nextState) : nextState;
        const validate = options.validate ?? true;
        if (validate && emitValidationErrors(this, validateStyle(nextState))) return false;

        nextState = clone(nextState);
        nextState.layers = deref(nextState.layers);

        const changes = diffStyles(serializedStyle, nextState);
        const operations = this._getOperationsToPerform(changes);

        if (operations.unimplemented.length > 0) {
            throw new Error(`Unimplemented: ${operations.unimplemented.join(', ')}.`);
        }

        if (operations.operations.length === 0) {
            return false;
        }

        for (const styleChangeOperation of operations.operations) {
            styleChangeOperation();
        }

        this.stylesheet = nextState;

        // reset serialization field, to be populated only when needed
        this._serializedLayers = null;

        return true;
    }

    _getOperationsToPerform(diff: DiffCommand<DiffOperations>[]) {
        const operations: Function[] = [];
        const unimplemented: string[] = [];
        for (const op of diff) {
            switch (op.command) {
                case 'setCenter':
                case 'setZoom':
                case 'setBearing':
                case 'setPitch':
                case 'setRoll':
                    continue;
                case 'addLayer':
                    operations.push(() => this.addLayer.apply(this, op.args));
                    break;
                case 'removeLayer':
                    operations.push(() => this.removeLayer.apply(this, op.args));
                    break;
                case 'setPaintProperty':
                    operations.push(() => this.setPaintProperty.apply(this, op.args));
                    break;
                case 'setLayoutProperty':
                    operations.push(() => this.setLayoutProperty.apply(this, op.args));
                    break;
                case 'setFilter':
                    operations.push(() => this.setFilter.apply(this, op.args));
                    break;
                case 'addSource':
                    operations.push(() => this.addSource.apply(this, op.args));
                    break;
                case 'removeSource':
                    operations.push(() => this.removeSource.apply(this, op.args));
                    break;
                case 'setLayerZoomRange':
                    operations.push(() => this.setLayerZoomRange.apply(this, op.args));
                    break;
                case 'setLight':
                    operations.push(() => this.setLight.apply(this, op.args));
                    break;
                case 'setGeoJSONSourceData':
                    operations.push(() => this.setGeoJSONSourceData.apply(this, op.args));
                    break;
                case 'setGlyphs':
                    operations.push(() => this.setGlyphs.apply(this, op.args));
                    break;
                case 'setSprite':
                    operations.push(() => this.setSprite.apply(this, op.args));
                    break;
                case 'setTerrain':
                    operations.push(() => this.map.setTerrain.apply(this, op.args));
                    break;
                case 'setSky':
                    operations.push(() => this.setSky.apply(this, op.args));
                    break;
                case 'setProjection':
                    this.setProjection.apply(this, op.args);
                    break;
                case 'setTransition':
                    operations.push(() => {});
                    break;
                default:
                    unimplemented.push(op.command);
                    break;
            }
        }
        return {
            operations,
            unimplemented
        };
    }

    addImage(id: string, image: StyleImage) {
        if (this.getImage(id)) {
            return this.fire(new ErrorEvent(new Error(`An image named "${id}" already exists.`)));
        }
        this.imageManager.addImage(id, image);
        this._afterImageUpdated(id);
    }

    updateImage(id: string, image: StyleImage) {
        this.imageManager.updateImage(id, image);
    }

    getImage(id: string): StyleImage {
        return this.imageManager.getImage(id);
    }

    removeImage(id: string) {
        if (!this.getImage(id)) {
            return this.fire(new ErrorEvent(new Error(`An image named "${id}" does not exist.`)));
        }
        this.imageManager.removeImage(id);
        this._afterImageUpdated(id);
    }

    _afterImageUpdated(id: string) {
        this._availableImages = this.imageManager.listImages();
        this._changedImages[id] = true;
        this._changed = true;
        this.dispatcher.broadcast(MessageType.setImages, this._availableImages);
        this.fire(new Event('data', {dataType: 'style'}));
    }

    listImages() {
        this._checkLoaded();

        return this.imageManager.listImages();
    }

    addSource(id: string, source: SourceSpecification | CanvasSourceSpecification, options: StyleSetterOptions = {}) {
        this._checkLoaded();

        if (this.sourceCaches[id] !== undefined) {
            throw new Error(`Source "${id}" already exists.`);
        }

        if (!source.type) {
            throw new Error(`The type property must be defined, but only the following properties were given: ${Object.keys(source).join(', ')}.`);
        }

        const builtIns = ['vector', 'raster', 'geojson', 'video', 'image'];
        const shouldValidate = builtIns.indexOf(source.type) >= 0;
        if (shouldValidate && this._validate(validateStyle.source, `sources.${id}`, source, null, options)) return;
        if (this.map && this.map._collectResourceTiming) (source as any).collectResourceTiming = true;
        const sourceCache = this.sourceCaches[id] = new SourceCache(id, source, this.dispatcher);
        sourceCache.style = this;
        sourceCache.setEventedParent(this, () => ({
            isSourceLoaded: sourceCache.loaded(),
            source: sourceCache.serialize(),
            sourceId: id
        }));

        sourceCache.onAdd(this.map);
        this._changed = true;
    }

    /**
     * Remove a source from this stylesheet, given its id.
     * @param id - id of the source to remove
     * @throws if no source is found with the given ID
     */
    removeSource(id: string): this {
        this._checkLoaded();

        if (this.sourceCaches[id] === undefined) {
            throw new Error('There is no source with this ID');
        }
        for (const layerId in this._layers) {
            if (this._layers[layerId].source === id) {
                return this.fire(new ErrorEvent(new Error(`Source "${id}" cannot be removed while layer "${layerId}" is using it.`)));
            }
        }

        const sourceCache = this.sourceCaches[id];
        delete this.sourceCaches[id];
        delete this._updatedSources[id];
        sourceCache.fire(new Event('data', {sourceDataType: 'metadata', dataType: 'source', sourceId: id}));
        sourceCache.setEventedParent(null);
        sourceCache.onRemove(this.map);
        this._changed = true;
    }

    /**
     * Set the data of a GeoJSON source, given its id.
     * @param id - id of the source
     * @param data - GeoJSON source
     */
    setGeoJSONSourceData(id: string, data: GeoJSON.GeoJSON | string) {
        this._checkLoaded();

        if (this.sourceCaches[id] === undefined) throw new Error(`There is no source with this ID=${id}`);
        const geojsonSource: GeoJSONSource = (this.sourceCaches[id].getSource() as any);
        if (geojsonSource.type !== 'geojson') throw new Error(`geojsonSource.type is ${geojsonSource.type}, which is !== 'geojson`);

        geojsonSource.setData(data);
        this._changed = true;
    }

    /**
     * Get a source by ID.
     * @param id - ID of the desired source
     * @returns source
     */
    getSource(id: string): Source | undefined {
        return this.sourceCaches[id] && this.sourceCaches[id].getSource();
    }

    /**
     * Add a layer to the map style. The layer will be inserted before the layer with
     * ID `before`, or appended if `before` is omitted.
     * @param layerObject - The style layer to add.
     * @param before - ID of an existing layer to insert before
     * @param options - Style setter options.
     */
    addLayer(layerObject: AddLayerObject, before?: string, options: StyleSetterOptions = {}): this {
        this._checkLoaded();

        const id = layerObject.id;

        if (this.getLayer(id)) {
            this.fire(new ErrorEvent(new Error(`Layer "${id}" already exists on this map.`)));
            return;
        }

        let layer: ReturnType<typeof createStyleLayer>;
        if (layerObject.type === 'custom') {

            if (emitValidationErrors(this, validateCustomStyleLayer(layerObject))) return;

            layer = createStyleLayer(layerObject);

        } else {
            if ('source' in layerObject && typeof layerObject.source === 'object') {
                this.addSource(id, layerObject.source);
                layerObject = clone(layerObject);
                layerObject = extend(layerObject, {source: id});
            }

            // this layer is not in the style.layers array, so we pass an impossible array index
            if (this._validate(validateStyle.layer,
                `layers.${id}`, layerObject, {arrayIndex: -1}, options)) return;

            layer = createStyleLayer(layerObject as LayerSpecification | CustomLayerInterface);
            this._validateLayer(layer);

            layer.setEventedParent(this, {layer: {id}});
        }

        const index = before ? this._order.indexOf(before) : this._order.length;
        if (before && index === -1) {
            this.fire(new ErrorEvent(new Error(`Cannot add layer "${id}" before non-existing layer "${before}".`)));
            return;
        }

        this._order.splice(index, 0, id);
        this._layerOrderChanged = true;

        this._layers[id] = layer;

        if (this._removedLayers[id] && layer.source && layer.type !== 'custom') {
            // If, in the current batch, we have already removed this layer
            // and we are now re-adding it with a different `type`, then we
            // need to clear (rather than just reload) the underlying source's
            // tiles.  Otherwise, tiles marked 'reloading' will have buckets /
            // buffers that are set up for the _previous_ version of this
            // layer, causing, e.g.:
            // https://github.com/mapbox/mapbox-gl-js/issues/3633
            const removed = this._removedLayers[id];
            delete this._removedLayers[id];
            if (removed.type !== layer.type) {
                this._updatedSources[layer.source] = 'clear';
            } else {
                this._updatedSources[layer.source] = 'reload';
                this.sourceCaches[layer.source].pause();
            }
        }
        this._updateLayer(layer);

        if (layer.onAdd) {
            layer.onAdd(this.map);
        }
    }

    /**
     * Moves a layer to a different z-position. The layer will be inserted before the layer with
     * ID `before`, or appended if `before` is omitted.
     * @param id - ID of the layer to move
     * @param before - ID of an existing layer to insert before
     */
    moveLayer(id: string, before?: string) {
        this._checkLoaded();
        this._changed = true;

        const layer = this._layers[id];
        if (!layer) {
            this.fire(new ErrorEvent(new Error(`The layer '${id}' does not exist in the map's style and cannot be moved.`)));
            return;
        }

        if (id === before) {
            return;
        }

        const index = this._order.indexOf(id);
        this._order.splice(index, 1);

        const newIndex = before ? this._order.indexOf(before) : this._order.length;
        if (before && newIndex === -1) {
            this.fire(new ErrorEvent(new Error(`Cannot move layer "${id}" before non-existing layer "${before}".`)));
            return;
        }
        this._order.splice(newIndex, 0, id);

        this._layerOrderChanged = true;
    }

    /**
     * Remove the layer with the given id from the style.
     * A {@link ErrorEvent} event will be fired if no such layer exists.
     *
     * @param id - id of the layer to remove
     */
    removeLayer(id: string) {
        this._checkLoaded();

        const layer = this._layers[id];
        if (!layer) {
            this.fire(new ErrorEvent(new Error(`Cannot remove non-existing layer "${id}".`)));
            return;
        }

        layer.setEventedParent(null);

        const index = this._order.indexOf(id);
        this._order.splice(index, 1);

        this._layerOrderChanged = true;
        this._changed = true;
        this._removedLayers[id] = layer;
        delete this._layers[id];

        if (this._serializedLayers) {
            delete this._serializedLayers[id];
        }
        delete this._updatedLayers[id];
        delete this._updatedPaintProps[id];

        if (layer.onRemove) {
            layer.onRemove(this.map);
        }
    }

    /**
     * Return the style layer object with the given `id`.
     *
     * @param id - id of the desired layer
     * @returns a layer, if one with the given `id` exists
     */
    getLayer(id: string): StyleLayer | undefined {
        return this._layers[id];
    }

    /**
     * Return the ids of all layers currently in the style, including custom layers, in order.
     *
     * @returns ids of layers, in order
     */
    getLayersOrder(): string[] {
        return [...this._order];
    }

    /**
     * Checks if a specific layer is present within the style.
     *
     * @param id - the id of the desired layer
     * @returns a boolean specifying if the given layer is present
     */
    hasLayer(id: string): boolean {
        return id in this._layers;
    }

    setLayerZoomRange(layerId: string, minzoom?: number | null, maxzoom?: number | null) {
        this._checkLoaded();

        const layer = this.getLayer(layerId);
        if (!layer) {
            this.fire(new ErrorEvent(new Error(`Cannot set the zoom range of non-existing layer "${layerId}".`)));
            return;
        }

        if (layer.minzoom === minzoom && layer.maxzoom === maxzoom) return;

        if (minzoom != null) {
            layer.minzoom = minzoom;
        }
        if (maxzoom != null) {
            layer.maxzoom = maxzoom;
        }
        this._updateLayer(layer);
    }

    setFilter(layerId: string, filter?: FilterSpecification | null,  options: StyleSetterOptions = {}) {
        this._checkLoaded();

        const layer = this.getLayer(layerId);
        if (!layer) {
            this.fire(new ErrorEvent(new Error(`Cannot filter non-existing layer "${layerId}".`)));
            return;
        }

        if (deepEqual(layer.filter, filter)) {
            return;
        }

        if (filter === null || filter === undefined) {
            layer.filter = undefined;
            this._updateLayer(layer);
            return;
        }

        if (this._validate(validateStyle.filter, `layers.${layer.id}.filter`, filter, null, options)) {
            return;
        }

        layer.filter = clone(filter);
        this._updateLayer(layer);
    }

    /**
     * Get a layer's filter object
     * @param layer - the layer to inspect
     * @returns the layer's filter, if any
     */
    getFilter(layer: string): FilterSpecification | void {
        return clone(this.getLayer(layer).filter);
    }

    setLayoutProperty(layerId: string, name: string, value: any,  options: StyleSetterOptions = {}) {
        this._checkLoaded();

        const layer = this.getLayer(layerId);
        if (!layer) {
            this.fire(new ErrorEvent(new Error(`Cannot style non-existing layer "${layerId}".`)));
            return;
        }

        if (deepEqual(layer.getLayoutProperty(name), value)) return;

        layer.setLayoutProperty(name, value, options);
        this._updateLayer(layer);
    }

    /**
     * Get a layout property's value from a given layer
     * @param layerId - the layer to inspect
     * @param name - the name of the layout property
     * @returns the property value
     */
    getLayoutProperty(layerId: string, name: string) {
        const layer = this.getLayer(layerId);
        if (!layer) {
            this.fire(new ErrorEvent(new Error(`Cannot get style of non-existing layer "${layerId}".`)));
            return;
        }

        return layer.getLayoutProperty(name);
    }

    setPaintProperty(layerId: string, name: string, value: any, options: StyleSetterOptions = {}) {
        this._checkLoaded();

        const layer = this.getLayer(layerId);
        if (!layer) {
            this.fire(new ErrorEvent(new Error(`Cannot style non-existing layer "${layerId}".`)));
            return;
        }

        if (deepEqual(layer.getPaintProperty(name), value)) return;

        const requiresRelayout = layer.setPaintProperty(name, value, options);
        if (requiresRelayout) {
            this._updateLayer(layer);
        }

        this._changed = true;
        this._updatedPaintProps[layerId] = true;
        // reset serialization field, to be populated only when needed
        this._serializedLayers = null;
    }

    getPaintProperty(layer: string, name: string) {
        return this.getLayer(layer).getPaintProperty(name);
    }

    setFeatureState(target: FeatureIdentifier, state: any) {
        this._checkLoaded();
        const sourceId = target.source;
        const sourceLayer = target.sourceLayer;
        const sourceCache = this.sourceCaches[sourceId];

        if (sourceCache === undefined) {
            this.fire(new ErrorEvent(new Error(`The source '${sourceId}' does not exist in the map's style.`)));
            return;
        }
        const sourceType = sourceCache.getSource().type;
        if (sourceType === 'geojson' && sourceLayer) {
            this.fire(new ErrorEvent(new Error('GeoJSON sources cannot have a sourceLayer parameter.')));
            return;
        }
        if (sourceType === 'vector' && !sourceLayer) {
            this.fire(new ErrorEvent(new Error('The sourceLayer parameter must be provided for vector source types.')));
            return;
        }
        if (target.id === undefined) {
            this.fire(new ErrorEvent(new Error('The feature id parameter must be provided.')));
        }

        sourceCache.setFeatureState(sourceLayer, target.id, state);
    }

    removeFeatureState(target: FeatureIdentifier, key?: string) {
        this._checkLoaded();
        const sourceId = target.source;
        const sourceCache = this.sourceCaches[sourceId];

        if (sourceCache === undefined) {
            this.fire(new ErrorEvent(new Error(`The source '${sourceId}' does not exist in the map's style.`)));
            return;
        }

        const sourceType = sourceCache.getSource().type;
        const sourceLayer = sourceType === 'vector' ? target.sourceLayer : undefined;

        if (sourceType === 'vector' && !sourceLayer) {
            this.fire(new ErrorEvent(new Error('The sourceLayer parameter must be provided for vector source types.')));
            return;
        }

        if (key && (typeof target.id !== 'string' && typeof target.id !== 'number')) {
            this.fire(new ErrorEvent(new Error('A feature id is required to remove its specific state property.')));
            return;
        }

        sourceCache.removeFeatureState(sourceLayer, target.id, key);
    }

    getFeatureState(target: FeatureIdentifier) {
        this._checkLoaded();
        const sourceId = target.source;
        const sourceLayer = target.sourceLayer;
        const sourceCache = this.sourceCaches[sourceId];

        if (sourceCache === undefined) {
            this.fire(new ErrorEvent(new Error(`The source '${sourceId}' does not exist in the map's style.`)));
            return;
        }
        const sourceType = sourceCache.getSource().type;
        if (sourceType === 'vector' && !sourceLayer) {
            this.fire(new ErrorEvent(new Error('The sourceLayer parameter must be provided for vector source types.')));
            return;
        }
        if (target.id === undefined) {
            this.fire(new ErrorEvent(new Error('The feature id parameter must be provided.')));
        }

        return sourceCache.getFeatureState(sourceLayer, target.id);
    }

    getTransition() {
        return extend({duration: 300, delay: 0}, this.stylesheet && this.stylesheet.transition);
    }

    serialize(): StyleSpecification | undefined {
        // We return undefined before we're loaded, following the pattern of Map.getStyle() before
        // the Style object is initialized.
        // Internally, Style._validate() calls Style.serialize() but callers are responsible for
        // calling Style._checkLoaded() first if their validation requires the style to be loaded.
        if (!this._loaded) return;

        const sources = mapObject(this.sourceCaches, (source) => source.serialize());
        const layers = this._serializeByIds(this._order, true);
        const terrain = this.map.getTerrain() || undefined;
        const myStyleSheet = this.stylesheet;

        return filterObject({
            version: myStyleSheet.version,
            name: myStyleSheet.name,
            metadata: myStyleSheet.metadata,
            light: myStyleSheet.light,
            sky: myStyleSheet.sky,
            center: myStyleSheet.center,
            zoom: myStyleSheet.zoom,
            bearing: myStyleSheet.bearing,
            pitch: myStyleSheet.pitch,
            sprite: myStyleSheet.sprite,
            glyphs: myStyleSheet.glyphs,
            transition: myStyleSheet.transition,
            projection: myStyleSheet.projection,
            sources,
            layers,
            terrain
        },
        (value) => { return value !== undefined; });
    }

    _updateLayer(layer: StyleLayer) {
        this._updatedLayers[layer.id] = true;
        if (layer.source && !this._updatedSources[layer.source] &&
            //Skip for raster layers (https://github.com/mapbox/mapbox-gl-js/issues/7865)
            this.sourceCaches[layer.source].getSource().type !== 'raster') {
            this._updatedSources[layer.source] = 'reload';
            this.sourceCaches[layer.source].pause();
        }

        // upon updating, serialized layer dictionary should be reset.
        // When needed, it will be populated with the correct copy again.
        this._serializedLayers = null;
        this._changed = true;
    }

    _flattenAndSortRenderedFeatures(sourceResults: Array<{ [key: string]: Array<{featureIndex: number; feature: MapGeoJSONFeature}> }>) {
        // Feature order is complicated.
        // The order between features in two 2D layers is always determined by layer order.
        // The order between features in two 3D layers is always determined by depth.
        // The order between a feature in a 2D layer and a 3D layer is tricky:
        //      Most often layer order determines the feature order in this case. If
        //      a line layer is above a extrusion layer the line feature will be rendered
        //      above the extrusion. If the line layer is below the extrusion layer,
        //      it will be rendered below it.
        //
        //      There is a weird case though.
        //      You have layers in this order: extrusion_layer_a, line_layer, extrusion_layer_b
        //      Each layer has a feature that overlaps the other features.
        //      The feature in extrusion_layer_a is closer than the feature in extrusion_layer_b so it is rendered above.
        //      The feature in line_layer is rendered above extrusion_layer_a.
        //      This means that that the line_layer feature is above the extrusion_layer_b feature despite
        //      it being in an earlier layer.

        const isLayer3D = layerId => this._layers[layerId].type === 'fill-extrusion';

        const layerIndex = {};
        const features3D = [];
        for (let l = this._order.length - 1; l >= 0; l--) {
            const layerId = this._order[l];
            if (isLayer3D(layerId)) {
                layerIndex[layerId] = l;
                for (const sourceResult of sourceResults) {
                    const layerFeatures = sourceResult[layerId];
                    if (layerFeatures) {
                        for (const featureWrapper of layerFeatures) {
                            features3D.push(featureWrapper);
                        }
                    }
                }
            }
        }

        features3D.sort((a, b) => {
            return b.intersectionZ - a.intersectionZ;
        });

        const features = [];
        for (let l = this._order.length - 1; l >= 0; l--) {
            const layerId = this._order[l];

            if (isLayer3D(layerId)) {
                // add all 3D features that are in or above the current layer
                for (let i = features3D.length - 1; i >= 0; i--) {
                    const topmost3D = features3D[i].feature;
                    if (layerIndex[topmost3D.layer.id] < l) break;
                    features.push(topmost3D);
                    features3D.pop();
                }
            } else {
                for (const sourceResult of sourceResults) {
                    const layerFeatures = sourceResult[layerId];
                    if (layerFeatures) {
                        for (const featureWrapper of layerFeatures) {
                            features.push(featureWrapper.feature);
                        }
                    }
                }
            }
        }

        return features;
    }

    queryRenderedFeatures(queryGeometry: any, params: QueryRenderedFeaturesOptions, transform: IReadonlyTransform) {
        if (params && params.filter) {
            this._validate(validateStyle.filter, 'queryRenderedFeatures.filter', params.filter, null, params);
        }

        const includedSources = {};
        if (params && params.layers) {
            const isArrayOrSet = Array.isArray(params.layers) || params.layers instanceof Set;
            if (!isArrayOrSet) {
                this.fire(new ErrorEvent(new Error('parameters.layers must be an Array or a Set of strings')));
                return [];
            }
            for (const layerId of params.layers) {
                const layer = this._layers[layerId];
                if (!layer) {
                    // this layer is not in the style.layers array
                    this.fire(new ErrorEvent(new Error(`The layer '${layerId}' does not exist in the map's style and cannot be queried for features.`)));
                    return [];
                }
                includedSources[layer.source] = true;
            }
        }

        const sourceResults = [];

        params.availableImages = this._availableImages;

        // LayerSpecification is serialized StyleLayer, and this casting is safe.
        const serializedLayers = this._serializedAllLayers() as {[_: string]: StyleLayer};

        const layersAsSet = params.layers instanceof Set ? params.layers : Array.isArray(params.layers) ? new Set(params.layers) : null;
        const paramsStrict: QueryRenderedFeaturesOptionsStrict = {
            ...params,
            layers: layersAsSet,
        };

        for (const id in this.sourceCaches) {
            if (params.layers && !includedSources[id]) continue;
            sourceResults.push(
                queryRenderedFeatures(
                    this.sourceCaches[id],
                    this._layers,
                    serializedLayers,
                    queryGeometry,
                    paramsStrict,
                    transform)
            );
        }

        if (this.placement) {
            // If a placement has run, query against its CollisionIndex
            // for symbol results, and treat it as an extra source to merge
            sourceResults.push(
                queryRenderedSymbols(
                    this._layers,
                    serializedLayers,
                    this.sourceCaches,
                    queryGeometry,
                    paramsStrict,
                    this.placement.collisionIndex,
                    this.placement.retainedQueryData)
            );
        }

        return this._flattenAndSortRenderedFeatures(sourceResults);
    }

    querySourceFeatures(
        sourceID: string,
        params?: QuerySourceFeatureOptions
    ) {
        if (params && params.filter) {
            this._validate(validateStyle.filter, 'querySourceFeatures.filter', params.filter, null, params);
        }
        const sourceCache = this.sourceCaches[sourceID];
        return sourceCache ? querySourceFeatures(sourceCache, params) : [];
    }

    getLight() {
        return this.light.getLight();
    }

    setLight(lightOptions: LightSpecification, options: StyleSetterOptions = {}) {
        this._checkLoaded();

        const light = this.light.getLight();
        let _update = false;
        for (const key in lightOptions) {
            if (!deepEqual(lightOptions[key], light[key])) {
                _update = true;
                break;
            }
        }
        if (!_update) return;

        const parameters = {
            now: browser.now(),
            transition: extend({
                duration: 300,
                delay: 0
            }, this.stylesheet.transition)
        };

        this.light.setLight(lightOptions, options);
        this.light.updateTransitions(parameters);
    }

    getProjection(): ProjectionSpecification {
        return this.stylesheet.projection;
    }

    setProjection(projection: ProjectionSpecification) {
        this._checkLoaded();
        if (this.projection) {
            if (this.projection.name === projection.type) return;
            this.projection.destroy();
            delete this.projection;
        }
        this.stylesheet.projection = projection;
        this._setProjectionInternal(projection.type);
    }

    getSky(): SkySpecification {
        return this.stylesheet?.sky;
    }

    setSky(skyOptions?: SkySpecification, options: StyleSetterOptions = {}) {
        this._checkLoaded();
        const sky = this.getSky();

        let update = false;
        if (!skyOptions && !sky) return;

        if (skyOptions && !sky) {
            update = true;
        } else if (!skyOptions && sky) {
            update = true;
        } else {
            for (const key in skyOptions) {
                if (!deepEqual(skyOptions[key], sky[key])) {
                    update = true;
                    break;
                }
            }
        }
        if (!update) return;

        const parameters = {
            now: browser.now(),
            transition: extend({
                duration: 300,
                delay: 0
            }, this.stylesheet.transition)
        };

        this.stylesheet.sky = skyOptions;
        this.sky.setSky(skyOptions, options);
        this.sky.updateTransitions(parameters);
    }

    _setProjectionInternal(name: ProjectionSpecification['type']) {
        const projectionObjects = createProjectionFromName(name);
        this.projection = projectionObjects.projection;
        this.map.migrateProjection(projectionObjects.transform, projectionObjects.cameraHelper);
        for (const key in this.sourceCaches) {
            this.sourceCaches[key].reload();
        }
    }

    _validate(validate: Validator, key: string, value: any, props: any, options: {
        validate?: boolean;
    } = {}) {
        if (options && options.validate === false) {
            return false;
        }
        return emitValidationErrors(this, validate.call(validateStyle, extend({
            key,
            style: this.serialize(),
            value,
            styleSpec
        }, props)));
    }

    _remove(mapRemoved: boolean = true) {
        if (this._frameRequest) {
            this._frameRequest.abort();
            this._frameRequest = null;
        }
        if (this._loadStyleRequest) {
            this._loadStyleRequest.abort();
            this._loadStyleRequest = null;
        }
        if (this._spriteRequest) {
            this._spriteRequest.abort();
            this._spriteRequest = null;
        }
        rtlMainThreadPluginFactory().off(RTLPluginLoadedEventName, this._rtlPluginLoaded);
        for (const layerId in this._layers) {
            const layer: StyleLayer = this._layers[layerId];
            layer.setEventedParent(null);
        }
        for (const id in this.sourceCaches) {
            const sourceCache = this.sourceCaches[id];
            sourceCache.setEventedParent(null);
            sourceCache.onRemove(this.map);
        }
        this.imageManager.setEventedParent(null);
        this.setEventedParent(null);
        if (mapRemoved) {
            this.dispatcher.broadcast(MessageType.removeMap, undefined);
        }
        this.dispatcher.remove(mapRemoved);
    }

    _clearSource(id: string) {
        this.sourceCaches[id].clearTiles();
    }

    _reloadSource(id: string) {
        this.sourceCaches[id].resume();
        this.sourceCaches[id].reload();
    }

    _updateSources(transform: ITransform) {
        for (const id in this.sourceCaches) {
            this.sourceCaches[id].update(transform, this.map.terrain);
        }
    }

    _generateCollisionBoxes() {
        for (const id in this.sourceCaches) {
            this._reloadSource(id);
        }
    }

    _updatePlacement(transform: ITransform, showCollisionBoxes: boolean, fadeDuration: number, crossSourceCollisions: boolean, forceFullPlacement: boolean = false) {
        let symbolBucketsChanged = false;
        let placementCommitted = false;

        const layerTiles = {};

        for (const layerID of this._order) {
            const styleLayer = this._layers[layerID];
            if (styleLayer.type !== 'symbol') continue;

            if (!layerTiles[styleLayer.source]) {
                const sourceCache = this.sourceCaches[styleLayer.source];
                layerTiles[styleLayer.source] = sourceCache.getRenderableIds(true)
                    .map((id) => sourceCache.getTileByID(id))
                    .sort((a, b) => (b.tileID.overscaledZ - a.tileID.overscaledZ) || (a.tileID.isLessThan(b.tileID) ? -1 : 1));
            }

            const layerBucketsChanged = this.crossTileSymbolIndex.addLayer(styleLayer, layerTiles[styleLayer.source], transform.center.lng);
            symbolBucketsChanged = symbolBucketsChanged || layerBucketsChanged;
        }
        this.crossTileSymbolIndex.pruneUnusedLayers(this._order);

        // Anything that changes our "in progress" layer and tile indices requires us
        // to start over. When we start over, we do a full placement instead of incremental
        // to prevent starvation.
        // We need to restart placement to keep layer indices in sync.
        // Also force full placement when fadeDuration === 0 to ensure that newly loaded
        // tiles will fully display symbols in their first frame
        forceFullPlacement = forceFullPlacement || this._layerOrderChanged || fadeDuration === 0;

        if (forceFullPlacement || !this.pauseablePlacement || (this.pauseablePlacement.isDone() && !this.placement.stillRecent(browser.now(), transform.zoom))) {
            this.pauseablePlacement = new PauseablePlacement(transform, this.map.terrain, this._order, forceFullPlacement, showCollisionBoxes, fadeDuration, crossSourceCollisions, this.placement);
            this._layerOrderChanged = false;
        }

        if (this.pauseablePlacement.isDone()) {
            // the last placement finished running, but the next one hasn’t
            // started yet because of the `stillRecent` check immediately
            // above, so mark it stale to ensure that we request another
            // render frame
            this.placement.setStale();
        } else {
            this.pauseablePlacement.continuePlacement(this._order, this._layers, layerTiles);

            if (this.pauseablePlacement.isDone()) {
                this.placement = this.pauseablePlacement.commit(browser.now());
                placementCommitted = true;
            }

            if (symbolBucketsChanged) {
                // since the placement gets split over multiple frames it is possible
                // these buckets were processed before they were changed and so the
                // placement is already stale while it is in progress
                this.pauseablePlacement.placement.setStale();
            }
        }

        if (placementCommitted || symbolBucketsChanged) {
            for (const layerID of this._order) {
                const styleLayer = this._layers[layerID];
                if (styleLayer.type !== 'symbol') continue;
                this.placement.updateLayerOpacities(styleLayer, layerTiles[styleLayer.source]);
            }
        }

        // needsRender is false when we have just finished a placement that didn't change the visibility of any symbols
        const needsRerender = !this.pauseablePlacement.isDone() || this.placement.hasTransitions(browser.now());
        return needsRerender;
    }

    _releaseSymbolFadeTiles() {
        for (const id in this.sourceCaches) {
            this.sourceCaches[id].releaseSymbolFadeTiles();
        }
    }

    // Callbacks from web workers

    async getImages(mapId: string | number, params: GetImagesParameters): Promise<GetImagesResponse> {
        const images = await this.imageManager.getImages(params.icons);

        // Apply queued image changes before setting the tile's dependencies so that the tile
        // is not reloaded unnecessarily. Without this forced update the reload could happen in cases
        // like this one:
        // - icons contains "my-image"
        // - imageManager.getImages(...) triggers `onstyleimagemissing`
        // - the user adds "my-image" within the callback
        // - addImage adds "my-image" to this._changedImages
        // - the next frame triggers a reload of this tile even though it already has the latest version
        this._updateTilesForChangedImages();

        const sourceCache = this.sourceCaches[params.source];
        if (sourceCache) {
            sourceCache.setDependencies(params.tileID.key, params.type, params.icons);
        }
        return images;
    }

    async getGlyphs(mapId: string | number, params: GetGlyphsParameters): Promise<GetGlyphsResponse> {
        const glyphs = await this.glyphManager.getGlyphs(params.stacks);
        const sourceCache = this.sourceCaches[params.source];
        if (sourceCache) {
            // we are not setting stacks as dependencies since for now
            // we just need to know which tiles have glyph dependencies
            sourceCache.setDependencies(params.tileID.key, params.type, ['']);
        }
        return glyphs;
    }

    getGlyphsUrl() {
        return this.stylesheet.glyphs || null;
    }

    setGlyphs(glyphsUrl: string | null, options: StyleSetterOptions = {}) {
        this._checkLoaded();
        if (glyphsUrl && this._validate(validateStyle.glyphs, 'glyphs', glyphsUrl, null, options)) {
            return;
        }

        this._glyphsDidChange = true;
        this.stylesheet.glyphs = glyphsUrl;
        this.glyphManager.entries = {};
        this.glyphManager.setURL(glyphsUrl);
    }

    /**
     * Add a sprite.
     *
     * @param id - The id of the desired sprite
     * @param url - The url to load the desired sprite from
     * @param options - The style setter options
     * @param completion - The completion handler
     */
    addSprite(id: string, url: string, options: StyleSetterOptions = {}, completion?: (err: Error) => void) {
        this._checkLoaded();

        const spriteToAdd = [{id, url}];
        const updatedSprite = [
            ...coerceSpriteToArray(this.stylesheet.sprite),
            ...spriteToAdd
        ];

        if (this._validate(validateStyle.sprite, 'sprite', updatedSprite, null, options)) return;

        this.stylesheet.sprite = updatedSprite;
        this._loadSprite(spriteToAdd, true, completion);
    }

    /**
     * Remove a sprite by its id. When the last sprite is removed, the whole `this.stylesheet.sprite` object becomes
     * `undefined`. This falsy `undefined` value later prevents attempts to load the sprite when it's absent.
     *
     * @param id - the id of the sprite to remove
     */
    removeSprite(id: string) {
        this._checkLoaded();

        const internalSpriteRepresentation = coerceSpriteToArray(this.stylesheet.sprite);

        if (!internalSpriteRepresentation.find(sprite => sprite.id === id)) {
            this.fire(new ErrorEvent(new Error(`Sprite "${id}" doesn't exists on this map.`)));
            return;
        }

        if (this._spritesImagesIds[id]) {
            for (const imageId of this._spritesImagesIds[id]) {
                this.imageManager.removeImage(imageId);
                this._changedImages[imageId] = true;
            }
        }

        internalSpriteRepresentation.splice(internalSpriteRepresentation.findIndex(sprite => sprite.id === id), 1);
        this.stylesheet.sprite = internalSpriteRepresentation.length > 0 ? internalSpriteRepresentation : undefined;

        delete this._spritesImagesIds[id];
        this._availableImages = this.imageManager.listImages();
        this._changed = true;
        this.dispatcher.broadcast(MessageType.setImages, this._availableImages);
        this.fire(new Event('data', {dataType: 'style'}));
    }

    /**
     * Get the current sprite value.
     *
     * @returns empty array when no sprite is set; id-url pairs otherwise
     */
    getSprite() {
        return coerceSpriteToArray(this.stylesheet.sprite);
    }

    /**
     * Set a new value for the style's sprite.
     *
     * @param sprite - new sprite value
     * @param options - style setter options
     * @param completion - the completion handler
     */
    setSprite(sprite: SpriteSpecification, options: StyleSetterOptions = {}, completion?: (err: Error) => void) {
        this._checkLoaded();

        if (sprite && this._validate(validateStyle.sprite, 'sprite', sprite, null, options)) {
            return;
        }

        this.stylesheet.sprite = sprite;

        if (sprite) {
            this._loadSprite(sprite, true, completion);
        } else {
            this._unloadSprite();
            if (completion) {
                completion(null);
            }
        }
    }
}
