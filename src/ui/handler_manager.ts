import {Event} from '../util/evented';
import {DOM} from '../util/dom';
import {type Map, type CompleteMapOptions} from './map';
import {HandlerInertia} from './handler_inertia';
import {MapEventHandler, BlockableMapEventHandler} from './handler/map_event';
import {BoxZoomHandler} from './handler/box_zoom';
import {TapZoomHandler} from './handler/tap_zoom';
import {generateMouseRotationHandler, generateMousePitchHandler, generateMousePanHandler, generateMouseRollHandler} from './handler/mouse';
import {TouchPanHandler} from './handler/touch_pan';
import {TwoFingersTouchZoomHandler, TwoFingersTouchRotateHandler, TwoFingersTouchPitchHandler} from './handler/two_fingers_touch';
import {KeyboardHandler} from './handler/keyboard';
import {ScrollZoomHandler} from './handler/scroll_zoom';
import {DoubleClickZoomHandler} from './handler/shim/dblclick_zoom';
import {ClickZoomHandler} from './handler/click_zoom';
import {TapDragZoomHandler} from './handler/tap_drag_zoom';
import {DragPanHandler} from './handler/shim/drag_pan';
import {DragRotateHandler} from './handler/shim/drag_rotate';
import {TwoFingersTouchZoomRotateHandler} from './handler/shim/two_fingers_touch';
import {CooperativeGesturesHandler} from './handler/cooperative_gestures';
import {extend, isPointableEvent, isTouchableEvent, isTouchableOrPointableType} from '../util/util';
import {browser} from '../util/browser';
import Point from '@mapbox/point-geometry';
import {type MapControlsDeltas} from '../geo/projection/camera_helper';

const isMoving = (p: EventsInProgress) => p.zoom || p.drag || p.roll || p.pitch || p.rotate;

class RenderFrameEvent extends Event {
    type: 'renderFrame';
    timeStamp: number;
}

/**
 * Handlers interpret dom events and return camera changes that should be
 * applied to the map (`HandlerResult`s). The camera changes are all deltas.
 * The handler itself should have no knowledge of the map's current state.
 * This makes it easier to merge multiple results and keeps handlers simpler.
 * For example, if there is a mousedown and mousemove, the mousePan handler
 * would return a `panDelta` on the mousemove.
 */
export interface Handler {
    enable(): void;
    disable(): void;
    isEnabled(): boolean;
    /**
     * This is used to indicate if the handler is currently active or not.
     * In case a handler is active, it will block other handlers from getting the relevant events.
     * There is an allow list of handlers that can be active at the same time, which is configured when adding a handler.
     */
    isActive(): boolean;
    /**
     * `reset` can be called by the manager at any time and must reset everything to it's original state
     */
    reset(): void;
    // Handlers can optionally implement these methods.
    // They are called with dom events whenever those dom evens are received.
    readonly touchstart?: (e: TouchEvent, points: Array<Point>, mapTouches: Array<Touch>) => HandlerResult | void;
    readonly touchmove?: (e: TouchEvent, points: Array<Point>, mapTouches: Array<Touch>) => HandlerResult | void;
    readonly touchmoveWindow?: (e: TouchEvent, points: Array<Point>, mapTouches: Array<Touch>) => HandlerResult | void;
    readonly touchend?: (e: TouchEvent, points: Array<Point>, mapTouches: Array<Touch>) => HandlerResult | void;
    readonly touchcancel?: (e: TouchEvent, points: Array<Point>, mapTouches: Array<Touch>) => HandlerResult | void;
    readonly mousedown?: (e: MouseEvent, point: Point) => HandlerResult | void;
    readonly mousemove?: (e: MouseEvent, point: Point) => HandlerResult | void;
    readonly mousemoveWindow?: (e: MouseEvent, point: Point) => HandlerResult | void;
    readonly mouseup?: (e: MouseEvent, point: Point) => HandlerResult | void;
    readonly mouseupWindow?: (e: MouseEvent, point: Point) => HandlerResult | void;
    readonly dblclick?: (e: MouseEvent, point: Point) => HandlerResult | void;
    readonly contextmenu?: (e: MouseEvent) => HandlerResult | void;
    readonly wheel?: (e: WheelEvent, point: Point) => HandlerResult | void;
    readonly keydown?: (e: KeyboardEvent) => HandlerResult | void;
    readonly keyup?: (e: KeyboardEvent) => HandlerResult | void;
    /**
     * `renderFrame` is the only non-dom event. It is called during render
     * frames and can be used to smooth camera changes (see scroll handler).
     */
    readonly renderFrame?: () => HandlerResult | void;
}

/**
 * All handler methods that are called with events can optionally return a `HandlerResult`.
 */
export type HandlerResult = {
    panDelta?: Point;
    zoomDelta?: number;
    bearingDelta?: number;
    pitchDelta?: number;
    rollDelta?: number;
    /**
     * the point to not move when changing the camera
     */
    around?: Point | null;
    /**
     * same as above, except for pinch actions, which are given higher priority
     */
    pinchAround?: Point | null;
    /**
     * A method that can fire a one-off easing by directly changing the map's camera.
     */
    cameraAnimation?: (map: Map) => any;
    /**
     * The last three properties are needed by only one handler: scrollzoom.
     * The DOM event to be used as the `originalEvent` on any camera change events.
     */
    originalEvent?: Event;
    /**
     * Makes the manager trigger a frame, allowing the handler to return multiple results over time (see scrollzoom).
     */
    needsRenderFrame?: boolean;
    /**
     * The camera changes won't get recorded for inertial zooming.
     */
    noInertia?: boolean;
};

export type EventInProgress = {
    handlerName: string;
    originalEvent: Event;
};

export type EventsInProgress = {
    zoom?: EventInProgress;
    roll?: EventInProgress;
    pitch?: EventInProgress;
    rotate?: EventInProgress;
    drag?: EventInProgress;
};

function hasChange(result: HandlerResult) {
    return (result.panDelta && result.panDelta.mag()) || result.zoomDelta || result.bearingDelta || result.pitchDelta || result.rollDelta;
}

export class HandlerManager {
    _map: Map;
    _el: HTMLElement;
    _handlers: Array<{
        handlerName: string;
        handler: Handler;
        allowed: Array<string>;
    }>;
    _eventsInProgress: EventsInProgress;
    _frameId: number;
    _inertia: HandlerInertia;
    _bearingSnap: number;
    _handlersById: {[x: string]: Handler};
    _updatingCamera: boolean;
    _changes: Array<[HandlerResult, EventsInProgress, {[handlerName: string]: Event}]>;
    _terrainMovement: boolean;
    _zoom: {handlerName: string};
    _previousActiveHandlers: {[x: string]: Handler};
    _listeners: Array<[Window | Document | HTMLElement, string, {
        passive?: boolean;
        capture?: boolean;
    } | undefined]>;

    constructor(map: Map, options: CompleteMapOptions) {
        this._map = map;
        this._el = this._map.getCanvasContainer();
        this._handlers = [];
        this._handlersById = {};
        this._changes = [];

        this._inertia = new HandlerInertia(map);
        this._bearingSnap = options.bearingSnap;
        this._previousActiveHandlers = {};

        // Track whether map is currently moving, to compute start/move/end events
        this._eventsInProgress = {};

        this._addDefaultHandlers(options);

        const el = this._el;

        this._listeners = [
            // This needs to be `passive: true` so that a double tap fires two
            // pairs of touchstart/end events in iOS Safari 13. If this is set to
            // `passive: false` then the second pair of events is only fired if
            // preventDefault() is called on the first touchstart. Calling preventDefault()
            // undesirably prevents click events.
            [el, 'touchstart', {passive: true}],
            // This needs to be `passive: false` so that scrolls and pinches can be
            // prevented in browsers that don't support `touch-actions: none`, for example iOS Safari 12.
            [el, 'touchmove', {passive: false}],
            [el, 'touchend', undefined],
            [el, 'touchcancel', undefined],

            [el, 'mousedown', undefined],
            [el, 'mousemove', undefined],
            [el, 'mouseup', undefined],

            // Bind window-level event listeners for move and up/end events. In the absence of
            // the pointer capture API, which is not supported by all necessary platforms,
            // window-level event listeners give us the best shot at capturing events that
            // fall outside the map canvas element. Use `{capture: true}` for the move event
            // to prevent map move events from being fired during a drag.
            [document, 'mousemove', {capture: true}],
            [document, 'mouseup', undefined],

            [el, 'mouseover', undefined],
            [el, 'mouseout', undefined],
            [el, 'dblclick', undefined],
            [el, 'click', undefined],

            [el, 'keydown', {capture: false}],
            [el, 'keyup', undefined],

            [el, 'wheel', {passive: false}],
            [el, 'contextmenu', undefined],

            [window, 'blur', undefined]
        ];

        for (const [target, type, listenerOptions] of this._listeners) {
            DOM.addEventListener(target, type, target === document ? this.handleWindowEvent : this.handleEvent, listenerOptions);
        }
    }

    destroy() {
        for (const [target, type, listenerOptions] of this._listeners) {
            DOM.removeEventListener(target, type, target === document ? this.handleWindowEvent : this.handleEvent, listenerOptions);
        }
    }

    _addDefaultHandlers(options: CompleteMapOptions) {
        const map = this._map;
        const el = map.getCanvasContainer();
        this._add('mapEvent', new MapEventHandler(map, options));

        const boxZoom = map.boxZoom = new BoxZoomHandler(map, options);
        this._add('boxZoom', boxZoom);
        if (options.interactive && options.boxZoom) {
            boxZoom.enable();
        }

        const cooperativeGestures = map.cooperativeGestures = new CooperativeGesturesHandler(map, options.cooperativeGestures);
        this._add('cooperativeGestures', cooperativeGestures);
        if (options.cooperativeGestures) {
            cooperativeGestures.enable();
        }

        const tapZoom = new TapZoomHandler(map);
        const clickZoom = new ClickZoomHandler(map);
        map.doubleClickZoom = new DoubleClickZoomHandler(clickZoom, tapZoom);
        this._add('tapZoom', tapZoom);
        this._add('clickZoom', clickZoom);
        if (options.interactive && options.doubleClickZoom) {
            map.doubleClickZoom.enable();
        }

        const tapDragZoom = new TapDragZoomHandler();
        this._add('tapDragZoom', tapDragZoom);

        const touchPitch = map.touchPitch = new TwoFingersTouchPitchHandler(map);
        this._add('touchPitch', touchPitch);
        if (options.interactive && options.touchPitch) {
            map.touchPitch.enable(options.touchPitch);
        }
        const getCenter = () => map.project(map.getCenter());
        const mouseRotate = generateMouseRotationHandler(options, getCenter);
        const mousePitch = generateMousePitchHandler(options);
        const mouseRoll = generateMouseRollHandler(options, getCenter);
        map.dragRotate = new DragRotateHandler(options, mouseRotate, mousePitch, mouseRoll);
        this._add('mouseRotate', mouseRotate, ['mousePitch']);
        this._add('mousePitch', mousePitch, ['mouseRotate', 'mouseRoll']);
        this._add('mouseRoll', mouseRoll, ['mousePitch']);
        if (options.interactive && options.dragRotate) {
            map.dragRotate.enable();
        }

        const mousePan = generateMousePanHandler(options);
        const touchPan = new TouchPanHandler(options, map);
        map.dragPan = new DragPanHandler(el, mousePan, touchPan);
        this._add('mousePan', mousePan);
        this._add('touchPan', touchPan, ['touchZoom', 'touchRotate']);
        if (options.interactive && options.dragPan) {
            map.dragPan.enable(options.dragPan);
        }

        const touchRotate = new TwoFingersTouchRotateHandler();
        const touchZoom = new TwoFingersTouchZoomHandler();
        map.touchZoomRotate = new TwoFingersTouchZoomRotateHandler(el, touchZoom, touchRotate, tapDragZoom);
        this._add('touchRotate', touchRotate, ['touchPan', 'touchZoom']);
        this._add('touchZoom', touchZoom, ['touchPan', 'touchRotate']);
        if (options.interactive && options.touchZoomRotate) {
            map.touchZoomRotate.enable(options.touchZoomRotate);
        }

        const scrollZoom = map.scrollZoom = new ScrollZoomHandler(map, () => this._triggerRenderFrame());
        this._add('scrollZoom', scrollZoom, ['mousePan']);
        if (options.interactive && options.scrollZoom) {
            map.scrollZoom.enable(options.scrollZoom);
        }

        const keyboard = map.keyboard = new KeyboardHandler(map);
        this._add('keyboard', keyboard);
        if (options.interactive && options.keyboard) {
            map.keyboard.enable();
        }

        this._add('blockableMapEvent', new BlockableMapEventHandler(map));
    }

    _add(handlerName: string, handler: Handler, allowed?: Array<string>) {
        this._handlers.push({handlerName, handler, allowed});
        this._handlersById[handlerName] = handler;
    }

    stop(allowEndAnimation: boolean) {
        // do nothing if this method was triggered by a gesture update
        if (this._updatingCamera) return;

        for (const {handler} of this._handlers) {
            handler.reset();
        }
        this._inertia.clear();
        this._fireEvents({}, {}, allowEndAnimation);
        this._changes = [];
    }

    isActive() {
        for (const {handler} of this._handlers) {
            if (handler.isActive()) return true;
        }
        return false;
    }

    isZooming() {
        return !!this._eventsInProgress.zoom || this._map.scrollZoom.isZooming();
    }
    isRotating() {
        return !!this._eventsInProgress.rotate;
    }

    isMoving() {
        return Boolean(isMoving(this._eventsInProgress)) || this.isZooming();
    }

    _blockedByActive(activeHandlers: {[x: string]: Handler}, allowed: Array<string>, myName: string) {
        for (const name in activeHandlers) {
            if (name === myName) continue;
            if (!allowed || allowed.indexOf(name) < 0) {
                return true;
            }
        }
        return false;
    }

    handleWindowEvent = (e: { type: 'mousemove' | 'mouseup' | 'touchmove'}) => {
        this.handleEvent(e, `${e.type}Window`);
    };

    _getMapTouches(touches: TouchList) {
        const mapTouches = [];
        for (const t of touches) {
            const target = (t.target as any as Node);
            if (this._el.contains(target)) {
                mapTouches.push(t);
            }
        }
        return mapTouches as any as TouchList;
    }

    handleEvent = (e: Event, eventName?: keyof Handler) => {

        if (e.type === 'blur') {
            this.stop(true);
            return;
        }

        this._updatingCamera = true;

        const inputEvent = e.type === 'renderFrame' ? undefined : e as UIEvent;

        /*
         * We don't call e.preventDefault() for any events by default.
         * Handlers are responsible for calling it where necessary.
         */

        const mergedHandlerResult: HandlerResult = {needsRenderFrame: false};
        const eventsInProgress: EventsInProgress = {};
        const activeHandlers = {};

        for (const {handlerName, handler, allowed} of this._handlers) {
            if (!handler.isEnabled()) continue;

            let data: HandlerResult;
            if (this._blockedByActive(activeHandlers, allowed, handlerName)) {
                handler.reset();

            } else {
                if (handler[eventName || e.type]) {
                    if (isPointableEvent(e, eventName || e.type)){
                        const point = DOM.mousePos(this._map.getCanvas(), e);
                        data = handler[eventName || e.type](e, point);
                    } else if (isTouchableEvent(e, eventName || e.type)) {
                        const eventTouches = (e as TouchEvent).touches;
                        const mapTouches = this._getMapTouches(eventTouches);
                        const points = DOM.touchPos(this._map.getCanvas(), mapTouches);
                        data = handler[eventName || e.type](e, points, mapTouches);
                    } else if (!isTouchableOrPointableType(eventName || e.type)) {
                        data = handler[eventName || e.type](e);
                    }
                    this.mergeHandlerResult(mergedHandlerResult, eventsInProgress, data, handlerName, inputEvent);
                    if (data && data.needsRenderFrame) {
                        this._triggerRenderFrame();
                    }
                }
            }

            if (data || handler.isActive()) {
                activeHandlers[handlerName] = handler;
            }
        }

        const deactivatedHandlers: {[handlerName: string]: Event} = {};
        for (const name in this._previousActiveHandlers) {
            if (!activeHandlers[name]) {
                deactivatedHandlers[name] = inputEvent;
            }
        }
        this._previousActiveHandlers = activeHandlers;

        if (Object.keys(deactivatedHandlers).length || hasChange(mergedHandlerResult)) {
            this._changes.push([mergedHandlerResult, eventsInProgress, deactivatedHandlers]);
            this._triggerRenderFrame();
        }

        if (Object.keys(activeHandlers).length || hasChange(mergedHandlerResult)) {
            this._map._stop(true);
        }

        this._updatingCamera = false;

        const {cameraAnimation} = mergedHandlerResult;
        if (cameraAnimation) {
            this._inertia.clear();
            this._fireEvents({}, {}, true);
            this._changes = [];
            cameraAnimation(this._map);
        }
    };

    mergeHandlerResult(mergedHandlerResult: HandlerResult,
        eventsInProgress: EventsInProgress,
        handlerResult: HandlerResult,
        name: string,
        e?: UIEvent) {
        if (!handlerResult) return;

        extend(mergedHandlerResult, handlerResult);

        const eventData = {handlerName: name, originalEvent: handlerResult.originalEvent || e};

        // track which handler changed which camera property
        if (handlerResult.zoomDelta !== undefined) {
            eventsInProgress.zoom = eventData;
        }
        if (handlerResult.panDelta !== undefined) {
            eventsInProgress.drag = eventData;
        }
        if (handlerResult.rollDelta !== undefined) {
            eventsInProgress.roll = eventData;
        }
        if (handlerResult.pitchDelta !== undefined) {
            eventsInProgress.pitch = eventData;
        }
        if (handlerResult.bearingDelta !== undefined) {
            eventsInProgress.rotate = eventData;
        }

    }

    _applyChanges() {
        const combined: HandlerResult = {};
        const combinedEventsInProgress: EventsInProgress = {};
        const combinedDeactivatedHandlers = {};

        for (const [change, eventsInProgress, deactivatedHandlers] of this._changes) {

            if (change.panDelta) combined.panDelta = (combined.panDelta || new Point(0, 0))._add(change.panDelta);
            if (change.zoomDelta) combined.zoomDelta = (combined.zoomDelta || 0) + change.zoomDelta;
            if (change.bearingDelta) combined.bearingDelta = (combined.bearingDelta || 0) + change.bearingDelta;
            if (change.pitchDelta) combined.pitchDelta = (combined.pitchDelta || 0) + change.pitchDelta;
            if (change.rollDelta) combined.rollDelta = (combined.rollDelta || 0) + change.rollDelta;
            if (change.around !== undefined) combined.around = change.around;
            if (change.pinchAround !== undefined) combined.pinchAround = change.pinchAround;
            if (change.noInertia) combined.noInertia = change.noInertia;

            extend(combinedEventsInProgress, eventsInProgress);
            extend(combinedDeactivatedHandlers, deactivatedHandlers);
        }

        this._updateMapTransform(combined, combinedEventsInProgress, combinedDeactivatedHandlers);
        this._changes = [];
    }

    _updateMapTransform(combinedResult: HandlerResult,
        combinedEventsInProgress: EventsInProgress,
        deactivatedHandlers: {[handlerName: string]: Event}) {
        const map = this._map;
        const tr = map._getTransformForUpdate();
        const terrain = map.terrain;

        if (!hasChange(combinedResult) && !(terrain && this._terrainMovement)) {
            return this._fireEvents(combinedEventsInProgress, deactivatedHandlers, true);
        }

        // stop any ongoing camera animations (easeTo, flyTo)
        map._stop(true);

        let {panDelta, zoomDelta, bearingDelta, pitchDelta, rollDelta, around, pinchAround} = combinedResult;

        if (pinchAround !== undefined) {
            around = pinchAround;
        }

        around = around || map.transform.centerPoint;

        if (terrain && !tr.isPointOnMapSurface(around)) {
            around = tr.centerPoint;
        }

        const deltasForHelper: MapControlsDeltas = {
            panDelta,
            zoomDelta,
            rollDelta,
            pitchDelta,
            bearingDelta,
            around,
        };

        // Pre-zoom location under the mouse cursor is required for accurate mercator panning and zooming
        if (this._map.cameraHelper.useGlobeControls && !tr.isPointOnMapSurface(around)) {
            around = tr.centerPoint;
        }
        // If we are rotating about the center point, avoid numerical issues near the horizon by using the transform's
        // center directly, instead of computing it from the screen point
        const preZoomAroundLoc = around.distSqr(tr.centerPoint) < 1.0e-2 ?
            tr.center :
            tr.screenPointToLocation(panDelta ? around.sub(panDelta) : around);

        if (!terrain) {
            // Apply zoom, bearing, pitch, roll
            this._map.cameraHelper.handleMapControlsRollPitchBearingZoom(deltasForHelper, tr);
            // Apply panning
            this._map.cameraHelper.handleMapControlsPan(deltasForHelper, tr, preZoomAroundLoc);
        } else {
            // Apply zoom, bearing, pitch, roll
            this._map.cameraHelper.handleMapControlsRollPitchBearingZoom(deltasForHelper, tr);
            // when 3d-terrain is enabled act a little different:
            //    - dragging do not drag the picked point itself, instead it drags the map by pixel-delta.
            //      With this approach it is no longer possible to pick a point from somewhere near
            //      the horizon to the center in one move.
            //      So this logic avoids the problem, that in such cases you easily loose orientation.
            if (!this._terrainMovement &&
                (combinedEventsInProgress.drag || combinedEventsInProgress.zoom)) {
                // When starting to drag or move, flag it and register moveend to clear flagging
                this._terrainMovement = true;
                this._map._elevationFreeze = true;
                this._map.cameraHelper.handleMapControlsPan(deltasForHelper, tr, preZoomAroundLoc);
            } else if (combinedEventsInProgress.drag && this._terrainMovement) {
                // drag map
                tr.setCenter(tr.screenPointToLocation(tr.centerPoint.sub(panDelta)));
            } else {
                this._map.cameraHelper.handleMapControlsPan(deltasForHelper, tr, preZoomAroundLoc);
            }
        }

        map._applyUpdatedTransform(tr);

        this._map._update();
        if (!combinedResult.noInertia) this._inertia.record(combinedResult);
        this._fireEvents(combinedEventsInProgress, deactivatedHandlers, true);

    }

    _fireEvents(newEventsInProgress: EventsInProgress, deactivatedHandlers: {[handlerName: string]: Event}, allowEndAnimation: boolean) {

        const wasMoving = isMoving(this._eventsInProgress);
        const nowMoving = isMoving(newEventsInProgress);

        const startEvents = {};

        for (const eventName in newEventsInProgress) {
            const {originalEvent} = newEventsInProgress[eventName];
            if (!this._eventsInProgress[eventName]) {
                startEvents[`${eventName}start`] = originalEvent;
            }
            this._eventsInProgress[eventName] = newEventsInProgress[eventName];
        }

        // fire start events only after this._eventsInProgress has been updated
        if (!wasMoving && nowMoving) {
            this._fireEvent('movestart', nowMoving.originalEvent);
        }

        for (const name in startEvents) {
            this._fireEvent(name, startEvents[name]);
        }

        if (nowMoving) {
            this._fireEvent('move', nowMoving.originalEvent);
        }

        for (const eventName in newEventsInProgress) {
            const {originalEvent} = newEventsInProgress[eventName];
            this._fireEvent(eventName, originalEvent);
        }

        const endEvents = {};

        let originalEndEvent;
        for (const eventName in this._eventsInProgress) {
            const {handlerName, originalEvent} = this._eventsInProgress[eventName];
            if (!this._handlersById[handlerName].isActive()) {
                delete this._eventsInProgress[eventName];
                originalEndEvent = deactivatedHandlers[handlerName] || originalEvent;
                endEvents[`${eventName}end`] = originalEndEvent;
            }
        }

        for (const name in endEvents) {
            this._fireEvent(name, endEvents[name]);
        }

        const stillMoving = isMoving(this._eventsInProgress);
        const finishedMoving = (wasMoving || nowMoving) && !stillMoving;
        if (finishedMoving && this._terrainMovement) {
            this._map._elevationFreeze = false;
            this._terrainMovement = false;
            const tr = this._map._getTransformForUpdate();
            if (this._map.getCenterClampedToGround()) {
                tr.recalculateZoomAndCenter(this._map.terrain);
            }
            this._map._applyUpdatedTransform(tr);
        }
        if (allowEndAnimation && finishedMoving) {
            this._updatingCamera = true;
            const inertialEase = this._inertia._onMoveEnd(this._map.dragPan._inertiaOptions);

            const shouldSnapToNorth = bearing => bearing !== 0 && -this._bearingSnap < bearing && bearing < this._bearingSnap;

            if (inertialEase && (inertialEase.essential || !browser.prefersReducedMotion)) {
                if (shouldSnapToNorth(inertialEase.bearing || this._map.getBearing())) {
                    inertialEase.bearing = 0;
                }
                inertialEase.freezeElevation = true;
                this._map.easeTo(inertialEase, {originalEvent: originalEndEvent});
            } else {
                this._map.fire(new Event('moveend', {originalEvent: originalEndEvent}));
                if (shouldSnapToNorth(this._map.getBearing())) {
                    this._map.resetNorth();
                }
            }
            this._updatingCamera = false;
        }

    }

    _fireEvent(type: string, e?: Event) {
        this._map.fire(new Event(type, e ? {originalEvent: e} : {}));
    }

    _requestFrame() {
        this._map.triggerRepaint();
        return this._map._renderTaskQueue.add(timeStamp => {
            delete this._frameId;
            this.handleEvent(new RenderFrameEvent('renderFrame', {timeStamp}));
            this._applyChanges();
        });
    }

    _triggerRenderFrame() {
        if (this._frameId === undefined) {
            this._frameId = this._requestFrame();
        }
    }
}
