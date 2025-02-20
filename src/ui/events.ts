import {Event} from '../util/evented';

import {DOM} from '../util/dom';
import Point from '@mapbox/point-geometry';
import {extend} from '../util/util';
import type {MapGeoJSONFeature} from '../util/vectortile_to_geojson';

import type {Map} from './map';
import type {LngLat} from '../geo/lng_lat';
import type {ProjectionSpecification, SourceSpecification} from '@maplibre/maplibre-gl-style-spec';

/**
 * An event from the mouse relevant to a specific layer.
 *
 * @group Event Related
 */
export type MapLayerMouseEvent = MapMouseEvent & { features?: MapGeoJSONFeature[] };

/**
 * An event from a touch device relevant to a specific layer.
 *
 * @group Event Related
 */
export type MapLayerTouchEvent = MapTouchEvent & { features?: MapGeoJSONFeature[] };

/**
 * The source event data type
 */
export type MapSourceDataType = 'content' | 'metadata' | 'visibility' | 'idle';

/**
 * `MapLayerEventType` - a mapping between the event name and the event.
 * **Note:** These events are compatible with the optional `layerId` parameter.
 * If `layerId` is included as the second argument in {@link Map#on}, the event listener will fire only when the
 * event action contains a visible portion of the specified layer.
 * The following example can be used for all the events.
 *
 * @group Event Related
 * @example
 * ```ts
 * // Initialize the map
 * let map = new Map({ // map options });
 * // Set an event listener for a specific layer
 * map.on('the-event-name', 'poi-label', (e) => {
 *   console.log('An event has occurred on a visible portion of the poi-label layer');
 * });
 * ```
 */
export type MapLayerEventType = {
    /**
     * Fired when a pointing device (usually a mouse) is pressed and released contains a visible portion of the specified layer.
     *
     * @see [Measure distances](https://maplibre.org/maplibre-gl-js/docs/examples/measure/)
     * @see [Center the map on a clicked symbol](https://maplibre.org/maplibre-gl-js/docs/examples/center-on-symbol/)
     */
    click: MapLayerMouseEvent;
    /**
     * Fired when a pointing device (usually a mouse) is pressed and released twice contains a visible portion of the specified layer.
     *
     * **Note:** Under normal conditions, this event will be preceded by two `click` events.
     */
    dblclick: MapLayerMouseEvent;
    /**
     * Fired when a pointing device (usually a mouse) is pressed while inside a visible portion of the specified layer.
     * @see [Create a draggable point](https://maplibre.org/maplibre-gl-js/docs/examples/drag-a-point/)
     */
    mousedown: MapLayerMouseEvent;
    /**
     * Fired when a pointing device (usually a mouse) is released while inside a visible portion of the specified layer.
     * @see [Create a draggable point](https://maplibre.org/maplibre-gl-js/docs/examples/drag-a-point/)
     */
    mouseup: MapLayerMouseEvent;
    /**
     * Fired when a pointing device (usually a mouse) is moved while the cursor is inside a visible portion of the specified layer.
     * As you move the cursor across the layer, the event will fire every time the cursor changes position within that layer.
     *
     * @see [Get coordinates of the mouse pointer](https://maplibre.org/maplibre-gl-js/docs/examples/mouse-position/)
     * @see [Highlight features under the mouse pointer](https://maplibre.org/maplibre-gl-js/docs/examples/hover-styles/)
     * @see [Display a popup on over](https://maplibre.org/maplibre-gl-js/docs/examples/popup-on-hover/)
     * @see [Animate symbol to follow the mouse](https://maplibre.org/maplibre-gl-js/docs/examples/animate-symbol-to-follow-mouse/)
     */
    mousemove: MapLayerMouseEvent;
    /**
     * Fired when a pointing device (usually a mouse) enters a visible portion of a specified layer from
     * outside that layer or outside the map canvas.
     *
     * @see [Center the map on a clicked symbol](https://maplibre.org/maplibre-gl-js/docs/examples/center-on-symbol/)
     * @see [Display a popup on click](https://maplibre.org/maplibre-gl-js/docs/examples/popup-on-click/)
     */
    mouseenter: MapLayerMouseEvent;
    /**
     * Fired when a pointing device (usually a mouse) leaves a visible portion of a specified layer, or leaves
     * the map canvas.
     *
     * @see [Highlight features under the mouse pointer](https://maplibre.org/maplibre-gl-js/docs/examples/hover-styles/)
     * @see [Display a popup on click](https://maplibre.org/maplibre-gl-js/docs/examples/popup-on-click/)
     */
    mouseleave: MapLayerMouseEvent;
    /**
     * Fired when a pointing device (usually a mouse) is moved inside a visible portion of the specified layer.
     *
     * @see [Get coordinates of the mouse pointer](https://maplibre.org/maplibre-gl-js/docs/examples/mouse-position/)
     * @see [Highlight features under the mouse pointer](https://maplibre.org/maplibre-gl-js/docs/examples/hover-styles/)
     * @see [Display a popup on hover](https://maplibre.org/maplibre-gl-js/docs/examples/popup-on-hover/)
     */
    mouseover: MapLayerMouseEvent;
    /**
     * Fired when a point device (usually a mouse) leaves the visible portion of the specified layer.
     */
    mouseout: MapLayerMouseEvent;
    /**
     * Fired when the right button of the mouse is clicked or the context menu key is pressed within visible portion of the specified layer.
     */
    contextmenu: MapLayerMouseEvent;
    /**
     * Fired when a [`touchstart`](https://developer.mozilla.org/en-US/docs/Web/Events/touchstart) event occurs within the visible portion of the specified layer.
     * @see [Create a draggable point](https://maplibre.org/maplibre-gl-js/docs/examples/drag-a-point/)
     */
    touchstart: MapLayerTouchEvent;
    /**
     * Fired when a [`touchend`](https://developer.mozilla.org/en-US/docs/Web/Events/touchend) event occurs within the visible portion of the specified layer.
     * @see [Create a draggable point](https://maplibre.org/maplibre-gl-js/docs/examples/drag-a-point/)
     */
    touchend: MapLayerTouchEvent;
    /**
     * Fired when a [`touchstart`](https://developer.mozilla.org/en-US/docs/Web/Events/touchstart) event occurs within the visible portion of the specified layer.
     * @see [Create a draggable point](https://maplibre.org/maplibre-gl-js/docs/examples/drag-a-point/)
     */
    touchcancel: MapLayerTouchEvent;
};

/**
 * `MapEventType` - a mapping between the event name and the event value.
 * These events are used with the {@link Map#on} method.
 * When using a `layerId` with {@link Map#on} method, please refer to {@link MapLayerEventType}.
 * The following example can be used for all the events.
 *
 * @group Event Related
 * @example
 * ```ts
 * // Initialize the map
 * let map = new Map({ // map options });
 * // Set an event listener
 * map.on('the-event-name', () => {
 *   console.log('An event has occurred!');
 * });
 * ```
 */
export type MapEventType = {
    /**
     * Fired when an error occurs. This is GL JS's primary error reporting
     * mechanism. We use an event instead of `throw` to better accommodate
     * asynchronous operations. If no listeners are bound to the `error` event, the
     * error will be printed to the console.
     */
    error: ErrorEvent;
    /**
     * Fired immediately after all necessary resources have been downloaded
     * and the first visually complete rendering of the map has occurred.
     *
     * @see [Draw GeoJSON points](https://maplibre.org/maplibre-gl-js/docs/examples/geojson-markers/)
     * @see [Add live realtime data](https://maplibre.org/maplibre-gl-js/docs/examples/live-geojson/)
     * @see [Animate a point](https://maplibre.org/maplibre-gl-js/docs/examples/animate-point-along-line/)
     */
    load: MapLibreEvent;
    /**
     * Fired after the last frame rendered before the map enters an
     * "idle" state:
     *
     * - No camera transitions are in progress
     * - All currently requested tiles have loaded
     * - All fade/transition animations have completed
     */
    idle: MapLibreEvent;
    /**
     * Fired immediately after the map has been removed with {@link Map#remove}.
     */
    remove: MapLibreEvent;
    /**
     * Fired whenever the map is drawn to the screen, as the result of
     *
     * - a change to the map's position, zoom, pitch, or bearing
     * - a change to the map's style
     * - a change to a GeoJSON source
     * - the loading of a vector tile, GeoJSON file, glyph, or sprite
     */
    render: MapLibreEvent;
    /**
     * Fired immediately after the map has been resized.
     */
    resize: MapLibreEvent;
    /**
     * Fired when the WebGL context is lost.
     */
    webglcontextlost: MapContextEvent;
    /**
     * Fired when the WebGL context is restored.
     */
    webglcontextrestored: MapContextEvent;
    /**
     * Fired when any map data (style, source, tile, etc) begins loading or
     * changing asynchronously. All `dataloading` events are followed by a `data`,
     * `dataabort` or `error` event.
     */
    dataloading: MapDataEvent;
    /**
     * Fired when any map data loads or changes. See {@link MapDataEvent} for more information.
     * @see [Display HTML clusters with custom properties](https://maplibre.org/maplibre-gl-js/docs/examples/cluster-html/)
     */
    data: MapDataEvent;
    tiledataloading: MapDataEvent;
    /**
     * Fired when one of the map's sources begins loading or changing asynchronously.
     * All `sourcedataloading` events are followed by a `sourcedata`, `sourcedataabort` or `error` event.
     */
    sourcedataloading: MapSourceDataEvent;
    /**
     * Fired when the map's style begins loading or changing asynchronously.
     * All `styledataloading` events are followed by a `styledata`
     * or `error` event.
     */
    styledataloading: MapStyleDataEvent;
    /**
     * Fired when one of the map's sources loads or changes, including if a tile belonging
     * to a source loads or changes.
     */
    sourcedata: MapSourceDataEvent;
    /**
     * Fired when the map's style loads or changes.
     */
    styledata: MapStyleDataEvent;
    /**
     * Fired when an icon or pattern needed by the style is missing. The missing image can
     * be added with {@link Map#addImage} within this event listener callback to prevent the image from
     * being skipped. This event can be used to dynamically generate icons and patterns.
     * @see [Generate and add a missing icon to the map](https://maplibre.org/maplibre-gl-js/docs/examples/add-image-missing-generated/)
     */
    styleimagemissing: MapStyleImageMissingEvent;
    /**
     * Fired when a request for one of the map's sources' tiles or data is aborted.
     */
    dataabort: MapDataEvent;
    /**
     * Fired when a request for one of the map's sources' data is aborted.
     */
    sourcedataabort: MapSourceDataEvent;
    /**
     * Fired when the user cancels a "box zoom" interaction, or when the bounding box does not meet the minimum size threshold.
     * See {@link BoxZoomHandler}.
     */
    boxzoomcancel: MapLibreZoomEvent;
    /**
     * Fired when a "box zoom" interaction starts. See {@link BoxZoomHandler}.
     */
    boxzoomstart: MapLibreZoomEvent;
    /**
     * Fired when a "box zoom" interaction ends.  See {@link BoxZoomHandler}.
     */
    boxzoomend: MapLibreZoomEvent;
    /**
     * Fired when a [`touchcancel`](https://developer.mozilla.org/en-US/docs/Web/Events/touchcancel) event occurs within the map.
     */
    touchcancel: MapTouchEvent;
    /**
     * Fired when a [`touchmove`](https://developer.mozilla.org/en-US/docs/Web/Events/touchmove) event occurs within the map.
     * @see [Create a draggable point](https://maplibre.org/maplibre-gl-js/docs/examples/drag-a-point/)
     */
    touchmove: MapTouchEvent;
    /**
     * Fired when a [`touchend`](https://developer.mozilla.org/en-US/docs/Web/Events/touchend) event occurs within the map.
     * @see [Create a draggable point](https://maplibre.org/maplibre-gl-js/docs/examples/drag-a-point/)
     */
    touchend: MapTouchEvent;
    /**
     * Fired when a [`touchstart`](https://developer.mozilla.org/en-US/docs/Web/Events/touchstart) event occurs within the map.
     * @see [Create a draggable point](https://maplibre.org/maplibre-gl-js/docs/examples/drag-a-point/)
     */
    touchstart: MapTouchEvent;
    /**
     * Fired when a pointing device (usually a mouse) is pressed and released at the same point on the map.
     *
     * @see [Measure distances](https://maplibre.org/maplibre-gl-js/docs/examples/measure/)
     * @see [Center the map on a clicked symbol](https://maplibre.org/maplibre-gl-js/docs/examples/center-on-symbol/)
     */
    click: MapMouseEvent;
    /**
     * Fired when the right button of the mouse is clicked or the context menu key is pressed within the map.
     */
    contextmenu: MapMouseEvent;
    /**
     * Fired when a pointing device (usually a mouse) is pressed and released twice at the same point on the map in rapid succession.
     *
     * **Note:** Under normal conditions, this event will be preceded by two `click` events.
     */
    dblclick: MapMouseEvent;
    /**
     * Fired when a pointing device (usually a mouse) is moved while the cursor is inside the map.
     * As you move the cursor across the map, the event will fire every time the cursor changes position within the map.
     *
     * @see [Get coordinates of the mouse pointer](https://maplibre.org/maplibre-gl-js/docs/examples/mouse-position/)
     * @see [Highlight features under the mouse pointer](https://maplibre.org/maplibre-gl-js/docs/examples/hover-styles/)
     * @see [Display a popup on over](https://maplibre.org/maplibre-gl-js/docs/examples/popup-on-hover/)
     */
    mousemove: MapMouseEvent;
    /**
     * Fired when a pointing device (usually a mouse) is released within the map.
     *
     * @see [Create a draggable point](https://maplibre.org/maplibre-gl-js/docs/examples/drag-a-point/)
     */
    mouseup: MapMouseEvent;
    /**
     * Fired when a pointing device (usually a mouse) is pressed within the map.
     *
     * @see [Create a draggable point](https://maplibre.org/maplibre-gl-js/docs/examples/drag-a-point/)
     */
    mousedown: MapMouseEvent;
    /**
     * Fired when a point device (usually a mouse) leaves the map's canvas.
     */
    mouseout: MapMouseEvent;
    /**
     * Fired when a pointing device (usually a mouse) is moved within the map.
     * As you move the cursor across a web page containing a map,
     * the event will fire each time it enters the map or any child elements.
     *
     * @see [Get coordinates of the mouse pointer](https://maplibre.org/maplibre-gl-js/docs/examples/mouse-position/)
     * @see [Highlight features under the mouse pointer](https://maplibre.org/maplibre-gl-js/docs/examples/hover-styles/)
     * @see [Display a popup on hover](https://maplibre.org/maplibre-gl-js/docs/examples/popup-on-hover/)
     */
    mouseover: MapMouseEvent;
    /**
     * Fired just before the map begins a transition from one
     * view to another, as the result of either user interaction or methods such as {@link Map#jumpTo}.
     *
     */
    movestart: MapLibreEvent<MouseEvent | TouchEvent | WheelEvent | undefined>;
    /**
     * Fired repeatedly during an animated transition from one view to
     * another, as the result of either user interaction or methods such as {@link Map#flyTo}.
     *
     * @see [Display HTML clusters with custom properties](https://maplibre.org/maplibre-gl-js/docs/examples/cluster-html/)
     */
    move: MapLibreEvent<MouseEvent | TouchEvent | WheelEvent | undefined>;
    /**
     * Fired just after the map completes a transition from one
     * view to another, as the result of either user interaction or methods such as {@link Map#jumpTo}.
     *
     * @see [Display HTML clusters with custom properties](https://maplibre.org/maplibre-gl-js/docs/examples/cluster-html/)
     */
    moveend: MapLibreEvent<MouseEvent | TouchEvent | WheelEvent | undefined>;
    /**
     * Fired just before the map begins a transition from one zoom level to another,
     * as the result of either user interaction or methods such as {@link Map#flyTo}.
     */
    zoomstart: MapLibreEvent<MouseEvent | TouchEvent | WheelEvent | undefined>;
    /**
     * Fired repeatedly during an animated transition from one zoom level to another,
     * as the result of either user interaction or methods such as {@link Map#flyTo}.
     */
    zoom: MapLibreEvent<MouseEvent | TouchEvent | WheelEvent | undefined>;
    /**
     * Fired just after the map completes a transition from one zoom level to another,
     * as the result of either user interaction or methods such as {@link Map#flyTo}.
     */
    zoomend: MapLibreEvent<MouseEvent | TouchEvent | WheelEvent | undefined>;
    /**
     * Fired when a "drag to rotate" interaction starts. See {@link DragRotateHandler}.
     */
    rotatestart: MapLibreEvent<MouseEvent | TouchEvent | undefined>;
    /**
     * Fired repeatedly during a "drag to rotate" interaction. See {@link DragRotateHandler}.
     */
    rotate: MapLibreEvent<MouseEvent | TouchEvent | undefined>;
    /**
     * Fired when a "drag to rotate" interaction ends. See {@link DragRotateHandler}.
     */
    rotateend: MapLibreEvent<MouseEvent | TouchEvent | undefined>;
    /**
     * Fired when a "drag to pan" interaction starts. See {@link DragPanHandler}.
     */
    dragstart: MapLibreEvent<MouseEvent | TouchEvent | undefined>;
    /**
     * Fired repeatedly during a "drag to pan" interaction. See {@link DragPanHandler}.
     */
    drag: MapLibreEvent<MouseEvent | TouchEvent | undefined>;
    /**
     * Fired when a "drag to pan" interaction ends. See {@link DragPanHandler}.
     * @see [Create a draggable marker](https://maplibre.org/maplibre-gl-js/docs/examples/drag-a-marker/)
     */
    dragend: MapLibreEvent<MouseEvent | TouchEvent | undefined>;
    /**
     * Fired whenever the map's pitch (tilt) begins a change as
     * the result of either user interaction or methods such as {@link Map#flyTo} .
     */
    pitchstart: MapLibreEvent<MouseEvent | TouchEvent | undefined>;
    /**
     * Fired repeatedly during the map's pitch (tilt) animation between
     * one state and another as the result of either user interaction
     * or methods such as {@link Map#flyTo}.
     */
    pitch: MapLibreEvent<MouseEvent | TouchEvent | undefined>;
    /**
     * Fired immediately after the map's pitch (tilt) finishes changing as
     * the result of either user interaction or methods such as {@link Map#flyTo}.
     */
    pitchend: MapLibreEvent<MouseEvent | TouchEvent | undefined>;
    /**
     * Fired when a [`wheel`](https://developer.mozilla.org/en-US/docs/Web/Events/wheel) event occurs within the map.
     */
    wheel: MapWheelEvent;
    /**
     * Fired when terrain is changed
     */
    terrain: MapTerrainEvent;
    /**
     * Fired whenever the cooperativeGestures option prevents a gesture from being handled by the map.
     * This is useful for showing your own UI when this happens.
     */
    cooperativegestureprevented: MapLibreEvent<WheelEvent | TouchEvent> & {
        gestureType: 'wheel_zoom' | 'touch_pan';
    };
    /**
     * Fired when map's projection is modified in other ways than by map being moved.
     */
    projectiontransition: MapProjectionEvent;
};

/**
 * The base event for MapLibre
 *
 * @group Event Related
 */
export type MapLibreEvent<TOrig = unknown> = {
    type: keyof MapEventType | keyof MapLayerEventType;
    target: Map;
    originalEvent: TOrig;
};

/**
 * The style data event
 *
 * @group Event Related
 */
export type MapStyleDataEvent = MapLibreEvent & {
    dataType: 'style';
};

/**
 * The source data event interface
 *
 * @group Event Related
 */
export type MapSourceDataEvent = MapLibreEvent & {
    dataType: 'source';
    /**
     * True if the event has a `dataType` of `source` and the source has no outstanding network requests.
     */
    isSourceLoaded: boolean;
    /**
     * The [style spec representation of the source](https://maplibre.org/maplibre-style-spec/#sources) if the event has a `dataType` of `source`.
     */
    source: SourceSpecification;
    sourceId: string;
    sourceDataType: MapSourceDataType;
    sourceDataChanged?: boolean;
    /**
     * The tile being loaded or changed, if the event has a `dataType` of `source` and
     * the event is related to loading of a tile.
     */
    tile: any;
};
/**
 * `MapMouseEvent` is the event type for mouse-related map events.
 *
 * @group Event Related
 *
 * @example
 * ```ts
 * // The `click` event is an example of a `MapMouseEvent`.
 * // Set up an event listener on the map.
 * map.on('click', (e) => {
 *   // The event object (e) contains information like the
 *   // coordinates of the point on the map that was clicked.
 *   console.log('A click event has occurred at ' + e.lngLat);
 * });
 * ```
 */
export class MapMouseEvent extends Event implements MapLibreEvent<MouseEvent> {
    /**
     * The event type
     */
    type: 'mousedown' | 'mouseup' | 'click' | 'dblclick' | 'mousemove' | 'mouseover' | 'mouseenter' | 'mouseleave' | 'mouseout' | 'contextmenu';

    /**
     * The `Map` object that fired the event.
     */
    target: Map;

    /**
     * The DOM event which caused the map event.
     */
    originalEvent: MouseEvent;

    /**
     * The pixel coordinates of the mouse cursor, relative to the map and measured from the top left corner.
     */
    point: Point;

    /**
     * The geographic location on the map of the mouse cursor.
     */
    lngLat: LngLat;

    /**
     * Prevents subsequent default processing of the event by the map.
     *
     * Calling this method will prevent the following default map behaviors:
     *
     *   * On `mousedown` events, the behavior of {@link DragPanHandler}
     *   * On `mousedown` events, the behavior of {@link DragRotateHandler}
     *   * On `mousedown` events, the behavior of {@link BoxZoomHandler}
     *   * On `dblclick` events, the behavior of {@link DoubleClickZoomHandler}
     *
     */
    preventDefault() {
        this._defaultPrevented = true;
    }

    /**
     * `true` if `preventDefault` has been called.
     */
    get defaultPrevented(): boolean {
        return this._defaultPrevented;
    }

    _defaultPrevented: boolean;

    constructor(type: string, map: Map, originalEvent: MouseEvent, data: any = {}) {
        originalEvent = originalEvent instanceof MouseEvent ? originalEvent : new MouseEvent(type, originalEvent);
        const point = DOM.mousePos(map.getCanvas(), originalEvent);
        const lngLat = map.unproject(point);
        super(type, extend({point, lngLat, originalEvent}, data));
        this._defaultPrevented = false;
        this.target = map;
    }
}

/**
 * `MapTouchEvent` is the event type for touch-related map events.
 *
 * @group Event Related
 */
export class MapTouchEvent extends Event implements MapLibreEvent<TouchEvent> {
    /**
     * The event type.
     */
    type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel';

    /**
     * The `Map` object that fired the event.
     */
    target: Map;

    /**
     * The DOM event which caused the map event.
     */
    originalEvent: TouchEvent;

    /**
     * The geographic location on the map of the center of the touch event points.
     */
    lngLat: LngLat;

    /**
     * The pixel coordinates of the center of the touch event points, relative to the map and measured from the top left
     * corner.
     */
    point: Point;

    /**
     * The array of pixel coordinates corresponding to a
     * [touch event's `touches`](https://developer.mozilla.org/en-US/docs/Web/API/TouchEvent/touches) property.
     */
    points: Array<Point>;

    /**
     * The geographical locations on the map corresponding to a
     * [touch event's `touches`](https://developer.mozilla.org/en-US/docs/Web/API/TouchEvent/touches) property.
     */
    lngLats: Array<LngLat>;

    /**
     * Prevents subsequent default processing of the event by the map.
     *
     * Calling this method will prevent the following default map behaviors:
     *
     *   * On `touchstart` events, the behavior of {@link DragPanHandler}
     *   * On `touchstart` events, the behavior of {@link TwoFingersTouchZoomRotateHandler}
     *
     */
    preventDefault() {
        this._defaultPrevented = true;
    }

    /**
     * `true` if `preventDefault` has been called.
     */
    get defaultPrevented(): boolean {
        return this._defaultPrevented;
    }

    _defaultPrevented: boolean;

    constructor(type: string, map: Map, originalEvent: TouchEvent) {
        const touches = type === 'touchend' ? originalEvent.changedTouches : originalEvent.touches;
        const points = DOM.touchPos(map.getCanvasContainer(), touches);
        const lngLats = points.map((t) => map.unproject(t));
        const point = points.reduce((prev, curr, i, arr) => {
            return prev.add(curr.div(arr.length));
        }, new Point(0, 0));
        const lngLat = map.unproject(point);
        super(type, {points, point, lngLats, lngLat, originalEvent});
        this._defaultPrevented = false;
    }
}

/**
 * `MapWheelEvent` is the event type for the `wheel` map event.
 *
 * @group Event Related
 */
export class MapWheelEvent extends Event {
    /**
     * The event type.
     */
    type: 'wheel';

    /**
     * The `Map` object that fired the event.
     */
    target: Map;

    /**
     * The DOM event which caused the map event.
     */
    originalEvent: WheelEvent;

    /**
     * Prevents subsequent default processing of the event by the map.
     *
     * Calling this method will prevent the behavior of {@link ScrollZoomHandler}.
     */
    preventDefault() {
        this._defaultPrevented = true;
    }

    /**
     * `true` if `preventDefault` has been called.
     */
    get defaultPrevented(): boolean {
        return this._defaultPrevented;
    }

    _defaultPrevented: boolean;

    /** */
    constructor(type: string, map: Map, originalEvent: WheelEvent) {
        super(type, {originalEvent});
        this._defaultPrevented = false;
    }
}

/**
 * A `MapLibreZoomEvent` is the event type for the boxzoom-related map events emitted by the {@link BoxZoomHandler}.
 *
 * @group Event Related
 */
export type MapLibreZoomEvent = {
    /**
     * The type of boxzoom event. One of `boxzoomstart`, `boxzoomend` or `boxzoomcancel`
     */
    type: 'boxzoomstart' | 'boxzoomend' | 'boxzoomcancel';
    /**
     * The `Map` instance that triggered the event
     */
    target: Map;
    /**
     * The DOM event that triggered the boxzoom event. Can be a `MouseEvent` or `KeyboardEvent`
     */
    originalEvent: MouseEvent;
};

/**
 * A `MapDataEvent` object is emitted with the `data`
 * and `dataloading` events. Possible values for
 * `dataType`s are:
 *
 * - `'source'`: The non-tile data associated with any source
 * - `'style'`: The [style](https://maplibre.org/maplibre-style-spec/) used by the map
 *
 * Possible values for `sourceDataType`s are:
 *
 * - `'metadata'`: indicates that any necessary source metadata has been loaded (such as TileJSON) and it is ok to start loading tiles
 * - `'content'`: indicates the source data has changed (such as when source.setData() has been called on GeoJSONSource)
 * - `'visibility'`: send when the source becomes used when at least one of its layers becomes visible in style sense (inside the layer's zoom range and with layout.visibility set to 'visible')
 * - `'idle'`: indicates that no new source data has been fetched (but the source has done loading)
 *
 * @group Event Related
 *
 * @example
 * ```ts
 * // The sourcedata event is an example of MapDataEvent.
 * // Set up an event listener on the map.
 * map.on('sourcedata', (e) => {
 *    if (e.isSourceLoaded) {
 *        // Do something when the source has finished loading
 *    }
 * });
 * ```
 */
export type MapDataEvent = {
    /**
     * The event type.
     */
    type: string;
    /**
     * The type of data that has changed. One of `'source'`, `'style'`.
     */
    dataType: string;
    /**
     *  Included if the event has a `dataType` of `source` and the event signals that internal data has been received or changed. Possible values are `metadata`, `content`, `visibility` and `idle`.
     */
    sourceDataType: MapSourceDataType;
};

/**
 * The terrain event
 *
 * @group Event Related
 */
export type MapTerrainEvent = {
    type: 'terrain';
};

/**
 * The map projection event
 *
 * @group Event Related
 */
export type MapProjectionEvent = {
    type: 'projectiontransition';
    /**
     * Specifies the name of the new projection.
     * Additionally includes 'globe-mercator' to describe globe that has internally switched to mercator.
     */
    newProjection: ProjectionSpecification['type'] | 'globe-mercator';
};

/**
 * An event related to the web gl context
 *
 * @group Event Related
 */
export type MapContextEvent = {
    type: 'webglcontextlost' | 'webglcontextrestored';
    originalEvent: WebGLContextEvent;
};

/**
 * The style image missing event
 *
 * @group Event Related
 *
 * @see [Generate and add a missing icon to the map](https://maplibre.org/maplibre-gl-js/docs/examples/add-image-missing-generated/)
 */
export type MapStyleImageMissingEvent = MapLibreEvent & {
    type: 'styleimagemissing';
    id: string;
};
