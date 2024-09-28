import {extend, warnOnce, uniqueId, isImageBitmap, Complete} from '../util/util';
import {browser} from '../util/browser';
import {DOM} from '../util/dom';
import packageJSON from '../../package.json' with {type: 'json'};
import {GetResourceResponse, getJSON} from '../util/ajax';
import {ImageRequest} from '../util/image_request';
import {RequestManager, ResourceType} from '../util/request_manager';
import {Style, StyleSwapOptions} from '../style/style';
import {EvaluationParameters} from '../style/evaluation_parameters';
import {Painter} from '../render/painter';
import {Transform} from '../geo/transform';
import {Hash} from './hash';
import {HandlerManager} from './handler_manager';
import {Camera, CameraOptions, CameraUpdateTransformFunction, FitBoundsOptions} from './camera';
import {LngLat} from '../geo/lng_lat';
import {LngLatBounds} from '../geo/lng_lat_bounds';
import Point from '@mapbox/point-geometry';
import {AttributionControl, AttributionControlOptions, defaultAttributionControlOptions} from './control/attribution_control';
import {LogoControl} from './control/logo_control';
import {RGBAImage} from '../util/image';
import {Event, ErrorEvent, Listener} from '../util/evented';
import {MapEventType, MapLayerEventType, MapMouseEvent, MapSourceDataEvent, MapStyleDataEvent} from './events';
import {TaskQueue} from '../util/task_queue';
import {throttle} from '../util/throttle';
import {webpSupported} from '../util/webp_supported';
import {PerformanceMarkers, PerformanceUtils} from '../util/performance';
import {Source} from '../source/source';
import {StyleLayer} from '../style/style_layer';
import {Terrain} from '../render/terrain';
import {RenderToTexture} from '../render/render_to_texture';
import {config} from '../util/config';
import {defaultLocale} from './default_locale';

import type {RequestTransformFunction} from '../util/request_manager';
import type {LngLatLike} from '../geo/lng_lat';
import type {LngLatBoundsLike} from '../geo/lng_lat_bounds';
import type {AddLayerObject, FeatureIdentifier, StyleOptions, StyleSetterOptions} from '../style/style';
import type {MapDataEvent} from './events';
import type {StyleImage, StyleImageInterface, StyleImageMetadata} from '../style/style_image';
import type {PointLike} from './camera';
import type {ScrollZoomHandler} from './handler/scroll_zoom';
import type {BoxZoomHandler} from './handler/box_zoom';
import type {AroundCenterOptions, TwoFingersTouchPitchHandler} from './handler/two_fingers_touch';
import type {DragRotateHandler} from './handler/shim/drag_rotate';
import type {DragPanHandler, DragPanOptions} from './handler/shim/drag_pan';
import type {CooperativeGesturesHandler, GestureOptions} from './handler/cooperative_gestures';
import type {KeyboardHandler} from './handler/keyboard';
import type {DoubleClickZoomHandler} from './handler/shim/dblclick_zoom';
import type {TwoFingersTouchZoomRotateHandler} from './handler/shim/two_fingers_touch';
import type {TaskID} from '../util/task_queue';
import type {
    FilterSpecification,
    StyleSpecification,
    LightSpecification,
    SourceSpecification,
    TerrainSpecification,
    SkySpecification
} from '@maplibre/maplibre-gl-style-spec';
import type {CanvasSourceSpecification} from '../source/canvas_source';
import type {MapGeoJSONFeature} from '../util/vectortile_to_geojson';
import type {ControlPosition, IControl} from './control/control';
import type {QueryRenderedFeaturesOptions, QuerySourceFeatureOptions} from '../source/query_features';

const version = packageJSON.version;

/**
 * The {@link Map} options object.
 */
export type MapOptions = {
    /**
     * If `true`, the map's position (zoom, center latitude, center longitude, bearing, and pitch) will be synced with the hash fragment of the page's URL.
     * For example, `http://path/to/my/page.html#2.59/39.26/53.07/-24.1/60`.
     * An additional string may optionally be provided to indicate a parameter-styled hash,
     * e.g. http://path/to/my/page.html#map=2.59/39.26/53.07/-24.1/60&foo=bar, where foo
     * is a custom parameter and bar is an arbitrary hash distinct from the map hash.
     * @defaultValue false
     */
    hash?: boolean | string;
    /**
     * If `false`, no mouse, touch, or keyboard listeners will be attached to the map, so it will not respond to interaction.
     * @defaultValue true
     */
    interactive?: boolean;
    /**
     * The HTML element in which MapLibre GL JS will render the map, or the element's string `id`. The specified element must have no children.
     */
    container: HTMLElement | string;
    /**
     * The threshold, measured in degrees, that determines when the map's
     * bearing will snap to north. For example, with a `bearingSnap` of 7, if the user rotates
     * the map within 7 degrees of north, the map will automatically snap to exact north.
     * @defaultValue 7
     */
    bearingSnap?: number;
    /**
     * If set, an {@link AttributionControl} will be added to the map with the provided options.
     * To disable the attribution control, pass `false`.
     * Note: showing the logo of MapLibre is not required for using MapLibre.
     * @defaultValue compact: true, customAttribution: "MapLibre ...".
     */
    attributionControl?: false | AttributionControlOptions;
    /**
     * If `true`, the MapLibre logo will be shown.
     */
    maplibreLogo?: boolean;
    /**
     * A string representing the position of the MapLibre wordmark on the map. Valid options are `top-left`,`top-right`, `bottom-left`, or `bottom-right`.
     * @defaultValue 'bottom-left'
     */
    logoPosition?: ControlPosition;
    /**
     * If `true`, map creation will fail if the performance of MapLibre GL JS would be dramatically worse than expected
     * (i.e. a software renderer would be used).
     * @defaultValue false
     */
    failIfMajorPerformanceCaveat?: boolean;
    /**
     * If `true`, the map's canvas can be exported to a PNG using `map.getCanvas().toDataURL()`. This is `false` by default as a performance optimization.
     * @defaultValue false
     */
    preserveDrawingBuffer?: boolean;
    /**
     * If `true`, the gl context will be created with MSAA antialiasing, which can be useful for antialiasing custom layers.
     * Disabled by default as a performance optimization.
     */
    antialias?: boolean;
    /**
     * If `false`, the map won't attempt to re-request tiles once they expire per their HTTP `cacheControl`/`expires` headers.
     * @defaultValue true
     */
    refreshExpiredTiles?: boolean;
    /**
     * If set, the map will be constrained to the given bounds.
     */
    maxBounds?: LngLatBoundsLike;
    /**
     * If `true`, the "scroll to zoom" interaction is enabled. {@link AroundCenterOptions} are passed as options to {@link ScrollZoomHandler#enable}.
     * @defaultValue true
     */
    scrollZoom?: boolean | AroundCenterOptions;
    /**
     * The minimum zoom level of the map (0-24).
     * @defaultValue 0
     */
    minZoom?: number | null;
    /**
     * The maximum zoom level of the map (0-24).
     * @defaultValue 22
     */
    maxZoom?: number | null;
    /**
     * The minimum pitch of the map (0-85). Values greater than 60 degrees are experimental and may result in rendering issues. If you encounter any, please raise an issue with details in the MapLibre project.
     * @defaultValue 0
     */
    minPitch?: number | null;
    /**
     * The maximum pitch of the map (0-85). Values greater than 60 degrees are experimental and may result in rendering issues. If you encounter any, please raise an issue with details in the MapLibre project.
     * @defaultValue 60
     */
    maxPitch?: number | null;
    /**
     * If `true`, the "box zoom" interaction is enabled (see {@link BoxZoomHandler}).
     * @defaultValue true
     */
    boxZoom?: boolean;
    /**
     * If `true`, the "drag to rotate" interaction is enabled (see {@link DragRotateHandler}).
     * @defaultValue true
     */
    dragRotate?: boolean;
    /**
     * If `true`, the "drag to pan" interaction is enabled. An `Object` value is passed as options to {@link DragPanHandler#enable}.
     * @defaultValue true
     */
    dragPan?: boolean | DragPanOptions;
    /**
     * If `true`, keyboard shortcuts are enabled (see {@link KeyboardHandler}).
     * @defaultValue true
     */
    keyboard?: boolean;
    /**
     * If `true`, the "double click to zoom" interaction is enabled (see {@link DoubleClickZoomHandler}).
     * @defaultValue true
     */
    doubleClickZoom?: boolean;
    /**
     * If `true`, the "pinch to rotate and zoom" interaction is enabled. An `Object` value is passed as options to {@link TwoFingersTouchZoomRotateHandler#enable}.
     * @defaultValue true
     */
    touchZoomRotate?: boolean | AroundCenterOptions;
    /**
     * If `true`, the "drag to pitch" interaction is enabled. An `Object` value is passed as options to {@link TwoFingersTouchPitchHandler#enable}.
     * @defaultValue true
     */
    touchPitch?: boolean | AroundCenterOptions;
    /**
     * If `true` or set to an options object, the map is only accessible on desktop while holding Command/Ctrl and only accessible on mobile with two fingers. Interacting with the map using normal gestures will trigger an informational screen. With this option enabled, "drag to pitch" requires a three-finger gesture. Cooperative gestures are disabled when a map enters fullscreen using {@link FullscreenControl}.
     * @defaultValue false
     */
    cooperativeGestures?: GestureOptions;
    /**
     * If `true`, the map will automatically resize when the browser window resizes.
     * @defaultValue true
     */
    trackResize?: boolean;
    /**
     * The initial geographical centerpoint of the map. If `center` is not specified in the constructor options, MapLibre GL JS will look for it in the map's style object. If it is not specified in the style, either, it will default to `[0, 0]` Note: MapLibre GL JS uses longitude, latitude coordinate order (as opposed to latitude, longitude) to match GeoJSON.
     * @defaultValue [0, 0]
     */
    center?: LngLatLike;
    /**
     * The initial zoom level of the map. If `zoom` is not specified in the constructor options, MapLibre GL JS will look for it in the map's style object. If it is not specified in the style, either, it will default to `0`.
     * @defaultValue 0
     */
    zoom?: number;
    /**
     * The initial bearing (rotation) of the map, measured in degrees counter-clockwise from north. If `bearing` is not specified in the constructor options, MapLibre GL JS will look for it in the map's style object. If it is not specified in the style, either, it will default to `0`.
     * @defaultValue 0
     */
    bearing?: number;
    /**
     * The initial pitch (tilt) of the map, measured in degrees away from the plane of the screen (0-85). If `pitch` is not specified in the constructor options, MapLibre GL JS will look for it in the map's style object. If it is not specified in the style, either, it will default to `0`. Values greater than 60 degrees are experimental and may result in rendering issues. If you encounter any, please raise an issue with details in the MapLibre project.
     * @defaultValue 0
     */
    pitch?: number;
    /**
     * If `true`, multiple copies of the world will be rendered side by side beyond -180 and 180 degrees longitude. If set to `false`:
     *
     * - When the map is zoomed out far enough that a single representation of the world does not fill the map's entire
     * container, there will be blank space beyond 180 and -180 degrees longitude.
     * - Features that cross 180 and -180 degrees longitude will be cut in two (with one portion on the right edge of the
     * map and the other on the left edge of the map) at every zoom level.
     * @defaultValue true
     */
    renderWorldCopies?: boolean;
    /**
     * If `true`, a user may zoom out a single-copy world beyond its bounds until the bounded area is a percent of the viewport size as defined by `underzoom` unless `minZoom` is reached. If  `false`, a user may not zoom out beyond the map bounds.
     * @defaultValue false
     */
    allowUnderzoom?: boolean;
    /**
     * The allowable underzoom of the map, measured as a percentage of the size of the map's bounds relative to the viewport size (0-100). If `underzoom` is not specified in the constructor options, MapLibre GL JS will default to `100`. `allowUnderzoom` must be set `true` for underzooming to occur.
     * @defaultValue 100
     */
    underzoom?: number;
    /**
     * The allowable overpan of the map, measured as a percentage of how far the map's latitude-longitude bounds may be exceed relative to the viewport's height and width (0-100). If `overpan` is not specified in the constructor options, MapLibre GL JS will default to `0`. `allowUnderzoom` must be set `true` for overpanning to occur. `overpan` is exceeded when necessary for underzooming.
     * @defaultValue 0
     */
    overpan?: number;
    /**
     * The maximum number of tiles stored in the tile cache for a given source. If omitted, the cache will be dynamically sized based on the current viewport which can be set using `maxTileCacheZoomLevels` constructor options.
     * @defaultValue null
     */
    maxTileCacheSize?: number | null;
    /**
     * The maximum number of zoom levels for which to store tiles for a given source. Tile cache dynamic size is calculated by multiplying `maxTileCacheZoomLevels` with the approximate number of tiles in the viewport for a given source.
     * @defaultValue 5
     */
    maxTileCacheZoomLevels?: number;
    /**
     * A callback run before the Map makes a request for an external URL. The callback can be used to modify the url, set headers, or set the credentials property for cross-origin requests.
     * Expected to return an object with a `url` property and optionally `headers` and `credentials` properties.
     * @defaultValue null
     */
    transformRequest?: RequestTransformFunction | null;
    /**
     * A callback run before the map's camera is moved due to user input or animation. The callback can be used to modify the new center, zoom, pitch and bearing.
     * Expected to return an object containing center, zoom, pitch or bearing values to overwrite.
     * @defaultValue null
     */
    transformCameraUpdate?: CameraUpdateTransformFunction | null;
    /**
     * A patch to apply to the default localization table for UI strings, e.g. control tooltips. The `locale` object maps namespaced UI string IDs to translated strings in the target language; see `src/ui/default_locale.js` for an example with all supported string IDs. The object may specify all UI strings (thereby adding support for a new translation) or only a subset of strings (thereby patching the default translation table).
     * @defaultValue null
     */
    locale?: any;
    /**
     * Controls the duration of the fade-in/fade-out animation for label collisions after initial map load, in milliseconds. This setting affects all symbol layers. This setting does not affect the duration of runtime styling transitions or raster tile cross-fading.
     * @defaultValue 300
     */
    fadeDuration?: number;
    /**
     * If `true`, symbols from multiple sources can collide with each other during collision detection. If `false`, collision detection is run separately for the symbols in each source.
     * @defaultValue true
     */
    crossSourceCollisions?: boolean;
    /**
     * If `true`, Resource Timing API information will be collected for requests made by GeoJSON and Vector Tile web workers (this information is normally inaccessible from the main Javascript thread). Information will be returned in a `resourceTiming` property of relevant `data` events.
     * @defaultValue false
     */
    collectResourceTiming?: boolean;
    /**
     * The max number of pixels a user can shift the mouse pointer during a click for it to be considered a valid click (as opposed to a mouse drag).
     * @defaultValue 3
     */
    clickTolerance?: number;
    /**
     * The initial bounds of the map. If `bounds` is specified, it overrides `center` and `zoom` constructor options.
     */
    bounds?: LngLatBoundsLike;
    /**
     * A {@link FitBoundsOptions} options object to use _only_ when fitting the initial `bounds` provided above.
     */
    fitBoundsOptions?: FitBoundsOptions;
    /**
     * Defines a CSS
     * font-family for locally overriding generation of Chinese, Japanese, and Korean characters.
     * For these characters, font settings from the map's style will be ignored, except for font-weight keywords (light/regular/medium/bold).
     * Set to `false`, to enable font settings from the map's style for these glyph ranges.
     * The purpose of this option is to avoid bandwidth-intensive glyph server requests. (See [Use locally generated ideographs](https://maplibre.org/maplibre-gl-js/docs/examples/local-ideographs).)
     * @defaultValue 'sans-serif'
     */
    localIdeographFontFamily?: string | false;
    /**
     * The map's MapLibre style. This must be a JSON object conforming to
     * the schema described in the [MapLibre Style Specification](https://maplibre.org/maplibre-style-spec/),
     * or a URL to such JSON.
     * When the style is not specified, calling {@link Map#setStyle} is required to render the map.
     */
    style?: StyleSpecification | string;
    /**
     * If `false`, the map's pitch (tilt) control with "drag to rotate" interaction will be disabled.
     * @defaultValue true
     */
    pitchWithRotate?: boolean;
    /**
     * The pixel ratio.
     * The canvas' `width` attribute will be `container.clientWidth * pixelRatio` and its `height` attribute will be `container.clientHeight * pixelRatio`. Defaults to `devicePixelRatio` if not specified.
     */
    pixelRatio?: number;
    /**
     * If false, style validation will be skipped. Useful in production environment.
     * @defaultValue true
     */
    validateStyle?: boolean;
    /**
     * The canvas' `width` and `height` max size. The values are passed as an array where the first element is max width and the second element is max height.
     * You shouldn't set this above WebGl `MAX_TEXTURE_SIZE`.
     * @defaultValue [4096, 4096].
     */
    maxCanvasSize?: [number, number];
    /**
     * Determines whether to cancel, or retain, tiles from the current viewport which are still loading but which belong to a farther (smaller) zoom level than the current one.
     * * If `true`, when zooming in, tiles which didn't manage to load for previous zoom levels will become canceled. This might save some computing resources for slower devices, but the map details might appear more abruptly at the end of the zoom.
     * * If `false`, when zooming in, the previous zoom level(s) tiles will progressively appear, giving a smoother map details experience. However, more tiles will be rendered in a short period of time.
     * @defaultValue true
     */
    cancelPendingTileRequestsWhileZooming?: boolean;
};

export type AddImageOptions = {

}

// This type is used inside map since all properties are assigned a default value.
export type CompleteMapOptions = Complete<MapOptions>;

type DelegatedListener = {
    layers: string[];
    listener: Listener;
    delegates: {[E in keyof MapEventType]?: Delegate<MapEventType[E]>};
}

type Delegate<E extends Event = Event> = (e: E) => void;

const defaultMinZoom = -2;
const defaultMaxZoom = 22;

// the default values, but also the valid range
const defaultMinPitch = 0;
const defaultMaxPitch = 60;

// use this variable to check maxPitch for validity
const maxPitchThreshold = 85;

const defaultUnderzoom = 80;
const minUnderzoom = 0;
const maxUnderzoom = 100;

const defaultOverpan = 0;
const minOverpan = 0;
const maxOverpan = 50;

const defaultOptions: Readonly<Partial<MapOptions>> = {
    hash: false,
    interactive: true,
    bearingSnap: 7,
    attributionControl: defaultAttributionControlOptions,
    maplibreLogo: false,
    failIfMajorPerformanceCaveat: false,
    preserveDrawingBuffer: false,
    refreshExpiredTiles: true,

    scrollZoom: true,
    minZoom: defaultMinZoom,
    maxZoom: defaultMaxZoom,
    minPitch: defaultMinPitch,
    maxPitch: defaultMaxPitch,

    boxZoom: true,
    dragRotate: true,
    dragPan: true,
    keyboard: true,
    doubleClickZoom: true,
    touchZoomRotate: true,
    touchPitch: true,
    cooperativeGestures: false,

    trackResize: true,

    center: [0, 0],
    zoom: 0,
    bearing: 0,
    pitch: 0,

    renderWorldCopies: true,
    allowUnderzoom: false,
    underzoom: defaultUnderzoom,
    overpan: defaultOverpan,
    maxTileCacheSize: null,
    maxTileCacheZoomLevels: config.MAX_TILE_CACHE_ZOOM_LEVELS,
    transformRequest: null,
    transformCameraUpdate: null,
    fadeDuration: 300,
    crossSourceCollisions: true,
    clickTolerance: 3,
    localIdeographFontFamily: 'sans-serif',
    pitchWithRotate: true,
    validateStyle: true,
    /**Because GL MAX_TEXTURE_SIZE is usually at least 4096px. */
    maxCanvasSize: [4096, 4096],
    cancelPendingTileRequestsWhileZooming: true
};

/**
 * The `Map` object represents the map on your page. It exposes methods
 * and properties that enable you to programmatically change the map,
 * and fires events as users interact with it.
 *
 * You create a `Map` by specifying a `container` and other options, see {@link MapOptions} for the full list.
 * Then MapLibre GL JS initializes the map on the page and returns your `Map` object.
 *
 * @group Main
 *
 * @example
 * ```ts
 * let map = new Map({
 *   container: 'map',
 *   center: [-122.420679, 37.772537],
 *   zoom: 13,
 *   style: style_object,
 *   hash: true,
 *   transformRequest: (url, resourceType)=> {
 *     if(resourceType === 'Source' && url.startsWith('http://myHost')) {
 *       return {
 *        url: url.replace('http', 'https'),
 *        headers: { 'my-custom-header': true},
 *        credentials: 'include'  // Include cookies for cross-origin requests
 *      }
 *     }
 *   }
 * });
 * ```
 * @see [Display a map](https://maplibre.org/maplibre-gl-js/docs/examples/simple-map/)
 */
export class Map extends Camera {
    style: Style;
    painter: Painter;

    _container: HTMLElement;
    _canvasContainer: HTMLElement;
    _controlContainer: HTMLElement;
    _controlPositions: Record<string, HTMLElement>;
    _interactive: boolean;
    _showTileBoundaries: boolean;
    _showCollisionBoxes: boolean;
    _showPadding: boolean;
    _showOverdrawInspector: boolean;
    _repaint: boolean;
    _vertices: boolean;
    _canvas: HTMLCanvasElement;
    _maxTileCacheSize: number | null;
    _maxTileCacheZoomLevels: number;
    _frameRequest: AbortController;
    _styleDirty: boolean;
    _sourcesDirty: boolean;
    _placementDirty: boolean;

    _loaded: boolean;
    _idleTriggered = false;
    // accounts for placement finishing as well
    _fullyLoaded: boolean;
    _trackResize: boolean;
    _resizeObserver: ResizeObserver;
    _preserveDrawingBuffer: boolean;
    _failIfMajorPerformanceCaveat: boolean;
    _antialias: boolean;
    _refreshExpiredTiles: boolean;
    _hash: Hash;
    _delegatedListeners: Record<string, DelegatedListener[]>;
    _fadeDuration: number;
    _crossSourceCollisions: boolean;
    _crossFadingFactor = 1;
    _collectResourceTiming: boolean;
    _renderTaskQueue = new TaskQueue();
    _controls: Array<IControl> = [];
    _mapId = uniqueId();
    _localIdeographFontFamily: string | false;
    _validateStyle: boolean;
    _requestManager: RequestManager;
    _locale: typeof defaultLocale;
    _removed: boolean;
    _clickTolerance: number;
    _overridePixelRatio: number | null | undefined;
    _maxCanvasSize: [number, number];
    _terrainDataCallback: (e: MapStyleDataEvent | MapSourceDataEvent) => void;

    /**
     * @internal
     * image queue throttling handle. To be used later when clean up
     */
    _imageQueueHandle: number;

    /**
     * The map's {@link ScrollZoomHandler}, which implements zooming in and out with a scroll wheel or trackpad.
     * Find more details and examples using `scrollZoom` in the {@link ScrollZoomHandler} section.
     */
    scrollZoom: ScrollZoomHandler;

    /**
     * The map's {@link BoxZoomHandler}, which implements zooming using a drag gesture with the Shift key pressed.
     * Find more details and examples using `boxZoom` in the {@link BoxZoomHandler} section.
     */
    boxZoom: BoxZoomHandler;

    /**
     * The map's {@link DragRotateHandler}, which implements rotating the map while dragging with the right
     * mouse button or with the Control key pressed. Find more details and examples using `dragRotate`
     * in the {@link DragRotateHandler} section.
     */
    dragRotate: DragRotateHandler;

    /**
     * The map's {@link DragPanHandler}, which implements dragging the map with a mouse or touch gesture.
     * Find more details and examples using `dragPan` in the {@link DragPanHandler} section.
     */
    dragPan: DragPanHandler;

    /**
     * The map's {@link KeyboardHandler}, which allows the user to zoom, rotate, and pan the map using keyboard
     * shortcuts. Find more details and examples using `keyboard` in the {@link KeyboardHandler} section.
     */
    keyboard: KeyboardHandler;

    /**
     * The map's {@link DoubleClickZoomHandler}, which allows the user to zoom by double clicking.
     * Find more details and examples using `doubleClickZoom` in the {@link DoubleClickZoomHandler} section.
     */
    doubleClickZoom: DoubleClickZoomHandler;

    /**
     * The map's {@link TwoFingersTouchZoomRotateHandler}, which allows the user to zoom or rotate the map with touch gestures.
     * Find more details and examples using `touchZoomRotate` in the {@link TwoFingersTouchZoomRotateHandler} section.
     */
    touchZoomRotate: TwoFingersTouchZoomRotateHandler;

    /**
     * The map's {@link TwoFingersTouchPitchHandler}, which allows the user to pitch the map with touch gestures.
     * Find more details and examples using `touchPitch` in the {@link TwoFingersTouchPitchHandler} section.
     */
    touchPitch: TwoFingersTouchPitchHandler;

    /**
     * The map's {@link CooperativeGesturesHandler}, which allows the user to see cooperative gesture info when user tries to zoom in/out.
     * Find more details and examples using `cooperativeGestures` in the {@link CooperativeGesturesHandler} section.
     */
    cooperativeGestures: CooperativeGesturesHandler;

    /**
     * The map's property which determines whether to cancel, or retain, tiles from the current viewport which are still loading but which belong to a farther (smaller) zoom level than the current one.
     * * If `true`, when zooming in, tiles which didn't manage to load for previous zoom levels will become canceled. This might save some computing resources for slower devices, but the map details might appear more abruptly at the end of the zoom.
     * * If `false`, when zooming in, the previous zoom level(s) tiles will progressively appear, giving a smoother map details experience. However, more tiles will be rendered in a short period of time.
     * @defaultValue true
     */
    cancelPendingTileRequestsWhileZooming: boolean;

    constructor(options: MapOptions) {
        PerformanceUtils.mark(PerformanceMarkers.create);

        const resolvedOptions = {...defaultOptions, ...options} as CompleteMapOptions;

        if (resolvedOptions.minZoom != null && resolvedOptions.maxZoom != null && resolvedOptions.minZoom > resolvedOptions.maxZoom) {
            throw new Error('maxZoom must be greater than or equal to minZoom');
        }

        if (resolvedOptions.minPitch != null && resolvedOptions.maxPitch != null && resolvedOptions.minPitch > resolvedOptions.maxPitch) {
            throw new Error('maxPitch must be greater than or equal to minPitch');
        }

        if (resolvedOptions.minPitch != null && resolvedOptions.minPitch < defaultMinPitch) {
            throw new Error(`minPitch must be greater than or equal to ${defaultMinPitch}`);
        }

        if (resolvedOptions.maxPitch != null && resolvedOptions.maxPitch > maxPitchThreshold) {
            throw new Error(`maxPitch must be less than or equal to ${maxPitchThreshold}`);
        }

        const transform = new Transform(resolvedOptions.minZoom, resolvedOptions.maxZoom, resolvedOptions.minPitch, resolvedOptions.maxPitch, resolvedOptions.renderWorldCopies, resolvedOptions.allowUnderzoom, resolvedOptions.underzoom, resolvedOptions.overpan);
        super(transform, {bearingSnap: resolvedOptions.bearingSnap});

        this._interactive = resolvedOptions.interactive;
        this._maxTileCacheSize = resolvedOptions.maxTileCacheSize;
        this._maxTileCacheZoomLevels = resolvedOptions.maxTileCacheZoomLevels;
        this._failIfMajorPerformanceCaveat = resolvedOptions.failIfMajorPerformanceCaveat === true;
        this._preserveDrawingBuffer = resolvedOptions.preserveDrawingBuffer === true;
        this._antialias = resolvedOptions.antialias === true;
        this._trackResize = resolvedOptions.trackResize === true;
        this._bearingSnap = resolvedOptions.bearingSnap;
        this._refreshExpiredTiles = resolvedOptions.refreshExpiredTiles === true;
        this._fadeDuration = resolvedOptions.fadeDuration;
        this._crossSourceCollisions = resolvedOptions.crossSourceCollisions === true;
        this._collectResourceTiming = resolvedOptions.collectResourceTiming === true;
        this._locale = {...defaultLocale, ...resolvedOptions.locale};
        this._clickTolerance = resolvedOptions.clickTolerance;
        this._overridePixelRatio = resolvedOptions.pixelRatio;
        this._maxCanvasSize = resolvedOptions.maxCanvasSize;
        this.transformCameraUpdate = resolvedOptions.transformCameraUpdate;
        this.cancelPendingTileRequestsWhileZooming = resolvedOptions.cancelPendingTileRequestsWhileZooming === true;

        this._imageQueueHandle = ImageRequest.addThrottleControl(() => this.isMoving());

        this._requestManager = new RequestManager(resolvedOptions.transformRequest);

        if (typeof resolvedOptions.container === 'string') {
            this._container = document.getElementById(resolvedOptions.container);
            if (!this._container) {
                throw new Error(`Container '${resolvedOptions.container}' not found.`);
            }
        } else if (resolvedOptions.container instanceof HTMLElement) {
            this._container = resolvedOptions.container;
        } else {
            throw new Error('Invalid type: \'container\' must be a String or HTMLElement.');
        }

        if (resolvedOptions.maxBounds) {
            this.setMaxBounds(resolvedOptions.maxBounds);
        }

        this._setupContainer();
        this._setupPainter();

        this.on('move', () => this._update(false))
            .on('moveend', () => this._update(false))
            .on('zoom', () => this._update(true))
            .on('terrain', () => {
                this.painter.terrainFacilitator.dirty = true;
                this._update(true);
            })
            .once('idle', () => { this._idleTriggered = true; });

        if (typeof window !== 'undefined') {
            addEventListener('online', this._onWindowOnline, false);
            let initialResizeEventCaptured = false;
            const throttledResizeCallback = throttle((entries: ResizeObserverEntry[]) => {
                if (this._trackResize && !this._removed) {
                    this.resize(entries);
                    this.redraw();
                }
            }, 50);
            this._resizeObserver = new ResizeObserver((entries) => {
                if (!initialResizeEventCaptured) {
                    initialResizeEventCaptured = true;
                    return;
                }
                throttledResizeCallback(entries);
            });
            this._resizeObserver.observe(this._container);
        }

        this.handlers = new HandlerManager(this, resolvedOptions);

        const hashName = (typeof resolvedOptions.hash === 'string' && resolvedOptions.hash) || undefined;
        this._hash = resolvedOptions.hash && (new Hash(hashName)).addTo(this);
        // don't set position from options if set through hash
        if (!this._hash || !this._hash._onHashChange()) {
            this.jumpTo({
                center: resolvedOptions.center,
                zoom: resolvedOptions.zoom,
                bearing: resolvedOptions.bearing,
                pitch: resolvedOptions.pitch
            });

            if (resolvedOptions.bounds) {
                this.resize();
                this.fitBounds(resolvedOptions.bounds, extend({}, resolvedOptions.fitBoundsOptions, {duration: 0}));
            }
        }

        this.resize();

        this._localIdeographFontFamily = resolvedOptions.localIdeographFontFamily;
        this._validateStyle = resolvedOptions.validateStyle;

        if (resolvedOptions.style) this.setStyle(resolvedOptions.style, {localIdeographFontFamily: resolvedOptions.localIdeographFontFamily});

        if (resolvedOptions.attributionControl)
            this.addControl(new AttributionControl(typeof resolvedOptions.attributionControl === 'boolean' ? undefined : resolvedOptions.attributionControl));

        if (resolvedOptions.maplibreLogo)
            this.addControl(new LogoControl(), resolvedOptions.logoPosition);

        this.on('style.load', () => {
            if (this.transform.unmodified) {
                this.jumpTo(this.style.stylesheet as any);
            }
        });
        this.on('data', (event: MapDataEvent) => {
            this._update(event.dataType === 'style');
            this.fire(new Event(`${event.dataType}data`, event));
        });
        this.on('dataloading', (event: MapDataEvent) => {
            this.fire(new Event(`${event.dataType}dataloading`, event));
        });
        this.on('dataabort', (event: MapDataEvent) => {
            this.fire(new Event('sourcedataabort', event));
        });
    }

    /**
     * @internal
     * Returns a unique number for this map instance which is used for the MapLoadEvent
     * to make sure we only fire one event per instantiated map object.
     * @returns the uniq map ID
     */
    _getMapId() {
        return this._mapId;
    }

    /**
     * Adds an {@link IControl} to the map, calling `control.onAdd(this)`.
     *
     * An {@link ErrorEvent} will be fired if the image parameter is invald.
     *
     * @param control - The {@link IControl} to add.
     * @param position - position on the map to which the control will be added.
     * Valid values are `'top-left'`, `'top-right'`, `'bottom-left'`, and `'bottom-right'`. Defaults to `'top-right'`.
     * @example
     * Add zoom and rotation controls to the map.
     * ```ts
     * map.addControl(new NavigationControl());
     * ```
     * @see [Display map navigation controls](https://maplibre.org/maplibre-gl-js/docs/examples/navigation/)
     */
    addControl(control: IControl, position?: ControlPosition): Map {
        if (position === undefined) {
            if (control.getDefaultPosition) {
                position = control.getDefaultPosition();
            } else {
                position = 'top-right';
            }
        }
        if (!control || !control.onAdd) {
            return this.fire(new ErrorEvent(new Error(
                'Invalid argument to map.addControl(). Argument must be a control with onAdd and onRemove methods.')));
        }
        const controlElement = control.onAdd(this);
        this._controls.push(control);

        const positionContainer = this._controlPositions[position];
        if (position.indexOf('bottom') !== -1) {
            positionContainer.insertBefore(controlElement, positionContainer.firstChild);
        } else {
            positionContainer.appendChild(controlElement);
        }
        return this;
    }

    /**
     * Removes the control from the map.
     *
     * An {@link ErrorEvent} will be fired if the image parameter is invald.
     *
     * @param control - The {@link IControl} to remove.
     * @example
     * ```ts
     * // Define a new navigation control.
     * let navigation = new NavigationControl();
     * // Add zoom and rotation controls to the map.
     * map.addControl(navigation);
     * // Remove zoom and rotation controls from the map.
     * map.removeControl(navigation);
     * ```
     */
    removeControl(control: IControl): Map {
        if (!control || !control.onRemove) {
            return this.fire(new ErrorEvent(new Error(
                'Invalid argument to map.removeControl(). Argument must be a control with onAdd and onRemove methods.')));
        }
        const ci = this._controls.indexOf(control);
        if (ci > -1) this._controls.splice(ci, 1);
        control.onRemove(this);
        return this;
    }

    /**
     * Checks if a control exists on the map.
     *
     * @param control - The {@link IControl} to check.
     * @returns true if map contains control.
     * @example
     * ```ts
     * // Define a new navigation control.
     * let navigation = new NavigationControl();
     * // Add zoom and rotation controls to the map.
     * map.addControl(navigation);
     * // Check that the navigation control exists on the map.
     * map.hasControl(navigation);
     * ```
     */
    hasControl(control: IControl): boolean {
        return this._controls.indexOf(control) > -1;
    }

    calculateCameraOptionsFromTo(from: LngLat, altitudeFrom: number, to: LngLat, altitudeTo?: number): CameraOptions {
        if (altitudeTo == null && this.terrain) {
            altitudeTo = this.terrain.getElevationForLngLatZoom(to, this.transform.tileZoom);
        }
        return super.calculateCameraOptionsFromTo(from, altitudeFrom, to, altitudeTo);
    }

    /**
     * Resizes the map according to the dimensions of its
     * `container` element.
     *
     * Checks if the map container size changed and updates the map if it has changed.
     * This method must be called after the map's `container` is resized programmatically
     * or when the map is shown after being initially hidden with CSS.
     *
     * Triggers the following events: `movestart`, `move`, `moveend`, and `resize`.
     *
     * @param eventData - Additional properties to be passed to `movestart`, `move`, `resize`, and `moveend`
     * events that get triggered as a result of resize. This can be useful for differentiating the
     * source of an event (for example, user-initiated or programmatically-triggered events).
     * @example
     * Resize the map when the map container is shown after being initially hidden with CSS.
     * ```ts
     * let mapDiv = document.getElementById('map');
     * if (mapDiv.style.visibility === true) map.resize();
     * ```
     */
    resize(eventData?: any): Map {
        const dimensions = this._containerDimensions();
        const width = dimensions[0];
        const height = dimensions[1];

        const clampedPixelRatio = this._getClampedPixelRatio(width, height);
        this._resizeCanvas(width, height, clampedPixelRatio);
        this.painter.resize(width, height, clampedPixelRatio);

        // check if we've reached GL limits, in that case further clamps pixelRatio
        if (this.painter.overLimit()) {
            const gl = this.painter.context.gl;
            // store updated _maxCanvasSize value
            this._maxCanvasSize = [gl.drawingBufferWidth, gl.drawingBufferHeight];
            const clampedPixelRatio = this._getClampedPixelRatio(width, height);
            this._resizeCanvas(width, height, clampedPixelRatio);
            this.painter.resize(width, height, clampedPixelRatio);
        }

        this.transform.resize(width, height);
        this._requestedCameraState?.resize(width, height);

        const fireMoving = !this._moving;
        if (fireMoving) {
            this.stop();
            this.fire(new Event('movestart', eventData))
                .fire(new Event('move', eventData));
        }

        this.fire(new Event('resize', eventData));

        if (fireMoving) this.fire(new Event('moveend', eventData));

        return this;
    }

    /**
     * @internal
     * Return the map's pixel ratio eventually scaled down to respect maxCanvasSize.
     * Internally you should use this and not getPixelRatio().
     */
    _getClampedPixelRatio(width: number, height: number): number {
        const {0: maxCanvasWidth, 1: maxCanvasHeight} = this._maxCanvasSize;
        const pixelRatio = this.getPixelRatio();

        const canvasWidth = width * pixelRatio;
        const canvasHeight = height * pixelRatio;

        const widthScaleFactor = canvasWidth > maxCanvasWidth ? (maxCanvasWidth / canvasWidth) : 1;
        const heightScaleFactor = canvasHeight > maxCanvasHeight ? (maxCanvasHeight / canvasHeight) : 1;

        return Math.min(widthScaleFactor, heightScaleFactor) * pixelRatio;
    }

    /**
     * Returns the map's pixel ratio.
     * Note that the pixel ratio actually applied may be lower to respect maxCanvasSize.
     * @returns The pixel ratio.
     */
    getPixelRatio(): number {
        return this._overridePixelRatio ?? devicePixelRatio;
    }

    /**
     * Sets the map's pixel ratio. This allows to override `devicePixelRatio`.
     * After this call, the canvas' `width` attribute will be `container.clientWidth * pixelRatio`
     * and its height attribute will be `container.clientHeight * pixelRatio`.
     * Set this to null to disable `devicePixelRatio` override.
     * Note that the pixel ratio actually applied may be lower to respect maxCanvasSize.
     * @param pixelRatio - The pixel ratio.
     */
    setPixelRatio(pixelRatio: number) {
        this._overridePixelRatio = pixelRatio;
        this.resize();
    }

    /**
     * Returns the map's geographical bounds. When the bearing or pitch is non-zero, the visible region is not
     * an axis-aligned rectangle, and the result is the smallest bounds that encompasses the visible region.
     * @returns The geographical bounds of the map as {@link LngLatBounds}.
     * @example
     * ```ts
     * let bounds = map.getBounds();
     * ```
     */
    getBounds(): LngLatBounds {
        return this.transform.getBounds();
    }

    /**
     * Returns the maximum geographical bounds the map is constrained to, or `null` if none set.
     * @returns The map object.
     * @example
     * ```ts
     * let maxBounds = map.getMaxBounds();
     * ```
     */
    getMaxBounds(): LngLatBounds | null {
        return this.transform.getMaxBounds();
    }

    /**
     * Sets or clears the map's geographical bounds.
     *
     * Pan and zoom operations are constrained within these bounds.
     * If a pan or zoom is performed that would
     * display regions outside these bounds, the map will
     * instead display a position and zoom level
     * as close as possible to the operation's request while still
     * remaining within the bounds.
     *
     * @param bounds - The maximum bounds to set. If `null` or `undefined` is provided, the function removes the map's maximum bounds.
     * @example
     * Define bounds that conform to the `LngLatBoundsLike` object as set the max bounds.
     * ```ts
     * let bounds = [
     *   [-74.04728, 40.68392], // [west, south]
     *   [-73.91058, 40.87764]  // [east, north]
     * ];
     * map.setMaxBounds(bounds);
     * ```
     */
    setMaxBounds(bounds?: LngLatBoundsLike | null): Map {
        this.transform.setMaxBounds(LngLatBounds.convert(bounds));
        return this._update();
    }

    /**
     * Sets or clears the map's minimum zoom level.
     * If the map's current zoom level is lower than the new minimum,
     * the map will zoom to the new minimum.
     *
     * It is not always possible to zoom out and reach the set `minZoom`.
     * Other factors such as map height may restrict zooming. For example,
     * if the map is 512px tall it will not be possible to zoom below zoom 0
     * no matter what the `minZoom` is set to.
     *
     * A {@link ErrorEvent} event will be fired if minZoom is out of bounds.
     *
     * @param minZoom - The minimum zoom level to set (-2 - 24).
     * If `null` or `undefined` is provided, the function removes the current minimum zoom (i.e. sets it to -2).
     * @example
     * ```ts
     * map.setMinZoom(12.25);
     * ```
     */
    setMinZoom(minZoom?: number | null): Map {

        minZoom = minZoom === null || minZoom === undefined ? defaultMinZoom : minZoom;

        if (minZoom >= defaultMinZoom && minZoom <= this.transform.maxZoom) {
            this.transform.minZoom = minZoom;
            this._update();

            if (this.getZoom() < minZoom) this.setZoom(minZoom);

            return this;

        } else throw new Error(`minZoom must be between ${defaultMinZoom} and the current maxZoom, inclusive`);
    }

    /**
     * Returns the map's minimum allowable zoom level.
     *
     * @returns minZoom
     * @example
     * ```ts
     * let minZoom = map.getMinZoom();
     * ```
     */
    getMinZoom(): number { return this.transform.minZoom; }

    /**
     * Sets or clears the map's maximum zoom level.
     * If the map's current zoom level is higher than the new maximum,
     * the map will zoom to the new maximum.
     *
     * A {@link ErrorEvent} event will be fired if minZoom is out of bounds.
     *
     * @param maxZoom - The maximum zoom level to set.
     * If `null` or `undefined` is provided, the function removes the current maximum zoom (sets it to 22).
     * @example
     * ```ts
     * map.setMaxZoom(18.75);
     * ```
     */
    setMaxZoom(maxZoom?: number | null): Map {

        maxZoom = maxZoom === null || maxZoom === undefined ? defaultMaxZoom : maxZoom;

        if (maxZoom >= this.transform.minZoom) {
            this.transform.maxZoom = maxZoom;
            this._update();

            if (this.getZoom() > maxZoom) this.setZoom(maxZoom);

            return this;

        } else throw new Error('maxZoom must be greater than the current minZoom');
    }

    /**
     * Returns the map's maximum allowable zoom level.
     *
     * @returns The maxZoom
     * @example
     * ```ts
     * let maxZoom = map.getMaxZoom();
     * ```
     */
    getMaxZoom(): number { return this.transform.maxZoom; }

    /**
     * Sets or clears the map's minimum pitch.
     * If the map's current pitch is lower than the new minimum,
     * the map will pitch to the new minimum.
     *
     * A {@link ErrorEvent} event will be fired if minPitch is out of bounds.
     *
     * @param minPitch - The minimum pitch to set (0-85). Values greater than 60 degrees are experimental and may result in rendering issues. If you encounter any, please raise an issue with details in the MapLibre project.
     * If `null` or `undefined` is provided, the function removes the current minimum pitch (i.e. sets it to 0).
     */
    setMinPitch(minPitch?: number | null): Map {

        minPitch = minPitch === null || minPitch === undefined ? defaultMinPitch : minPitch;

        if (minPitch < defaultMinPitch) {
            throw new Error(`minPitch must be greater than or equal to ${defaultMinPitch}`);
        }

        if (minPitch >= defaultMinPitch && minPitch <= this.transform.maxPitch) {
            this.transform.minPitch = minPitch;
            this._update();

            if (this.getPitch() < minPitch) this.setPitch(minPitch);

            return this;

        } else throw new Error(`minPitch must be between ${defaultMinPitch} and the current maxPitch, inclusive`);
    }

    /**
     * Returns the map's minimum allowable pitch.
     *
     * @returns The minPitch
     */
    getMinPitch(): number { return this.transform.minPitch; }

    /**
     * Sets or clears the map's maximum pitch.
     * If the map's current pitch is higher than the new maximum,
     * the map will pitch to the new maximum.
     *
     * A {@link ErrorEvent} event will be fired if maxPitch is out of bounds.
     *
     * @param maxPitch - The maximum pitch to set (0-85). Values greater than 60 degrees are experimental and may result in rendering issues. If you encounter any, please raise an issue with details in the MapLibre project.
     * If `null` or `undefined` is provided, the function removes the current maximum pitch (sets it to 60).
     */
    setMaxPitch(maxPitch?: number | null): Map {

        maxPitch = maxPitch === null || maxPitch === undefined ? defaultMaxPitch : maxPitch;

        if (maxPitch > maxPitchThreshold) {
            throw new Error(`maxPitch must be less than or equal to ${maxPitchThreshold}`);
        }

        if (maxPitch >= this.transform.minPitch) {
            this.transform.maxPitch = maxPitch;
            this._update();

            if (this.getPitch() > maxPitch) this.setPitch(maxPitch);

            return this;

        } else throw new Error('maxPitch must be greater than the current minPitch');
    }

    /**
     * Returns the map's maximum allowable pitch.
     *
     * @returns The maxPitch
     */
    getMaxPitch(): number { return this.transform.maxPitch; }

    /**
     * Returns the state of `renderWorldCopies`. If `true`, multiple copies of the world will be rendered side by side beyond -180 and 180 degrees longitude. If set to `false`:
     *
     * - When the map is zoomed out far enough that a single representation of the world does not fill the map's entire
     * container, there will be blank space beyond 180 and -180 degrees longitude.
     * - Features that cross 180 and -180 degrees longitude will be cut in two (with one portion on the right edge of the
     * map and the other on the left edge of the map) at every zoom level.
     * @returns The renderWorldCopies
     * @example
     * ```ts
     * let worldCopiesRendered = map.getRenderWorldCopies();
     * ```
     * @see [Render world copies](https://maplibre.org/maplibre-gl-js/docs/examples/render-world-copies/)
     */
    getRenderWorldCopies(): boolean { return this.transform.renderWorldCopies; }

    /**
     * Sets the state of `renderWorldCopies`.
     *
     * @param renderWorldCopies - If `true`, multiple copies of the world will be rendered side by side beyond -180 and 180 degrees longitude. If set to `false`:
     *
     * - When the map is zoomed out far enough that a single representation of the world does not fill the map's entire
     * container, there will be blank space beyond 180 and -180 degrees longitude.
     * - Features that cross 180 and -180 degrees longitude will be cut in two (with one portion on the right edge of the
     * map and the other on the left edge of the map) at every zoom level.
     *
     * `undefined` is treated as `true`, `null` is treated as `false`.
     * @example
     * ```ts
     * map.setRenderWorldCopies(true);
     * ```
     * @see [Render world copies](https://maplibre.org/maplibre-gl-js/docs/examples/render-world-copies/)
     */
    setRenderWorldCopies(renderWorldCopies?: boolean | null): Map {
        this.transform.renderWorldCopies = renderWorldCopies;
        return this._update();
    }

    /**
     * Returns the state of `allowUnderzoom`.
     * If `true`, a user may zoom out a single-copy world beyond its bounds
     * until the bounded area is a percent of the viewport size as defined by
     * `underzoom` unless `minZoom` is reached.
     * If `false`, a user may not zoom out beyond the map bounds.
     *
     * @returns The allowUnderzoom
     * @example
     * ```ts
     * let worldUnderzoomAllowed = map.getAllowUnderzoom();
     * ```
     */
    getAllowUnderzoom(): boolean { return this.transform.allowUnderzoom; }

    /**
     * Sets the state of `allowUnderzoom`.
     *
     * @param allowUnderzoom - If `true`, a user may zoom out a single-copy
     * world beyond its bounds until the bounded area is a percent of the
     * viewport size as defined by `underzoom` unless `minZoom` is reached.
     * If `false`, a user may not zoom out beyond the map bounds.
     *
     * `undefined` is treated as `true`, `null` is treated as `false`.
     * @example
     * ```ts
     * map.setAllowUnderzoom(true);
     * ```
     */
    setAllowUnderzoom(allowUnderzoom?: boolean | null): Map {
        this.transform.allowUnderzoom = allowUnderzoom;
        return this._update();
    }

    /**
     * Returns the map's allowable underzoom percentage.
     *
     * @returns underzoom
     * @example
     * ```ts
     * let underzoom = map.getUnderzoom();
     * ```
     */
    getUnderzoom(): number { return this.transform.underzoom; }

    /**
     * Sets or clears the map's allowable underzoom percentage.
     *
     * `allowUnderzoom` must be `true` for underzooming to occur.
     *
     * If the map is currently zoomed out to a size lower than the new
     * underzoom, the map will zoom in to respect the new underzoom.
     *
     * `minZoom` is always respected, meaning if the map is already at
     * `minZoom = 0` but the map is larger than the allowable underzoom size,
     * it is not possible to zoom out any further.
     *
     * A {@link ErrorEvent} event will be fired if underzoom is out of bounds.
     *
     * @param underzoom - The allowable underzoom percentage to set (0 - 100).
     * If `null` or `undefined` is provided, the function removes the current
     * underzoom and sets it to the default (80).
     * @example
     * ```ts
     * map.setUnderzoom(25);
     * ```
     */
    setUnderzoom(underzoom?: number | null): Map {

        underzoom = underzoom === null || underzoom === undefined ? defaultUnderzoom : underzoom;

        if (underzoom > maxUnderzoom) {
            throw new Error(`underzoom must be less than or equal to ${maxUnderzoom}`);
        } else if (underzoom < minUnderzoom) {
            throw new Error(`underzoom must be greater than or equal to ${minUnderzoom}`);
        }

        this.transform.underzoom = underzoom;
        return this._update();
    }

    /**
     * Returns the map's allowable overpan percentage.
     *
     * @returns overpan
     * @example
     * ```ts
     * let overpan = map.getOverpan();
     * ```
     */
    getOverpan(): number { return this.transform.overpan; }

    /**
     * Sets or clears the map's allowable overpan percentage.
     *
     * `allowUnderzoom` must be `true` for overpanning to occur.
     *
     * If the map is underzoomed such that the bounds must exceed `overpan`, the
     * map will allow that.
     *
     * A {@link ErrorEvent} event will be fired if overpan is out of bounds.
     *
     * @param overpan - The allowable overpan percentage to set (0 - 50).
     * If `null` or `undefined` is provided, the function removes the current
     * overpan and sets it to the default (0).
     * @example
     * ```ts
     * map.setOverpan(25);
     * ```
     */
    setOverpan(overpan?: number | null): Map {

        overpan = overpan === null || overpan === undefined ? defaultOverpan : overpan;

        if (overpan > maxOverpan) {
            throw new Error(`overpan must be less than or equal to ${maxOverpan}`);
        } else if (overpan < minOverpan) {
            throw new Error(`overpan must be greater than or equal to ${minOverpan}`);
        }

        this.transform.overpan = overpan;
        return this._update();
    }

    /**
     * Returns a [Point](https://github.com/mapbox/point-geometry) representing pixel coordinates, relative to the map's `container`,
     * that correspond to the specified geographical location.
     *
     * @param lnglat - The geographical location to project.
     * @returns The [Point](https://github.com/mapbox/point-geometry) corresponding to `lnglat`, relative to the map's `container`.
     * @example
     * ```ts
     * let coordinate = [-122.420679, 37.772537];
     * let point = map.project(coordinate);
     * ```
     */
    project(lnglat: LngLatLike): Point {
        return this.transform.locationPoint(LngLat.convert(lnglat), this.style && this.terrain);
    }

    /**
     * Returns a {@link LngLat} representing geographical coordinates that correspond
     * to the specified pixel coordinates.
     *
     * @param point - The pixel coordinates to unproject.
     * @returns The {@link LngLat} corresponding to `point`.
     * @example
     * ```ts
     * map.on('click', (e) => {
     *   // When the map is clicked, get the geographic coordinate.
     *   let coordinate = map.unproject(e.point);
     * });
     * ```
     */
    unproject(point: PointLike): LngLat {
        return this.transform.pointLocation(Point.convert(point), this.terrain);
    }

    /**
     * Returns true if the map is panning, zooming, rotating, or pitching due to a camera animation or user gesture.
     * @returns true if the map is moving.
     * @example
     * ```ts
     * let isMoving = map.isMoving();
     * ```
     */
    isMoving(): boolean {
        return this._moving || this.handlers?.isMoving();
    }

    /**
     * Returns true if the map is zooming due to a camera animation or user gesture.
     * @returns true if the map is zooming.
     * @example
     * ```ts
     * let isZooming = map.isZooming();
     * ```
     */
    isZooming(): boolean {
        return this._zooming || this.handlers?.isZooming();
    }

    /**
     * Returns true if the map is rotating due to a camera animation or user gesture.
     * @returns true if the map is rotating.
     * @example
     * ```ts
     * map.isRotating();
     * ```
     */
    isRotating(): boolean {
        return this._rotating || this.handlers?.isRotating();
    }

    _createDelegatedListener(type: keyof MapEventType | string, layerIds: string[], listener: Listener): DelegatedListener {
        if (type === 'mouseenter' || type === 'mouseover') {
            let mousein = false;
            const mousemove = (e) => {
                const existingLayers = layerIds.filter((layerId) => this.getLayer(layerId));
                const features = existingLayers.length !== 0 ? this.queryRenderedFeatures(e.point, {layers: existingLayers}) : [];
                if (!features.length) {
                    mousein = false;
                } else if (!mousein) {
                    mousein = true;
                    listener.call(this, new MapMouseEvent(type, this, e.originalEvent, {features}));
                }
            };
            const mouseout = () => {
                mousein = false;
            };
            return {layers: layerIds, listener, delegates: {mousemove, mouseout}};
        } else if (type === 'mouseleave' || type === 'mouseout') {
            let mousein = false;
            const mousemove = (e) => {
                const existingLayers = layerIds.filter((layerId) => this.getLayer(layerId));
                const features = existingLayers.length !== 0 ? this.queryRenderedFeatures(e.point, {layers: existingLayers}) : [];
                if (features.length) {
                    mousein = true;
                } else if (mousein) {
                    mousein = false;
                    listener.call(this, new MapMouseEvent(type, this, e.originalEvent));
                }
            };
            const mouseout = (e) => {
                if (mousein) {
                    mousein = false;
                    listener.call(this, new MapMouseEvent(type, this, e.originalEvent));
                }
            };
            return {layers: layerIds, listener, delegates: {mousemove, mouseout}};
        } else {
            const delegate = (e) => {
                const existingLayers = layerIds.filter((layerId) => this.getLayer(layerId));
                const features = existingLayers.length !== 0 ? this.queryRenderedFeatures(e.point, {layers: existingLayers}) : [];
                if (features.length) {
                    // Here we need to mutate the original event, so that preventDefault works as expected.
                    e.features = features;
                    listener.call(this, e);
                    delete e.features;
                }
            };
            return {layers: layerIds, listener, delegates: {[type]: delegate}};
        }
    }

    _saveDelegatedListener(type: keyof MapEventType | string, delegatedListener: DelegatedListener): void {
        this._delegatedListeners = this._delegatedListeners || {};
        this._delegatedListeners[type] = this._delegatedListeners[type] || [];
        this._delegatedListeners[type].push(delegatedListener);
    }

    _removeDelegatedListener(type: string, layerIds: string[], listener: Listener) {
        if (!this._delegatedListeners || !this._delegatedListeners[type]) {
            return;
        }

        const listeners = this._delegatedListeners[type];
        for (let i = 0; i < listeners.length; i++) {
            const delegatedListener = listeners[i];
            if (
                delegatedListener.listener === listener &&
                delegatedListener.layers.length === layerIds.length &&
                delegatedListener.layers.every((layerId: string) => layerIds.includes(layerId))
            ) {
                for (const event in delegatedListener.delegates) {
                    this.off(event, delegatedListener.delegates[event]);
                }
                listeners.splice(i, 1);
                return;
            }
        }
    }

    /**
     * @event
     * Adds a listener for events of a specified type, optionally limited to features in a specified style layer(s).
     * See {@link MapEventType} and {@link MapLayerEventType} for a full list of events and their description.
     *
     * | Event                  | Compatible with `layerId` |
     * |------------------------|---------------------------|
     * | `mousedown`            | yes                       |
     * | `mouseup`              | yes                       |
     * | `mouseover`            | yes                       |
     * | `mouseout`             | yes                       |
     * | `mousemove`            | yes                       |
     * | `mouseenter`           | yes (required)            |
     * | `mouseleave`           | yes (required)            |
     * | `click`                | yes                       |
     * | `dblclick`             | yes                       |
     * | `contextmenu`          | yes                       |
     * | `touchstart`           | yes                       |
     * | `touchend`             | yes                       |
     * | `touchcancel`          | yes                       |
     * | `wheel`                |                           |
     * | `resize`               |                           |
     * | `remove`               |                           |
     * | `touchmove`            |                           |
     * | `movestart`            |                           |
     * | `move`                 |                           |
     * | `moveend`              |                           |
     * | `dragstart`            |                           |
     * | `drag`                 |                           |
     * | `dragend`              |                           |
     * | `zoomstart`            |                           |
     * | `zoom`                 |                           |
     * | `zoomend`              |                           |
     * | `rotatestart`          |                           |
     * | `rotate`               |                           |
     * | `rotateend`            |                           |
     * | `pitchstart`           |                           |
     * | `pitch`                |                           |
     * | `pitchend`             |                           |
     * | `boxzoomstart`         |                           |
     * | `boxzoomend`           |                           |
     * | `boxzoomcancel`        |                           |
     * | `webglcontextlost`     |                           |
     * | `webglcontextrestored` |                           |
     * | `load`                 |                           |
     * | `render`               |                           |
     * | `idle`                 |                           |
     * | `error`                |                           |
     * | `data`                 |                           |
     * | `styledata`            |                           |
     * | `sourcedata`           |                           |
     * | `dataloading`          |                           |
     * | `styledataloading`     |                           |
     * | `sourcedataloading`    |                           |
     * | `styleimagemissing`    |                           |
     * | `dataabort`            |                           |
     * | `sourcedataabort`      |                           |
     *
     * @param type - The event type to listen for. Events compatible with the optional `layerId` parameter are triggered
     * when the cursor enters a visible portion of the specified layer from outside that layer or outside the map canvas.
     * @param layer - The ID of a style layer or a listener if no ID is provided. Event will only be triggered if its location
     * is within a visible feature in this layer. The event will have a `features` property containing
     * an array of the matching features. If `layer` is not supplied, the event will not have a `features` property.
     * Please note that many event types are not compatible with the optional `layer` parameter.
     * @param listener - The function to be called when the event is fired.
     * @example
     * ```ts
     * // Set an event listener that will fire
     * // when the map has finished loading
     * map.on('load', () => {
     *   // Once the map has finished loading,
     *   // add a new layer
     *   map.addLayer({
     *     id: 'points-of-interest',
     *     source: {
     *       type: 'vector',
     *       url: 'https://maplibre.org/maplibre-style-spec/'
     *     },
     *     'source-layer': 'poi_label',
     *     type: 'circle',
     *     paint: {
     *       // MapLibre Style Specification paint properties
     *     },
     *     layout: {
     *       // MapLibre Style Specification layout properties
     *     }
     *   });
     * });
     * ```
     * @example
     * ```ts
     * // Set an event listener that will fire
     * // when a feature on the countries layer of the map is clicked
     * map.on('click', 'countries', (e) => {
     *   new Popup()
     *     .setLngLat(e.lngLat)
     *     .setHTML(`Country name: ${e.features[0].properties.name}`)
     *     .addTo(map);
     * });
     * ```
     * @see [Display popup on click](https://maplibre.org/maplibre-gl-js/docs/examples/popup-on-click/)
     * @see [Center the map on a clicked symbol](https://maplibre.org/maplibre-gl-js/docs/examples/center-on-symbol/)
     * @see [Create a hover effect](https://maplibre.org/maplibre-gl-js/docs/examples/hover-styles/)
     * @see [Create a draggable marker](https://maplibre.org/maplibre-gl-js/docs/examples/drag-a-point/)
     */
    on<T extends keyof MapLayerEventType>(
        type: T,
        layer: string,
        listener: (ev: MapLayerEventType[T] & Object) => void,
    ): Map;
    /**
     * Overload of the `on` method that allows to listen to events specifying multiple layers.
     * @event
     * @param type - The type of the event.
     * @param layerIds - The array of style layer IDs.
     * @param listener - The listener callback.
     */
    on<T extends keyof MapLayerEventType>(
        type: T,
        layerIds: string[],
        listener: (ev: MapLayerEventType[T] & Object) => void
    ): this;
    /**
     * Overload of the `on` method that allows to listen to events without specifying a layer.
     * @event
     * @param type - The type of the event.
     * @param listener - The listener callback.
     */
    on<T extends keyof MapEventType>(type: T, listener: (ev: MapEventType[T] & Object) => void): this;
    /**
     * Overload of the `on` method that allows to listen to events without specifying a layer.
     * @event
     * @param type - The type of the event.
     * @param listener - The listener callback.
     */
    on(type: keyof MapEventType | string, listener: Listener): this;
    on(type: keyof MapEventType | string, layerIdsOrListener: string | string[] | Listener, listener?: Listener): this {
        if (listener === undefined) {
            return super.on(type, layerIdsOrListener as Listener);
        }

        const layerIds = typeof layerIdsOrListener === 'string' ? [layerIdsOrListener] : layerIdsOrListener as string[];

        const delegatedListener = this._createDelegatedListener(type, layerIds, listener);

        this._saveDelegatedListener(type, delegatedListener);

        for (const event in delegatedListener.delegates) {
            this.on(event, delegatedListener.delegates[event]);
        }

        return this;
    }

    /**
     * Adds a listener that will be called only once to a specified event type, optionally limited to features in a specified style layer.
     *
     * @event
     * @param type - The event type to listen for; one of `'mousedown'`, `'mouseup'`, `'click'`, `'dblclick'`,
     * `'mousemove'`, `'mouseenter'`, `'mouseleave'`, `'mouseover'`, `'mouseout'`, `'contextmenu'`, `'touchstart'`,
     * `'touchend'`, or `'touchcancel'`. `mouseenter` and `mouseover` events are triggered when the cursor enters
     * a visible portion of the specified layer from outside that layer or outside the map canvas. `mouseleave`
     * and `mouseout` events are triggered when the cursor leaves a visible portion of the specified layer, or leaves
     * the map canvas.
     * @param layer - The ID of a style layer or a listener if no ID is provided. Only events whose location is within a visible
     * feature in this layer will trigger the listener. The event will have a `features` property containing
     * an array of the matching features.
     * @param listener - The function to be called when the event is fired.
     * @returns `this` if listener is provided, promise otherwise to allow easier usage of async/await
     */
    once<T extends keyof MapLayerEventType>(
        type: T,
        layer: string,
        listener?: (ev: MapLayerEventType[T] & Object) => void,
    ): this | Promise<MapLayerEventType[T] & Object>;
    /**
     * Overload of the `once` method that allows to listen to events specifying multiple layers.
     * @event
     * @param type - The type of the event.
     * @param layerIds - The array of style layer IDs.
     * @param listener - The listener callback.
     */
    once<T extends keyof MapLayerEventType>(
        type: T,
        layerIds: string[],
        listener?: (ev: MapLayerEventType[T] & Object) => void
    ): this | Promise<any>;
    /**
     * Overload of the `once` method that allows to listen to events without specifying a layer.
     * @event
     * @param type - The type of the event.
     * @param listener - The listener callback.
     */
    once<T extends keyof MapEventType>(type: T, listener?: (ev: MapEventType[T] & Object) => void): this | Promise<any>;
    /**
     * Overload of the `once` method that allows to listen to events without specifying a layer.
     * @event
     * @param type - The type of the event.
     * @param listener - The listener callback.
     */
    once(type: keyof MapEventType | string, listener?: Listener): this | Promise<any>;
    once(type: keyof MapEventType | string, layerIdsOrListener: string | string[] | Listener, listener?: Listener): this | Promise<any> {
        if (listener === undefined) {
            return super.once(type, layerIdsOrListener as Listener);
        }

        const layerIds = typeof layerIdsOrListener === 'string' ? [layerIdsOrListener] : layerIdsOrListener as string[];

        const delegatedListener = this._createDelegatedListener(type, layerIds, listener);

        for (const key in delegatedListener.delegates) {
            const delegate: Delegate = delegatedListener.delegates[key];
            delegatedListener.delegates[key] = (...args: Parameters<Delegate>) => {
                this._removeDelegatedListener(type, layerIds, listener);
                delegate(...args);
            };
        }

        this._saveDelegatedListener(type, delegatedListener);

        for (const event in delegatedListener.delegates) {
            this.once(event, delegatedListener.delegates[event]);
        }

        return this;
    }

    /**
     * Removes an event listener for events previously added with `Map#on`.
     *
     * @event
     * @param type - The event type previously used to install the listener.
     * @param layer - The layer ID or listener previously used to install the listener.
     * @param listener - The function previously installed as a listener.
     */
    off<T extends keyof MapLayerEventType>(
        type: T,
        layer: string,
        listener: (ev: MapLayerEventType[T] & Object) => void,
    ): this;
    /**
     * Overload of the `off` method that allows to remove an event created with multiple layers.
     * Provide the same layer IDs as to `on` or `once`, when the listener was registered.
     * @event
     * @param type - The type of the event.
     * @param layers - The layer IDs previously used to install the listener.
     * @param listener - The function previously installed as a listener.
     */
    off<T extends keyof MapLayerEventType>(
        type: T,
        layers: string[],
        listener: (ev: MapLayerEventType[T] & Object) => void,
    ): this;
    /**
     * Overload of the `off` method that allows to remove an event created without specifying a layer.
     * @event
     * @param type - The type of the event.
     * @param listener - The function previously installed as a listener.
     */
    off<T extends keyof MapEventType>(type: T, listener: (ev: MapEventType[T] & Object) => void): this;
    /**
     * Overload of the `off` method that allows to remove an event created without specifying a layer.
     * @event
     * @param type - The type of the event.
     * @param listener - The function previously installed as a listener.
     */
    off(type: keyof MapEventType | string, listener: Listener): this;
    off(type: keyof MapEventType | string, layerIdsOrListener: string | string[] | Listener, listener?: Listener): this {
        if (listener === undefined) {
            return super.off(type, layerIdsOrListener as Listener);
        }

        const layerIds = typeof layerIdsOrListener === 'string' ? [layerIdsOrListener] : layerIdsOrListener as string[];
        this._removeDelegatedListener(type, layerIds, listener);

        return this;
    }

    /**
     * Returns an array of MapGeoJSONFeature objects
     * representing visible features that satisfy the query parameters.
     *
     * @param geometryOrOptions - (optional) The geometry of the query region:
     * either a single point or southwest and northeast points describing a bounding box.
     * Omitting this parameter (i.e. calling {@link Map#queryRenderedFeatures} with zero arguments,
     * or with only a `options` argument) is equivalent to passing a bounding box encompassing the entire
     * map viewport.
     * The geometryOrOptions can receive a {@link QueryRenderedFeaturesOptions} only to support a situation where the function receives only one parameter which is the options parameter.
     * @param options - (optional) Options object.
     *
     * @returns An array of MapGeoJSONFeature objects.
     *
     * The `properties` value of each returned feature object contains the properties of its source feature. For GeoJSON sources, only
     * string and numeric property values are supported (i.e. `null`, `Array`, and `Object` values are not supported).
     *
     * Each feature includes top-level `layer`, `source`, and `sourceLayer` properties. The `layer` property is an object
     * representing the style layer to  which the feature belongs. Layout and paint properties in this object contain values
     * which are fully evaluated for the given zoom level and feature.
     *
     * Only features that are currently rendered are included. Some features will **not** be included, like:
     *
     * - Features from layers whose `visibility` property is `"none"`.
     * - Features from layers whose zoom range excludes the current zoom level.
     * - Symbol features that have been hidden due to text or icon collision.
     *
     * Features from all other layers are included, including features that may have no visible
     * contribution to the rendered result; for example, because the layer's opacity or color alpha component is set to
     * 0.
     *
     * The topmost rendered feature appears first in the returned array, and subsequent features are sorted by
     * descending z-order. Features that are rendered multiple times (due to wrapping across the antemeridian at low
     * zoom levels) are returned only once (though subject to the following caveat).
     *
     * Because features come from tiled vector data or GeoJSON data that is converted to tiles internally, feature
     * geometries may be split or duplicated across tile boundaries and, as a result, features may appear multiple
     * times in query results. For example, suppose there is a highway running through the bounding rectangle of a query.
     * The results of the query will be those parts of the highway that lie within the map tiles covering the bounding
     * rectangle, even if the highway extends into other tiles, and the portion of the highway within each map tile
     * will be returned as a separate feature. Similarly, a point feature near a tile boundary may appear in multiple
     * tiles due to tile buffering.
     *
     * @example
     * Find all features at a point
     * ```ts
     * let features = map.queryRenderedFeatures(
     *   [20, 35],
     *   { layers: ['my-layer-name'] }
     * );
     * ```
     *
     * @example
     * Find all features within a static bounding box
     * ```ts
     * let features = map.queryRenderedFeatures(
     *   [[10, 20], [30, 50]],
     *   { layers: ['my-layer-name'] }
     * );
     * ```
     *
     * @example
     * Find all features within a bounding box around a point
     * ```ts
     * let width = 10;
     * let height = 20;
     * let features = map.queryRenderedFeatures([
     *   [point.x - width / 2, point.y - height / 2],
     *   [point.x + width / 2, point.y + height / 2]
     * ], { layers: ['my-layer-name'] });
     * ```
     *
     * @example
     * Query all rendered features from a single layer
     * ```ts
     * let features = map.queryRenderedFeatures({ layers: ['my-layer-name'] });
     * ```
     * @see [Get features under the mouse pointer](https://maplibre.org/maplibre-gl-js/docs/examples/queryrenderedfeatures/)
     */
    queryRenderedFeatures(geometryOrOptions?: PointLike | [PointLike, PointLike] | QueryRenderedFeaturesOptions, options?: QueryRenderedFeaturesOptions): MapGeoJSONFeature[] {
        if (!this.style) {
            return [];
        }
        let queryGeometry;
        const isGeometry = geometryOrOptions instanceof Point || Array.isArray(geometryOrOptions);
        const geometry = isGeometry ? geometryOrOptions : [[0, 0], [this.transform.width, this.transform.height]];
        options = options || (isGeometry ? {} : geometryOrOptions) || {};

        if (geometry instanceof Point || typeof geometry[0] === 'number') {
            queryGeometry = [Point.convert(geometry as PointLike)];
        } else {
            const tl = Point.convert(geometry[0] as PointLike);
            const br = Point.convert(geometry[1] as PointLike);
            queryGeometry = [tl, new Point(br.x, tl.y), br, new Point(tl.x, br.y), tl];
        }

        return this.style.queryRenderedFeatures(queryGeometry, options, this.transform);
    }

    /**
     * Returns an array of MapGeoJSONFeature objects
     * representing features within the specified vector tile or GeoJSON source that satisfy the query parameters.
     *
     * @param sourceId - The ID of the vector tile or GeoJSON source to query.
     * @param parameters - The options object.
     * @returns An array of MapGeoJSONFeature objects.
     *
     * In contrast to {@link Map#queryRenderedFeatures}, this function returns all features matching the query parameters,
     * whether or not they are rendered by the current style (i.e. visible). The domain of the query includes all currently-loaded
     * vector tiles and GeoJSON source tiles: this function does not check tiles outside the currently
     * visible viewport.
     *
     * Because features come from tiled vector data or GeoJSON data that is converted to tiles internally, feature
     * geometries may be split or duplicated across tile boundaries and, as a result, features may appear multiple
     * times in query results. For example, suppose there is a highway running through the bounding rectangle of a query.
     * The results of the query will be those parts of the highway that lie within the map tiles covering the bounding
     * rectangle, even if the highway extends into other tiles, and the portion of the highway within each map tile
     * will be returned as a separate feature. Similarly, a point feature near a tile boundary may appear in multiple
     * tiles due to tile buffering.
     *
     * @example
     * Find all features in one source layer in a vector source
     * ```ts
     * let features = map.querySourceFeatures('your-source-id', {
     *   sourceLayer: 'your-source-layer'
     * });
     * ```
     *
     */
    querySourceFeatures(sourceId: string, parameters?: QuerySourceFeatureOptions | null): MapGeoJSONFeature[] {
        return this.style.querySourceFeatures(sourceId, parameters);
    }

    /**
     * Updates the map's MapLibre style object with a new value.
     *
     * If a style is already set when this is used and options.diff is set to true, the map renderer will attempt to compare the given style
     * against the map's current state and perform only the changes necessary to make the map style match the desired state. Changes in sprites
     * (images used for icons and patterns) and glyphs (fonts for label text) **cannot** be diffed. If the sprites or fonts used in the current
     * style and the given style are different in any way, the map renderer will force a full update, removing the current style and building
     * the given one from scratch.
     *
     *
     * @param style - A JSON object conforming to the schema described in the
     * [MapLibre Style Specification](https://maplibre.org/maplibre-style-spec/), or a URL to such JSON.
     * @param options - The options object.
     *
     * @example
     * ```ts
     * map.setStyle("https://demotiles.maplibre.org/style.json");
     *
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
    setStyle(style: StyleSpecification | string | null, options?: StyleSwapOptions & StyleOptions): this {
        options = extend({},
            {
                localIdeographFontFamily: this._localIdeographFontFamily,
                validate: this._validateStyle
            }, options);

        if ((options.diff !== false && options.localIdeographFontFamily === this._localIdeographFontFamily) && this.style && style) {
            this._diffStyle(style, options);
            return this;
        } else {
            this._localIdeographFontFamily = options.localIdeographFontFamily;
            return this._updateStyle(style, options);
        }
    }

    /**
     *  Updates the requestManager's transform request with a new function
     *
     * @param transformRequest - A callback run before the Map makes a request for an external URL. The callback can be used to modify the url, set headers, or set the credentials property for cross-origin requests.
     * Expected to return an object with a `url` property and optionally `headers` and `credentials` properties
     *
     * @example
     * ```ts
     * map.setTransformRequest((url: string, resourceType: string) => {});
     * ```
     */
    setTransformRequest(transformRequest: RequestTransformFunction): this {
        this._requestManager.setTransformRequest(transformRequest);
        return this;
    }

    _getUIString(key: keyof typeof defaultLocale) {
        const str = this._locale[key];
        if (str == null) {
            throw new Error(`Missing UI string '${key}'`);
        }

        return str;
    }

    _updateStyle(style: StyleSpecification | string | null, options?: StyleSwapOptions & StyleOptions) {
        // transformStyle relies on having previous style serialized, if it is not loaded yet, delay _updateStyle until previous style is loaded
        if (options.transformStyle && this.style && !this.style._loaded) {
            this.style.once('style.load', () => this._updateStyle(style, options));
            return;
        }

        const previousStyle = this.style && options.transformStyle ? this.style.serialize() : undefined;
        if (this.style) {
            this.style.setEventedParent(null);

            // Only release workers when map is getting disposed
            this.style._remove(!style);
        }

        if (!style) {
            delete this.style;
            return this;
        } else {
            this.style = new Style(this, options || {});
        }

        this.style.setEventedParent(this, {style: this.style});

        if (typeof style === 'string') {
            this.style.loadURL(style, options, previousStyle);
        } else {
            this.style.loadJSON(style, options, previousStyle);
        }

        return this;
    }

    _lazyInitEmptyStyle() {
        if (!this.style) {
            this.style = new Style(this, {});
            this.style.setEventedParent(this, {style: this.style});
            this.style.loadEmpty();
        }
    }

    _diffStyle(style: StyleSpecification | string, options?: StyleSwapOptions & StyleOptions) {
        if (typeof style === 'string') {
            const url = style;
            const request = this._requestManager.transformRequest(url, ResourceType.Style);
            getJSON<StyleSpecification>(request, new AbortController()).then((response) => {
                this._updateDiff(response.data, options);
            }).catch((error) => {
                if (error) {
                    this.fire(new ErrorEvent(error));
                }
            });
        } else if (typeof style === 'object') {
            this._updateDiff(style, options);
        }
    }

    _updateDiff(style: StyleSpecification, options?: StyleSwapOptions & StyleOptions) {
        try {
            if (this.style.setState(style, options)) {
                this._update(true);
            }
        } catch (e) {
            warnOnce(
                `Unable to perform style diff: ${e.message || e.error || e}.  Rebuilding the style from scratch.`
            );
            this._updateStyle(style, options);
        }
    }

    /**
     * Returns the map's MapLibre style object, a JSON object which can be used to recreate the map's style.
     *
     * @returns The map's style JSON object.
     *
     * @example
     * ```ts
     * let styleJson = map.getStyle();
     * ```
     *
     */
    getStyle(): StyleSpecification {
        if (this.style) {
            return this.style.serialize();
        }
    }

    /**
     * Returns a Boolean indicating whether the map's style is fully loaded.
     *
     * @returns A Boolean indicating whether the style is fully loaded.
     *
     * @example
     * ```ts
     * let styleLoadStatus = map.isStyleLoaded();
     * ```
     */
    isStyleLoaded(): boolean | void {
        if (!this.style) return warnOnce('There is no style added to the map.');
        return this.style.loaded();
    }

    /**
     * Adds a source to the map's style.
     *
     * Events triggered:
     *
     * Triggers the `source.add` event.
     *
     * @param id - The ID of the source to add. Must not conflict with existing sources.
     * @param source - The source object, conforming to the
     * MapLibre Style Specification's [source definition](https://maplibre.org/maplibre-style-spec/sources) or
     * {@link CanvasSourceSpecification}.
     * @example
     * ```ts
     * map.addSource('my-data', {
     *   type: 'vector',
     *   url: 'https://demotiles.maplibre.org/tiles/tiles.json'
     * });
     * ```
     * @example
     * ```ts
     * map.addSource('my-data', {
     *   "type": "geojson",
     *   "data": {
     *     "type": "Feature",
     *     "geometry": {
     *       "type": "Point",
     *       "coordinates": [-77.0323, 38.9131]
     *     },
     *     "properties": {
     *       "title": "Mapbox DC",
     *       "marker-symbol": "monument"
     *     }
     *   }
     * });
     * ```
     * @see GeoJSON source: [Add live realtime data](https://maplibre.org/maplibre-gl-js/docs/examples/live-geojson/)
     */
    addSource(id: string, source: SourceSpecification | CanvasSourceSpecification): this {
        this._lazyInitEmptyStyle();
        this.style.addSource(id, source);
        return this._update(true);
    }

    /**
     * Returns a Boolean indicating whether the source is loaded. Returns `true` if the source with
     * the given ID in the map's style has no outstanding network requests, otherwise `false`.
     *
     * A {@link ErrorEvent} event will be fired if there is no source wit the specified ID.
     *
     * @param id - The ID of the source to be checked.
     * @returns A Boolean indicating whether the source is loaded.
     * @example
     * ```ts
     * let sourceLoaded = map.isSourceLoaded('bathymetry-data');
     * ```
     */
    isSourceLoaded(id: string): boolean {
        const source = this.style && this.style.sourceCaches[id];
        if (source === undefined) {
            this.fire(new ErrorEvent(new Error(`There is no source with ID '${id}'`)));
            return;
        }
        return source.loaded();
    }

    /**
     * Loads a 3D terrain mesh, based on a "raster-dem" source.
     *
     * Triggers the `terrain` event.
     *
     * @param options - Options object.
     * @example
     * ```ts
     * map.setTerrain({ source: 'terrain' });
     * ```
     */
    setTerrain(options: TerrainSpecification | null): this {
        this.style._checkLoaded();

        // clear event handlers
        if (this._terrainDataCallback) this.style.off('data', this._terrainDataCallback);

        if (!options) {
            // remove terrain
            if (this.terrain) this.terrain.sourceCache.destruct();
            this.terrain = null;
            if (this.painter.renderToTexture) this.painter.renderToTexture.destruct();
            this.painter.renderToTexture = null;
            this.transform.minElevationForCurrentTile = 0;
            this.transform.elevation = 0;
        } else {
            // add terrain
            const sourceCache = this.style.sourceCaches[options.source];
            if (!sourceCache) throw new Error(`cannot load terrain, because there exists no source with ID: ${options.source}`);
            // Update terrain tiles when adding new terrain
            if (this.terrain === null) sourceCache.reload();
            // Warn once if user is using the same source for hillshade and terrain
            for (const index in this.style._layers) {
                const thisLayer = this.style._layers[index];
                if (thisLayer.type === 'hillshade' && thisLayer.source === options.source) {
                    warnOnce('You are using the same source for a hillshade layer and for 3D terrain. Please consider using two separate sources to improve rendering quality.');
                }
            }
            this.terrain = new Terrain(this.painter, sourceCache, options);
            this.painter.renderToTexture = new RenderToTexture(this.painter, this.terrain);
            this.transform.minElevationForCurrentTile = this.terrain.getMinTileElevationForLngLatZoom(this.transform.center, this.transform.tileZoom);
            this.transform.elevation = this.terrain.getElevationForLngLatZoom(this.transform.center, this.transform.tileZoom);
            this._terrainDataCallback = e => {
                if (e.dataType === 'style') {
                    this.terrain.sourceCache.freeRtt();
                } else if (e.dataType === 'source' && e.tile) {
                    if (e.sourceId === options.source && !this._elevationFreeze) {
                        this.transform.minElevationForCurrentTile = this.terrain.getMinTileElevationForLngLatZoom(this.transform.center, this.transform.tileZoom);
                        this.transform.elevation = this.terrain.getElevationForLngLatZoom(this.transform.center, this.transform.tileZoom);
                    }
                    this.terrain.sourceCache.freeRtt(e.tile.tileID);
                }
            };
            this.style.on('data', this._terrainDataCallback);
        }

        this.fire(new Event('terrain', {terrain: options}));
        return this;
    }

    /**
     * Get the terrain-options if terrain is loaded
     * @returns the TerrainSpecification passed to setTerrain
     * @example
     * ```ts
     * map.getTerrain(); // { source: 'terrain' };
     * ```
     */
    getTerrain(): TerrainSpecification | null {
        return this.terrain?.options ?? null;
    }

    /**
     * Returns a Boolean indicating whether all tiles in the viewport from all sources on
     * the style are loaded.
     *
     * @returns A Boolean indicating whether all tiles are loaded.
     * @example
     * ```ts
     * let tilesLoaded = map.areTilesLoaded();
     * ```
     */
    areTilesLoaded(): boolean {
        const sources = this.style && this.style.sourceCaches;
        for (const id in sources) {
            const source = sources[id];
            const tiles = source._tiles;
            for (const t in tiles) {
                const tile = tiles[t];
                if (!(tile.state === 'loaded' || tile.state === 'errored')) return false;
            }
        }
        return true;
    }

    /**
     * Removes a source from the map's style.
     *
     * @param id - The ID of the source to remove.
     * @example
     * ```ts
     * map.removeSource('bathymetry-data');
     * ```
     */
    removeSource(id: string): Map {
        this.style.removeSource(id);
        return this._update(true);
    }

    /**
     * Returns the source with the specified ID in the map's style.
     *
     * This method is often used to update a source using the instance members for the relevant
     * source type as defined in classes that derive from {@link Source}.
     * For example, setting the `data` for a GeoJSON source or updating the `url` and `coordinates`
     * of an image source.
     *
     * @param id - The ID of the source to get.
     * @returns The style source with the specified ID or `undefined` if the ID
     * corresponds to no existing sources.
     * The shape of the object varies by source type.
     * A list of options for each source type is available on the MapLibre Style Specification's
     * [Sources](https://maplibre.org/maplibre-style-spec/sources/) page.
     * @example
     * ```ts
     * let sourceObject = map.getSource('points');
     * ```
     * @see [Create a draggable point](https://maplibre.org/maplibre-gl-js/docs/examples/drag-a-point/)
     * @see [Animate a point](https://maplibre.org/maplibre-gl-js/docs/examples/animate-point-along-line/)
     * @see [Add live realtime data](https://maplibre.org/maplibre-gl-js/docs/examples/live-geojson/)
     */
    getSource<TSource extends Source>(id: string): TSource | undefined {
        return this.style.getSource(id) as TSource;
    }

    /**
     * Add an image to the style. This image can be displayed on the map like any other icon in the style's
     * sprite using the image's ID with
     * [`icon-image`](https://maplibre.org/maplibre-style-spec/layers/#layout-symbol-icon-image),
     * [`background-pattern`](https://maplibre.org/maplibre-style-spec/layers/#paint-background-background-pattern),
     * [`fill-pattern`](https://maplibre.org/maplibre-style-spec/layers/#paint-fill-fill-pattern),
     * or [`line-pattern`](https://maplibre.org/maplibre-style-spec/layers/#paint-line-line-pattern).
     *
     * A {@link ErrorEvent} event will be fired if the image parameter is invalid or there is not enough space in the sprite to add this image.
     *
     * @param id - The ID of the image.
     * @param image - The image as an `HTMLImageElement`, `ImageData`, `ImageBitmap` or object with `width`, `height`, and `data`
     * properties with the same format as `ImageData`.
     * @param options - Options object.
     * @example
     * ```ts
     * // If the style's sprite does not already contain an image with ID 'cat',
     * // add the image 'cat-icon.png' to the style's sprite with the ID 'cat'.
     * const image = await map.loadImage('https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Cat_silhouette.svg/400px-Cat_silhouette.svg.png');
     * if (!map.hasImage('cat')) map.addImage('cat', image.data);
     *
     * // Add a stretchable image that can be used with `icon-text-fit`
     * // In this example, the image is 600px wide by 400px high.
     * const image = await map.loadImage('https://upload.wikimedia.org/wikipedia/commons/8/89/Black_and_White_Boxed_%28bordered%29.png');
     * if (map.hasImage('border-image')) return;
     * map.addImage('border-image', image.data, {
     *     content: [16, 16, 300, 384], // place text over left half of image, avoiding the 16px border
     *     stretchX: [[16, 584]], // stretch everything horizontally except the 16px border
     *     stretchY: [[16, 384]], // stretch everything vertically except the 16px border
     * });
     * ```
     * @see Use `HTMLImageElement`: [Add an icon to the map](https://maplibre.org/maplibre-gl-js/docs/examples/add-image/)
     * @see Use `ImageData`: [Add a generated icon to the map](https://maplibre.org/maplibre-gl-js/docs/examples/add-image-generated/)
     */
    addImage(id: string,
        image: HTMLImageElement | ImageBitmap | ImageData | {
            width: number;
            height: number;
            data: Uint8Array | Uint8ClampedArray;
        } | StyleImageInterface,
        options: Partial<StyleImageMetadata> = {}): this {
        const {
            pixelRatio = 1,
            sdf = false,
            stretchX,
            stretchY,
            content,
            textFitWidth,
            textFitHeight
        } = options;
        this._lazyInitEmptyStyle();
        const version = 0;

        if (image instanceof HTMLImageElement || isImageBitmap(image)) {
            const {width, height, data} = browser.getImageData(image);
            this.style.addImage(id, {data: new RGBAImage({width, height}, data), pixelRatio, stretchX, stretchY, content, textFitWidth, textFitHeight, sdf, version});
        } else if (image.width === undefined || image.height === undefined) {
            return this.fire(new ErrorEvent(new Error(
                'Invalid arguments to map.addImage(). The second argument must be an `HTMLImageElement`, `ImageData`, `ImageBitmap`, ' +
                'or object with `width`, `height`, and `data` properties with the same format as `ImageData`')));
        } else {
            const {width, height, data} = image as ImageData;
            const userImage = (image as any as StyleImageInterface);

            this.style.addImage(id, {
                data: new RGBAImage({width, height}, new Uint8Array(data)),
                pixelRatio,
                stretchX,
                stretchY,
                content,
                textFitWidth,
                textFitHeight,
                sdf,
                version,
                userImage
            });

            if (userImage.onAdd) {
                userImage.onAdd(this, id);
            }
            return this;
        }
    }

    /**
     * Update an existing image in a style. This image can be displayed on the map like any other icon in the style's
     * sprite using the image's ID with
     * [`icon-image`](https://maplibre.org/maplibre-style-spec/layers/#layout-symbol-icon-image),
     * [`background-pattern`](https://maplibre.org/maplibre-style-spec/layers/#paint-background-background-pattern),
     * [`fill-pattern`](https://maplibre.org/maplibre-style-spec/layers/#paint-fill-fill-pattern),
     * or [`line-pattern`](https://maplibre.org/maplibre-style-spec/layers/#paint-line-line-pattern).
     *
     * An {@link ErrorEvent} will be fired if the image parameter is invald.
     *
     * @param id - The ID of the image.
     * @param image - The image as an `HTMLImageElement`, `ImageData`, `ImageBitmap` or object with `width`, `height`, and `data`
     * properties with the same format as `ImageData`.
     * @example
     * ```ts
     * // If an image with the ID 'cat' already exists in the style's sprite,
     * // replace that image with a new image, 'other-cat-icon.png'.
     * if (map.hasImage('cat')) map.updateImage('cat', './other-cat-icon.png');
     * ```
     */
    updateImage(id: string,
        image: HTMLImageElement | ImageBitmap | ImageData | {
            width: number;
            height: number;
            data: Uint8Array | Uint8ClampedArray;
        } | StyleImageInterface): this {

        const existingImage = this.style.getImage(id);
        if (!existingImage) {
            return this.fire(new ErrorEvent(new Error(
                'The map has no image with that id. If you are adding a new image use `map.addImage(...)` instead.')));
        }
        const imageData = (image instanceof HTMLImageElement || isImageBitmap(image)) ?
            browser.getImageData(image) :
            image;
        const {width, height, data} = imageData;

        if (width === undefined || height === undefined) {
            return this.fire(new ErrorEvent(new Error(
                'Invalid arguments to map.updateImage(). The second argument must be an `HTMLImageElement`, `ImageData`, `ImageBitmap`, ' +
                'or object with `width`, `height`, and `data` properties with the same format as `ImageData`')));
        }

        if (width !== existingImage.data.width || height !== existingImage.data.height) {
            return this.fire(new ErrorEvent(new Error(
                'The width and height of the updated image must be that same as the previous version of the image')));
        }

        const copy = !(image instanceof HTMLImageElement || isImageBitmap(image));
        existingImage.data.replace(data, copy);

        this.style.updateImage(id, existingImage);
        return this;
    }

    /**
     * Returns an image, specified by ID, currently available in the map.
     * This includes both images from the style's original sprite
     * and any images that have been added at runtime using {@link Map#addImage}.
     *
     * @param id - The ID of the image.
     * @returns An image in the map with the specified ID.
     *
     * @example
     * ```ts
     * let coffeeShopIcon = map.getImage("coffee_cup");
     * ```
     */
    getImage(id: string): StyleImage {
        return this.style.getImage(id);
    }

    /**
     * Check whether or not an image with a specific ID exists in the style. This checks both images
     * in the style's original sprite and any images
     * that have been added at runtime using {@link Map#addImage}.
     *
     * An {@link ErrorEvent} will be fired if the image parameter is invald.
     *
     * @param id - The ID of the image.
     *
     * @returns A Boolean indicating whether the image exists.
     * @example
     * Check if an image with the ID 'cat' exists in the style's sprite.
     * ```ts
     * let catIconExists = map.hasImage('cat');
     * ```
     */
    hasImage(id: string): boolean {
        if (!id) {
            this.fire(new ErrorEvent(new Error('Missing required image id')));
            return false;
        }

        return !!this.style.getImage(id);
    }

    /**
     * Remove an image from a style. This can be an image from the style's original
     * sprite or any images
     * that have been added at runtime using {@link Map#addImage}.
     *
     * @param id - The ID of the image.
     *
     * @example
     * ```ts
     * // If an image with the ID 'cat' exists in
     * // the style's sprite, remove it.
     * if (map.hasImage('cat')) map.removeImage('cat');
     * ```
     */
    removeImage(id: string) {
        this.style.removeImage(id);
    }

    /**
     * Load an image from an external URL to be used with {@link Map#addImage}. External
     * domains must support [CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Access_control_CORS).
     *
     * @param url - The URL of the image file. Image file must be in png, webp, or jpg format.
     * @returns a promise that is resolved when the image is loaded
     *
     * @example
     * Load an image from an external URL.
     * ```ts
     * const response = await map.loadImage('https://picsum.photos/50/50');
     * // Add the loaded image to the style's sprite with the ID 'photo'.
     * map.addImage('photo', response.data);
     * ```
     * @see [Add an icon to the map](https://maplibre.org/maplibre-gl-js/docs/examples/add-image/)
     */
    loadImage(url: string): Promise<GetResourceResponse<HTMLImageElement | ImageBitmap>> {
        return ImageRequest.getImage(this._requestManager.transformRequest(url, ResourceType.Image), new AbortController());
    }

    /**
     * Returns an Array of strings containing the IDs of all images currently available in the map.
     * This includes both images from the style's original sprite
     * and any images that have been added at runtime using {@link Map#addImage}.
     *
     * @returns An Array of strings containing the names of all sprites/images currently available in the map.
     *
     * @example
     * ```ts
     * let allImages = map.listImages();
     * ```
     */
    listImages(): Array<string> {
        return this.style.listImages();
    }

    /**
     * Adds a [MapLibre style layer](https://maplibre.org/maplibre-style-spec/layers)
     * to the map's style.
     *
     * A layer defines how data from a specified source will be styled. Read more about layer types
     * and available paint and layout properties in the [MapLibre Style Specification](https://maplibre.org/maplibre-style-spec/layers).
     *
     * @param layer - The layer to add,
     * conforming to either the MapLibre Style Specification's [layer definition](https://maplibre.org/maplibre-style-spec/layers) or,
     * less commonly, the {@link CustomLayerInterface} specification. Can also be a layer definition with an embedded source definition.
     * The MapLibre Style Specification's layer definition is appropriate for most layers.
     *
     * @param beforeId - The ID of an existing layer to insert the new layer before,
     * resulting in the new layer appearing visually beneath the existing layer.
     * If this argument is not specified, the layer will be appended to the end of the layers array
     * and appear visually above all other layers.
     *
     * @example
     * Add a circle layer with a vector source
     * ```ts
     * map.addLayer({
     *   id: 'points-of-interest',
     *   source: {
     *     type: 'vector',
     *     url: 'https://demotiles.maplibre.org/tiles/tiles.json'
     *   },
     *   'source-layer': 'poi_label',
     *   type: 'circle',
     *   paint: {
     *     // MapLibre Style Specification paint properties
     *   },
     *   layout: {
     *     // MapLibre Style Specification layout properties
     *   }
     * });
     * ```
     *
     * @example
     * Define a source before using it to create a new layer
     * ```ts
     * map.addSource('state-data', {
     *   type: 'geojson',
     *   data: 'path/to/data.geojson'
     * });
     *
     * map.addLayer({
     *   id: 'states',
     *   // References the GeoJSON source defined above
     *   // and does not require a `source-layer`
     *   source: 'state-data',
     *   type: 'symbol',
     *   layout: {
     *     // Set the label content to the
     *     // feature's `name` property
     *     text-field: ['get', 'name']
     *   }
     * });
     * ```
     *
     * @example
     * Add a new symbol layer before an existing layer
     * ```ts
     * map.addLayer({
     *   id: 'states',
     *   // References a source that's already been defined
     *   source: 'state-data',
     *   type: 'symbol',
     *   layout: {
     *     // Set the label content to the
     *     // feature's `name` property
     *     text-field: ['get', 'name']
     *   }
     * // Add the layer before the existing `cities` layer
     * }, 'cities');
     * ```
     * @see [Create and style clusters](https://maplibre.org/maplibre-gl-js/docs/examples/cluster/)
     * @see [Add a vector tile source](https://maplibre.org/maplibre-gl-js/docs/examples/vector-source/)
     * @see [Add a WMS source](https://maplibre.org/maplibre-gl-js/docs/examples/wms/)
     */
    addLayer(layer: AddLayerObject, beforeId?: string) {
        this._lazyInitEmptyStyle();
        this.style.addLayer(layer, beforeId);
        return this._update(true);
    }

    /**
     * Moves a layer to a different z-position.
     *
     * @param id - The ID of the layer to move.
     * @param beforeId - The ID of an existing layer to insert the new layer before. When viewing the map, the `id` layer will appear beneath the `beforeId` layer. If `beforeId` is omitted, the layer will be appended to the end of the layers array and appear above all other layers on the map.
     *
     * @example
     * Move a layer with ID 'polygon' before the layer with ID 'country-label'. The `polygon` layer will appear beneath the `country-label` layer on the map.
     * ```ts
     * map.moveLayer('polygon', 'country-label');
     * ```
     */
    moveLayer(id: string, beforeId?: string): this {
        this.style.moveLayer(id, beforeId);
        return this._update(true);
    }

    /**
     * Removes the layer with the given ID from the map's style.
     *
     * An {@link ErrorEvent} will be fired if the image parameter is invald.
     *
     * @param id - The ID of the layer to remove
     *
     * @example
     * If a layer with ID 'state-data' exists, remove it.
     * ```ts
     * if (map.getLayer('state-data')) map.removeLayer('state-data');
     * ```
     */
    removeLayer(id: string): this {
        this.style.removeLayer(id);
        return this._update(true);
    }

    /**
     * Returns the layer with the specified ID in the map's style.
     *
     * @param id - The ID of the layer to get.
     * @returns The layer with the specified ID, or `undefined`
     * if the ID corresponds to no existing layers.
     *
     * @example
     * ```ts
     * let stateDataLayer = map.getLayer('state-data');
     * ```
     * @see [Filter symbols by toggling a list](https://maplibre.org/maplibre-gl-js/docs/examples/filter-markers/)
     * @see [Filter symbols by text input](https://maplibre.org/maplibre-gl-js/docs/examples/filter-markers-by-input/)
     */
    getLayer(id: string): StyleLayer | undefined {
        return this.style.getLayer(id);
    }

    /**
     * Return the ids of all layers currently in the style, including custom layers, in order.
     *
     * @returns ids of layers, in order
     *
     * @example
     * ```ts
     * const orderedLayerIds = map.getLayersOrder();
     * ```
     */
    getLayersOrder(): string[] {
        return this.style.getLayersOrder();
    }

    /**
     * Sets the zoom extent for the specified style layer. The zoom extent includes the
     * [minimum zoom level](https://maplibre.org/maplibre-style-spec/layers/#minzoom)
     * and [maximum zoom level](https://maplibre.org/maplibre-style-spec/layers/#maxzoom))
     * at which the layer will be rendered.
     *
     * Note: For style layers using vector sources, style layers cannot be rendered at zoom levels lower than the
     * minimum zoom level of the _source layer_ because the data does not exist at those zoom levels. If the minimum
     * zoom level of the source layer is higher than the minimum zoom level defined in the style layer, the style
     * layer will not be rendered at all zoom levels in the zoom range.
     *
     * @param layerId - The ID of the layer to which the zoom extent will be applied.
     * @param minzoom - The minimum zoom to set (0-24).
     * @param maxzoom - The maximum zoom to set (0-24).
     *
     * @example
     * ```ts
     * map.setLayerZoomRange('my-layer', 2, 5);
     * ```
     */
    setLayerZoomRange(layerId: string, minzoom: number, maxzoom: number): this {
        this.style.setLayerZoomRange(layerId, minzoom, maxzoom);
        return this._update(true);
    }

    /**
     * Sets the filter for the specified style layer.
     *
     * Filters control which features a style layer renders from its source.
     * Any feature for which the filter expression evaluates to `true` will be
     * rendered on the map. Those that are false will be hidden.
     *
     * Use `setFilter` to show a subset of your source data.
     *
     * To clear the filter, pass `null` or `undefined` as the second parameter.
     *
     * @param layerId - The ID of the layer to which the filter will be applied.
     * @param filter - The filter, conforming to the MapLibre Style Specification's
     * [filter definition](https://maplibre.org/maplibre-style-spec/layers/#filter).  If `null` or `undefined` is provided, the function removes any existing filter from the layer.
     * @param options - Options object.
     *
     * @example
     * Display only features with the 'name' property 'USA'
     * ```ts
     * map.setFilter('my-layer', ['==', ['get', 'name'], 'USA']);
     * ```
     * @example
     * Display only features with five or more 'available-spots'
     * ```ts
     * map.setFilter('bike-docks', ['>=', ['get', 'available-spots'], 5]);
     * ```
     * @example
     * Remove the filter for the 'bike-docks' style layer
     * ```ts
     * map.setFilter('bike-docks', null);
     * ```
     * @see [Create a timeline animation](https://maplibre.org/maplibre-gl-js/docs/examples/timeline-animation/)
     */
    setFilter(layerId: string, filter?: FilterSpecification | null, options: StyleSetterOptions = {}) {
        this.style.setFilter(layerId, filter, options);
        return this._update(true);
    }

    /**
     * Returns the filter applied to the specified style layer.
     *
     * @param layerId - The ID of the style layer whose filter to get.
     * @returns The layer's filter.
     */
    getFilter(layerId: string): FilterSpecification | void {
        return this.style.getFilter(layerId);
    }

    /**
     * Sets the value of a paint property in the specified style layer.
     *
     * @param layerId - The ID of the layer to set the paint property in.
     * @param name - The name of the paint property to set.
     * @param value - The value of the paint property to set.
     * Must be of a type appropriate for the property, as defined in the [MapLibre Style Specification](https://maplibre.org/maplibre-style-spec/).
     * Pass `null` to unset the existing value.
     * @param options - Options object.
     * @example
     * ```ts
     * map.setPaintProperty('my-layer', 'fill-color', '#faafee');
     * ```
     * @see [Change a layer's color with buttons](https://maplibre.org/maplibre-gl-js/docs/examples/color-switcher/)
     * @see [Create a draggable point](https://maplibre.org/maplibre-gl-js/docs/examples/drag-a-point/)
     */
    setPaintProperty(layerId: string, name: string, value: any, options: StyleSetterOptions = {}): this {
        this.style.setPaintProperty(layerId, name, value, options);
        return this._update(true);
    }

    /**
     * Returns the value of a paint property in the specified style layer.
     *
     * @param layerId - The ID of the layer to get the paint property from.
     * @param name - The name of a paint property to get.
     * @returns The value of the specified paint property.
     */
    getPaintProperty(layerId: string, name: string) {
        return this.style.getPaintProperty(layerId, name);
    }

    /**
     * Sets the value of a layout property in the specified style layer.
     *
     * @param layerId - The ID of the layer to set the layout property in.
     * @param name - The name of the layout property to set.
     * @param value - The value of the layout property. Must be of a type appropriate for the property, as defined in the [MapLibre Style Specification](https://maplibre.org/maplibre-style-spec/).
     * @param options - The options object.
     * @example
     * ```ts
     * map.setLayoutProperty('my-layer', 'visibility', 'none');
     * ```
     */
    setLayoutProperty(layerId: string, name: string, value: any, options: StyleSetterOptions = {}): this {
        this.style.setLayoutProperty(layerId, name, value, options);
        return this._update(true);
    }

    /**
     * Returns the value of a layout property in the specified style layer.
     *
     * @param layerId - The ID of the layer to get the layout property from.
     * @param name - The name of the layout property to get.
     * @returns The value of the specified layout property.
     */
    getLayoutProperty(layerId: string, name: string) {
        return this.style.getLayoutProperty(layerId, name);
    }

    /**
     * Sets the value of the style's glyphs property.
     *
     * @param glyphsUrl - Glyph URL to set. Must conform to the [MapLibre Style Specification](https://maplibre.org/maplibre-style-spec/glyphs/).
     * @param options - Options object.
     * @example
     * ```ts
     * map.setGlyphs('https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf');
     * ```
     */
    setGlyphs(glyphsUrl: string | null, options: StyleSetterOptions = {}): this {
        this._lazyInitEmptyStyle();
        this.style.setGlyphs(glyphsUrl, options);
        return this._update(true);
    }

    /**
     * Returns the value of the style's glyphs URL
     *
     * @returns glyphs Style's glyphs url
     */
    getGlyphs(): string | null {
        return this.style.getGlyphsUrl();
    }

    /**
     * Adds a sprite to the map's style. Fires the `style` event.
     *
     * @param id - The ID of the sprite to add. Must not conflict with existing sprites.
     * @param url - The URL to load the sprite from
     * @param options - Options object.
     * @example
     * ```ts
     * map.addSprite('sprite-two', 'http://example.com/sprite-two');
     * ```
     */
    addSprite(id: string, url: string, options: StyleSetterOptions = {}): this {
        this._lazyInitEmptyStyle();
        this.style.addSprite(id, url, options, (err) => {
            if (!err) {
                this._update(true);
            }
        });
        return this;
    }

    /**
     * Removes the sprite from the map's style. Fires the `style` event.
     *
     * @param id - The ID of the sprite to remove. If the sprite is declared as a single URL, the ID must be "default".
     * @example
     * ```ts
     * map.removeSprite('sprite-two');
     * map.removeSprite('default');
     * ```
     */
    removeSprite(id: string) {
        this._lazyInitEmptyStyle();
        this.style.removeSprite(id);
        return this._update(true);
    }

    /**
     * Returns the as-is value of the style's sprite.
     *
     * @returns style's sprite list of id-url pairs
     */
    getSprite(): {id: string; url: string}[] {
        return this.style.getSprite();
    }

    /**
     * Sets the value of the style's sprite property.
     *
     * @param spriteUrl - Sprite URL to set.
     * @param options - Options object.
     * @example
     * ```ts
     * map.setSprite('YOUR_SPRITE_URL');
     * ```
     */
    setSprite(spriteUrl: string | null, options: StyleSetterOptions = {}) {
        this._lazyInitEmptyStyle();
        this.style.setSprite(spriteUrl, options, (err) => {
            if (!err) {
                this._update(true);
            }
        });
        return this;
    }

    /**
     * Sets the any combination of light values.
     *
     * @param light - Light properties to set. Must conform to the [MapLibre Style Specification](https://maplibre.org/maplibre-style-spec/light).
     * @param options - Options object.
     *
     * @example
     * ```ts
     * let layerVisibility = map.getLayoutProperty('my-layer', 'visibility');
     * ```
     */
    setLight(light: LightSpecification, options: StyleSetterOptions = {}) {
        this._lazyInitEmptyStyle();
        this.style.setLight(light, options);
        return this._update(true);
    }

    /**
     * Returns the value of the light object.
     *
     * @returns light Light properties of the style.
     */
    getLight(): LightSpecification {
        return this.style.getLight();
    }

    /**
     * Loads sky and fog defined by {@link SkySpecification} onto the map.
     * Note: The fog only shows when using the terrain 3D feature.
     * @param sky - Sky properties to set. Must conform to the [MapLibre Style Specification](https://maplibre.org/maplibre-style-spec/sky/).
     * @returns `this`
     * @example
     * ```ts
     * map.setSky({ 'sky-color': '#00f' });
     * ```
     */
    setSky(sky: SkySpecification) {
        this._lazyInitEmptyStyle();
        this.style.setSky(sky);
        return this._update(true);
    }

    /**
     * Returns the value of the sky object.
     *
     * @returns the sky properties of the style.
     * @example
     * ```ts
     * map.getSky();
     * ```
     */
    getSky() {
        return this.style.getSky();
    }

    /**
     * Sets the `state` of a feature.
     * A feature's `state` is a set of user-defined key-value pairs that are assigned to a feature at runtime.
     * When using this method, the `state` object is merged with any existing key-value pairs in the feature's state.
     * Features are identified by their `feature.id` attribute, which can be any number or string.
     *
     * This method can only be used with sources that have a `feature.id` attribute. The `feature.id` attribute can be defined in three ways:
     *
     * - For vector or GeoJSON sources, including an `id` attribute in the original data file.
     * - For vector or GeoJSON sources, using the [`promoteId`](https://maplibre.org/maplibre-style-spec/sources/#vector-promoteId) option at the time the source is defined.
     * - For GeoJSON sources, using the [`generateId`](https://maplibre.org/maplibre-style-spec/sources/#geojson-generateId) option to auto-assign an `id` based on the feature's index in the source data. If you change feature data using `map.getSource('some id').setData(..)`, you may need to re-apply state taking into account updated `id` values.
     *
     * _Note: You can use the [`feature-state` expression](https://maplibre.org/maplibre-style-spec/expressions/#feature-state) to access the values in a feature's state object for the purposes of styling._
     *
     * @param feature - Feature identifier. Feature objects returned from
     * {@link Map#queryRenderedFeatures} or event handlers can be used as feature identifiers.
     * @param state - A set of key-value pairs. The values should be valid JSON types.
     *
     * @example
     * ```ts
     * // When the mouse moves over the `my-layer` layer, update
     * // the feature state for the feature under the mouse
     * map.on('mousemove', 'my-layer', (e) => {
     *   if (e.features.length > 0) {
     *     map.setFeatureState({
     *       source: 'my-source',
     *       sourceLayer: 'my-source-layer',
     *       id: e.features[0].id,
     *     }, {
     *       hover: true
     *     });
     *   }
     * });
     * ```
     * @see [Create a hover effect](https://maplibre.org/maplibre-gl-js/docs/examples/hover-styles/)
     */
    setFeatureState(feature: FeatureIdentifier, state: any): this {
        this.style.setFeatureState(feature, state);
        return this._update();
    }

    /**
     * Removes the `state` of a feature, setting it back to the default behavior.
     * If only a `target.source` is specified, it will remove the state for all features from that source.
     * If `target.id` is also specified, it will remove all keys for that feature's state.
     * If `key` is also specified, it removes only that key from that feature's state.
     * Features are identified by their `feature.id` attribute, which can be any number or string.
     *
     * @param target - Identifier of where to remove state. It can be a source, a feature, or a specific key of feature.
     * Feature objects returned from {@link Map#queryRenderedFeatures} or event handlers can be used as feature identifiers.
     * @param key - (optional) The key in the feature state to reset.
     * @example
     * Reset the entire state object for all features in the `my-source` source
     * ```ts
     * map.removeFeatureState({
     *   source: 'my-source'
     * });
     * ```
     *
     * @example
     * When the mouse leaves the `my-layer` layer,
     * reset the entire state object for the
     * feature under the mouse
     * ```ts
     * map.on('mouseleave', 'my-layer', (e) => {
     *   map.removeFeatureState({
     *     source: 'my-source',
     *     sourceLayer: 'my-source-layer',
     *     id: e.features[0].id
     *   });
     * });
     * ```
     *
     * @example
     * When the mouse leaves the `my-layer` layer,
     * reset only the `hover` key-value pair in the
     * state for the feature under the mouse
     * ```ts
     * map.on('mouseleave', 'my-layer', (e) => {
     *   map.removeFeatureState({
     *     source: 'my-source',
     *     sourceLayer: 'my-source-layer',
     *     id: e.features[0].id
     *   }, 'hover');
     * });
     * ```
     */
    removeFeatureState(target: FeatureIdentifier, key?: string): this {
        this.style.removeFeatureState(target, key);
        return this._update();
    }

    /**
     * Gets the `state` of a feature.
     * A feature's `state` is a set of user-defined key-value pairs that are assigned to a feature at runtime.
     * Features are identified by their `feature.id` attribute, which can be any number or string.
     *
     * _Note: To access the values in a feature's state object for the purposes of styling the feature, use the [`feature-state` expression](https://maplibre.org/maplibre-style-spec/expressions/#feature-state)._
     *
     * @param feature - Feature identifier. Feature objects returned from
     * {@link Map#queryRenderedFeatures} or event handlers can be used as feature identifiers.
     * @returns The state of the feature: a set of key-value pairs that was assigned to the feature at runtime.
     *
     * @example
     * When the mouse moves over the `my-layer` layer,
     * get the feature state for the feature under the mouse
     * ```ts
     * map.on('mousemove', 'my-layer', (e) => {
     *   if (e.features.length > 0) {
     *     map.getFeatureState({
     *       source: 'my-source',
     *       sourceLayer: 'my-source-layer',
     *       id: e.features[0].id
     *     });
     *   }
     * });
     * ```
     */
    getFeatureState(feature: FeatureIdentifier): any {
        return this.style.getFeatureState(feature);
    }

    /**
     * Returns the map's containing HTML element.
     *
     * @returns The map's container.
     */
    getContainer(): HTMLElement {
        return this._container;
    }

    /**
     * Returns the HTML element containing the map's `<canvas>` element.
     *
     * If you want to add non-GL overlays to the map, you should append them to this element.
     *
     * This is the element to which event bindings for map interactivity (such as panning and zooming) are
     * attached. It will receive bubbled events from child elements such as the `<canvas>`, but not from
     * map controls.
     *
     * @returns The container of the map's `<canvas>`.
     * @see [Create a draggable point](https://maplibre.org/maplibre-gl-js/docs/examples/drag-a-point/)
     */
    getCanvasContainer(): HTMLElement {
        return this._canvasContainer;
    }

    /**
     * Returns the map's `<canvas>` element.
     *
     * @returns The map's `<canvas>` element.
     * @see [Measure distances](https://maplibre.org/maplibre-gl-js/docs/examples/measure/)
     * @see [Display a popup on hover](https://maplibre.org/maplibre-gl-js/docs/examples/popup-on-hover/)
     * @see [Center the map on a clicked symbol](https://maplibre.org/maplibre-gl-js/docs/examples/center-on-symbol/)
     */
    getCanvas(): HTMLCanvasElement {
        return this._canvas;
    }

    _containerDimensions() {
        let width = 0;
        let height = 0;

        if (this._container) {
            width = this._container.clientWidth || 400;
            height = this._container.clientHeight || 300;
        }

        return [width, height];
    }

    _setupContainer() {
        const container = this._container;
        container.classList.add('maplibregl-map');

        const canvasContainer = this._canvasContainer = DOM.create('div', 'maplibregl-canvas-container', container);
        if (this._interactive) {
            canvasContainer.classList.add('maplibregl-interactive');
        }

        this._canvas = DOM.create('canvas', 'maplibregl-canvas', canvasContainer);
        this._canvas.addEventListener('webglcontextlost', this._contextLost, false);
        this._canvas.addEventListener('webglcontextrestored', this._contextRestored, false);
        this._canvas.setAttribute('tabindex', this._interactive ? '0' : '-1');
        this._canvas.setAttribute('aria-label', this._getUIString('Map.Title'));
        this._canvas.setAttribute('role', 'region');

        const dimensions = this._containerDimensions();
        const clampedPixelRatio = this._getClampedPixelRatio(dimensions[0], dimensions[1]);
        this._resizeCanvas(dimensions[0], dimensions[1], clampedPixelRatio);

        const controlContainer = this._controlContainer = DOM.create('div', 'maplibregl-control-container', container);
        const positions = this._controlPositions = {};
        ['top-left', 'top-right', 'bottom-left', 'bottom-right'].forEach((positionName) => {
            positions[positionName] = DOM.create('div', `maplibregl-ctrl-${positionName} `, controlContainer);
        });

        this._container.addEventListener('scroll', this._onMapScroll, false);
    }

    _resizeCanvas(width: number, height: number, pixelRatio: number) {
        // Request the required canvas size taking the pixelratio into account.
        this._canvas.width = Math.floor(pixelRatio * width);
        this._canvas.height = Math.floor(pixelRatio * height);

        // Maintain the same canvas size, potentially downscaling it for HiDPI displays
        this._canvas.style.width = `${width}px`;
        this._canvas.style.height = `${height}px`;
    }

    _setupPainter() {

        const attributes = {
            alpha: true,
            stencil: true,
            depth: true,
            failIfMajorPerformanceCaveat: this._failIfMajorPerformanceCaveat,
            preserveDrawingBuffer: this._preserveDrawingBuffer,
            antialias: this._antialias || false
        };

        let webglcontextcreationerrorDetailObject: any = null;
        this._canvas.addEventListener('webglcontextcreationerror', (args: WebGLContextEvent) => {
            webglcontextcreationerrorDetailObject = {requestedAttributes: attributes};
            if (args) {
                webglcontextcreationerrorDetailObject.statusMessage = args.statusMessage;
                webglcontextcreationerrorDetailObject.type = args.type;
            }
        }, {once: true});

        const gl =
            this._canvas.getContext('webgl2', attributes) as WebGL2RenderingContext ||
            this._canvas.getContext('webgl', attributes) as WebGLRenderingContext;

        if (!gl) {
            const msg = 'Failed to initialize WebGL';
            if (webglcontextcreationerrorDetailObject) {
                webglcontextcreationerrorDetailObject.message = msg;
                throw new Error(JSON.stringify(webglcontextcreationerrorDetailObject));
            } else {
                throw new Error(msg);
            }
        }

        this.painter = new Painter(gl, this.transform);

        webpSupported.testSupport(gl);
    }

    _contextLost = (event: any) => {
        event.preventDefault();
        if (this._frameRequest) {
            this._frameRequest.abort();
            this._frameRequest = null;
        }
        this.fire(new Event('webglcontextlost', {originalEvent: event}));
    };

    _contextRestored = (event: any) => {
        this._setupPainter();
        this.resize();
        this._update();
        this.fire(new Event('webglcontextrestored', {originalEvent: event}));
    };

    _onMapScroll = (event: any) => {
        if (event.target !== this._container) return;

        // Revert any scroll which would move the canvas outside of the view
        this._container.scrollTop = 0;
        this._container.scrollLeft = 0;
        return false;
    };

    /**
     * Returns a Boolean indicating whether the map is fully loaded.
     *
     * Returns `false` if the style is not yet fully loaded,
     * or if there has been a change to the sources or style that
     * has not yet fully loaded.
     *
     * @returns A Boolean indicating whether the map is fully loaded.
     */
    loaded(): boolean {
        return !this._styleDirty && !this._sourcesDirty && !!this.style && this.style.loaded();
    }

    /**
     * @internal
     * Update this map's style and sources, and re-render the map.
     *
     * @param updateStyle - mark the map's style for reprocessing as
     * well as its sources
     */
    _update(updateStyle?: boolean) {
        if (!this.style || !this.style._loaded) return this;

        this._styleDirty = this._styleDirty || updateStyle;
        this._sourcesDirty = true;
        this.triggerRepaint();

        return this;
    }

    /**
     * @internal
     * Request that the given callback be executed during the next render
     * frame.  Schedule a render frame if one is not already scheduled.
     *
     * @returns An id that can be used to cancel the callback
     */
    _requestRenderFrame(callback: () => void): TaskID {
        this._update();
        return this._renderTaskQueue.add(callback);
    }

    _cancelRenderFrame(id: TaskID) {
        this._renderTaskQueue.remove(id);
    }

    /**
     * @internal
     * Call when a (re-)render of the map is required:
     *
     * - The style has changed (`setPaintProperty()`, etc.)
     * - Source data has changed (e.g. tiles have finished loading)
     * - The map has is moving (or just finished moving)
     * - A transition is in progress
     *
     * @param paintStartTimeStamp - The time when the animation frame began executing.
     */
    _render(paintStartTimeStamp: number) {
        const fadeDuration = this._idleTriggered ? this._fadeDuration : 0;

        // A custom layer may have used the context asynchronously. Mark the state as dirty.
        this.painter.context.setDirty();
        this.painter.setBaseState();

        this._renderTaskQueue.run(paintStartTimeStamp);
        // A task queue callback may have fired a user event which may have removed the map
        if (this._removed) return;

        let crossFading = false;

        // If the style has changed, the map is being zoomed, or a transition or fade is in progress:
        //  - Apply style changes (in a batch)
        //  - Recalculate paint properties.
        if (this.style && this._styleDirty) {
            this._styleDirty = false;

            const zoom = this.transform.zoom;
            const now = browser.now();
            this.style.zoomHistory.update(zoom, now);

            const parameters = new EvaluationParameters(zoom, {
                now,
                fadeDuration,
                zoomHistory: this.style.zoomHistory,
                transition: this.style.getTransition()
            });

            const factor = parameters.crossFadingFactor();
            if (factor !== 1 || factor !== this._crossFadingFactor) {
                crossFading = true;
                this._crossFadingFactor = factor;
            }

            this.style.update(parameters);
        }

        // If we are in _render for any reason other than an in-progress paint
        // transition, update source caches to check for and load any tiles we
        // need for the current transform
        if (this.style && this._sourcesDirty) {
            this._sourcesDirty = false;
            this.style._updateSources(this.transform);
        }

        // update terrain stuff
        if (this.terrain) {
            this.terrain.sourceCache.update(this.transform, this.terrain);
            this.transform.minElevationForCurrentTile = this.terrain.getMinTileElevationForLngLatZoom(this.transform.center, this.transform.tileZoom);
            if (!this._elevationFreeze) {
                this.transform.elevation = this.terrain.getElevationForLngLatZoom(this.transform.center, this.transform.tileZoom);
            }
        } else {
            this.transform.minElevationForCurrentTile = 0;
            this.transform.elevation = 0;
        }

        this._placementDirty = this.style && this.style._updatePlacement(this.painter.transform, this.showCollisionBoxes, fadeDuration, this._crossSourceCollisions);

        // Actually draw
        this.painter.render(this.style, {
            showTileBoundaries: this.showTileBoundaries,
            showOverdrawInspector: this._showOverdrawInspector,
            rotating: this.isRotating(),
            zooming: this.isZooming(),
            moving: this.isMoving(),
            fadeDuration,
            showPadding: this.showPadding,
        });

        this.fire(new Event('render'));

        if (this.loaded() && !this._loaded) {
            this._loaded = true;
            PerformanceUtils.mark(PerformanceMarkers.load);
            this.fire(new Event('load'));
        }

        if (this.style && (this.style.hasTransitions() || crossFading)) {
            this._styleDirty = true;
        }

        if (this.style && !this._placementDirty) {
            // Since no fade operations are in progress, we can release
            // all tiles held for fading. If we didn't do this, the tiles
            // would just sit in the SourceCaches until the next render
            this.style._releaseSymbolFadeTiles();
        }

        // Schedule another render frame if it's needed.
        //
        // Even though `_styleDirty` and `_sourcesDirty` are reset in this
        // method, synchronous events fired during Style#update or
        // Style#_updateSources could have caused them to be set again.
        const somethingDirty = this._sourcesDirty || this._styleDirty || this._placementDirty;
        if (somethingDirty || this._repaint) {
            this.triggerRepaint();
        } else if (!this.isMoving() && this.loaded()) {
            this.fire(new Event('idle'));
        }

        if (this._loaded && !this._fullyLoaded && !somethingDirty) {
            this._fullyLoaded = true;
            PerformanceUtils.mark(PerformanceMarkers.fullLoad);
        }

        return this;
    }

    /**
     * Force a synchronous redraw of the map.
     * @example
     * ```ts
     * map.redraw();
     * ```
     */
    redraw(): this {
        if (this.style) {
            // cancel the scheduled update
            if (this._frameRequest) {
                this._frameRequest.abort();
                this._frameRequest = null;
            }
            this._render(0);
        }
        return this;
    }

    /**
     * Clean up and release all internal resources associated with this map.
     *
     * This includes DOM elements, event bindings, web workers, and WebGL resources.
     *
     * Use this method when you are done using the map and wish to ensure that it no
     * longer consumes browser resources. Afterwards, you must not call any other
     * methods on the map.
     */
    remove() {
        if (this._hash) this._hash.remove();

        for (const control of this._controls) control.onRemove(this);
        this._controls = [];

        if (this._frameRequest) {
            this._frameRequest.abort();
            this._frameRequest = null;
        }
        this._renderTaskQueue.clear();
        this.painter.destroy();
        this.handlers.destroy();
        delete this.handlers;
        this.setStyle(null);
        if (typeof window !== 'undefined') {
            removeEventListener('online', this._onWindowOnline, false);
        }

        ImageRequest.removeThrottleControl(this._imageQueueHandle);

        this._resizeObserver?.disconnect();
        const extension = this.painter.context.gl.getExtension('WEBGL_lose_context');
        if (extension?.loseContext) extension.loseContext();
        this._canvas.removeEventListener('webglcontextrestored', this._contextRestored, false);
        this._canvas.removeEventListener('webglcontextlost', this._contextLost, false);
        DOM.remove(this._canvasContainer);
        DOM.remove(this._controlContainer);
        this._container.classList.remove('maplibregl-map');

        PerformanceUtils.clearMetrics();

        this._removed = true;
        this.fire(new Event('remove'));
    }

    /**
     * Trigger the rendering of a single frame. Use this method with custom layers to
     * repaint the map when the layer changes. Calling this multiple times before the
     * next frame is rendered will still result in only a single frame being rendered.
     * @example
     * ```ts
     * map.triggerRepaint();
     * ```
     * @see [Add a 3D model](https://maplibre.org/maplibre-gl-js/docs/examples/add-3d-model/)
     * @see [Add an animated icon to the map](https://maplibre.org/maplibre-gl-js/docs/examples/add-image-animated/)
     */
    triggerRepaint() {
        if (this.style && !this._frameRequest) {
            this._frameRequest = new AbortController();
            browser.frameAsync(this._frameRequest).then((paintStartTimeStamp: number) => {
                PerformanceUtils.frame(paintStartTimeStamp);
                this._frameRequest = null;
                this._render(paintStartTimeStamp);
            }).catch(() => {}); // ignore abort error
        }
    }

    _onWindowOnline = () => {
        this._update();
    };

    /**
     * Gets and sets a Boolean indicating whether the map will render an outline
     * around each tile and the tile ID. These tile boundaries are useful for
     * debugging.
     *
     * The uncompressed file size of the first vector source is drawn in the top left
     * corner of each tile, next to the tile ID.
     *
     * @example
     * ```ts
     * map.showTileBoundaries = true;
     * ```
     */
    get showTileBoundaries(): boolean { return !!this._showTileBoundaries; }
    set showTileBoundaries(value: boolean) {
        if (this._showTileBoundaries === value) return;
        this._showTileBoundaries = value;
        this._update();
    }

    /**
     * Gets and sets a Boolean indicating whether the map will visualize
     * the padding offsets.
     */
    get showPadding(): boolean { return !!this._showPadding; }
    set showPadding(value: boolean) {
        if (this._showPadding === value) return;
        this._showPadding = value;
        this._update();
    }

    /**
     * Gets and sets a Boolean indicating whether the map will render boxes
     * around all symbols in the data source, revealing which symbols
     * were rendered or which were hidden due to collisions.
     * This information is useful for debugging.
     */
    get showCollisionBoxes(): boolean { return !!this._showCollisionBoxes; }
    set showCollisionBoxes(value: boolean) {
        if (this._showCollisionBoxes === value) return;
        this._showCollisionBoxes = value;
        if (value) {
            // When we turn collision boxes on we have to generate them for existing tiles
            // When we turn them off, there's no cost to leaving existing boxes in place
            this.style._generateCollisionBoxes();
        } else {
            // Otherwise, call an update to remove collision boxes
            this._update();
        }
    }

    /**
     * Gets and sets a Boolean indicating whether the map should color-code
     * each fragment to show how many times it has been shaded.
     * White fragments have been shaded 8 or more times.
     * Black fragments have been shaded 0 times.
     * This information is useful for debugging.
     */
    get showOverdrawInspector(): boolean { return !!this._showOverdrawInspector; }
    set showOverdrawInspector(value: boolean) {
        if (this._showOverdrawInspector === value) return;
        this._showOverdrawInspector = value;
        this._update();
    }

    /**
     * Gets and sets a Boolean indicating whether the map will
     * continuously repaint. This information is useful for analyzing performance.
     */
    get repaint(): boolean { return !!this._repaint; }
    set repaint(value: boolean) {
        if (this._repaint !== value) {
            this._repaint = value;
            this.triggerRepaint();
        }
    }
    // show vertices
    get vertices(): boolean { return !!this._vertices; }
    set vertices(value: boolean) { this._vertices = value; this._update(); }

    /**
     * Returns the package version of the library
     * @returns Package version of the library
     */
    get version(): string {
        return version;
    }

    /**
     * Returns the elevation for the point where the camera is looking.
     * This value corresponds to:
     * "meters above sea level" * "exaggeration"
     * @returns The elevation.
     */
    getCameraTargetElevation(): number {
        return this.transform.elevation;
    }
}
