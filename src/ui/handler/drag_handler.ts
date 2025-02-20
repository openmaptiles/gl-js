import {DOM} from '../../util/dom';
import type Point from '@mapbox/point-geometry';
import {type DragMoveStateManager} from './drag_move_state_manager';
import {type Handler} from '../handler_manager';

interface DragMovementResult {
    bearingDelta?: number;
    pitchDelta?: number;
    rollDelta?: number;
    around?: Point;
    panDelta?: Point;
}

export interface DragPanResult extends DragMovementResult {
    around: Point;
    panDelta: Point;
}

export interface DragRotateResult extends DragMovementResult {
    bearingDelta: number;
}

export interface DragPitchResult extends DragMovementResult {
    pitchDelta: number;
}

export interface DragRollResult extends DragMovementResult {
    rollDelta: number;
}

type DragMoveFunction<T extends DragMovementResult> = (lastPoint: Point, currnetPoint: Point) => T;

export interface DragMoveHandler<T extends DragMovementResult, E extends Event> extends Handler {
    dragStart: (e: E, point: Point) => void;
    dragMove: (e: E, point: Point) => T | void;
    dragEnd: (e: E) => void;
}

export type DragMoveHandlerOptions<T, E extends Event> = {
    /**
     * If the movement is shorter than this value, consider it a click.
     */
    clickTolerance: number;
    /**
     * The move function to run on a valid movement.
     */
    move: DragMoveFunction<T>;
    /**
     * A class used to manage the state of the drag event - start, checking valid moves, end. See the class documentation for more details.
     */
    moveStateManager: DragMoveStateManager<E>;
    /**
     * A method used to assign the dragStart, dragMove, and dragEnd methods to the relevant event handlers, as well as assigning the contextmenu handler
     * @param handler - the handler
     */
    assignEvents: (handler: DragMoveHandler<T, E>) => void;
    /**
     * Should the move start on the "start" event, or should it start on the first valid move.
     */
    activateOnStart?: boolean;
    /**
     * If true, handler will be enabled during construction
     */
    enable?: boolean;

    buttons?: number[];
};

/**
 * A generic class to create handlers for drag events, from both mouse and touch events.
 */
export class DragHandler<T extends DragMovementResult, E extends Event> implements DragMoveHandler<T, E> {
    // Event handlers that may be assigned by the implementations of this class
    contextmenu?: Handler['contextmenu'];
    mousedown?: Handler['mousedown'];
    mousemoveWindow?: Handler['mousemoveWindow'];
    mouseup?: Handler['mouseup'];
    touchstart?: Handler['touchstart'];
    touchmoveWindow?: Handler['touchmoveWindow'];
    touchend?: Handler['touchend'];

    _clickTolerance: number;
    _moveFunction: DragMoveFunction<T>;
    _activateOnStart: boolean;
    _active: boolean;
    _enabled: boolean;
    _moved: boolean;
    _lastPoint: Point | null;
    _moveStateManager: DragMoveStateManager<E>;

    constructor(options: DragMoveHandlerOptions<T, E>) {
        this._enabled = !!options.enable;
        this._moveStateManager = options.moveStateManager;
        this._clickTolerance = options.clickTolerance || 1;
        this._moveFunction = options.move;
        this._activateOnStart = !!options.activateOnStart;

        options.assignEvents(this);

        if (options.buttons) {
            this._moveStateManager.updateButtons(options.buttons);
        }
        this.reset();
    }

    reset(e?: E) {
        this._active = false;
        this._moved = false;
        delete this._lastPoint;
        this._moveStateManager.endMove(e);
    }

    _move(...params: Parameters<DragMoveFunction<T>>) {
        const move = this._moveFunction(...params);
        if (move.bearingDelta || move.pitchDelta || move.rollDelta || move.around || move.panDelta) {
            this._active = true;
            return move;
        }
    }

    dragStart(e: E, point: Point);
    dragStart(e: E, point: Point[]);
    dragStart(e: E, point: Point | Point[]) {
        if (!this.isEnabled() || this._lastPoint) return;

        if (!this._moveStateManager.isValidStartEvent(e)) return;
        this._moveStateManager.startMove(e);

        this._lastPoint = Array.isArray(point) ? point[0] : point;

        if (this._activateOnStart && this._lastPoint) this._active = true;
    }

    dragMove(e: E, point: Point);
    dragMove(e: E, point: Point[]);
    dragMove(e: E, point: Point | Point[]) {
        if (!this.isEnabled()) return;
        const lastPoint = this._lastPoint;
        if (!lastPoint) return;
        e.preventDefault();

        if (!this._moveStateManager.isValidMoveEvent(e)) {
            this.reset(e);
            return;
        }

        const movePoint = Array.isArray(point) ? point[0] : point;

        if (!this._moved && movePoint.dist(lastPoint) < this._clickTolerance) return;
        this._moved = true;
        this._lastPoint = movePoint;

        return this._move(lastPoint, movePoint);
    }

    dragEnd(e: E) {
        if (!this.isEnabled() || !this._lastPoint) return;
        if (!this._moveStateManager.isValidEndEvent(e)) return;
        if (this._moved) DOM.suppressClick();
        this.reset(e);
    }

    enable(options?: { buttons?: number[] }): void {
        if (options && options.buttons) {
            this._moveStateManager.updateButtons(options.buttons);
        }
        this._enabled = true;
    }

    disable() {
        this._enabled = false;
        this.reset();
    }

    isEnabled() {
        return this._enabled;
    }

    isActive() {
        return this._active;
    }

    getClickTolerance() {
        return this._clickTolerance;
    }
}
