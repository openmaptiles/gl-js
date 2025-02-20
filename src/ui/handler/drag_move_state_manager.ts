import {DOM} from '../../util/dom';

const LEFT_BUTTON = 0;
const MIDDLE_BUTTON = 1;
const RIGHT_BUTTON = 2;

// the values for each button in MouseEvent.buttons
const BUTTONS_FLAGS = {
    [LEFT_BUTTON]: 1,
    [MIDDLE_BUTTON]: 4,
    [RIGHT_BUTTON]: 2,
};

function buttonNoLongerPressed(e: MouseEvent, button: number) {
    const flag = BUTTONS_FLAGS[button];
    return e.buttons === undefined || (e.buttons & flag) !== flag;
}

/*
 * Drag events are initiated by specific interaction which needs to be tracked until it ends.
 * This requires some state management:
 * 1. registering the initiating event,
 * 2. tracking that it was not canceled / not confusing it with another event firing.
 * 3. recognizing the ending event and cleaning up any internal state
 *
 * Concretely, we implement two state managers:
 * 1. MouseMoveStateManager
 *      Receives a functions that is used to recognize mouse events that should be registered as the
 *      relevant drag interactions - i.e. dragging with the right mouse button, or while CTRL is pressed.
 * 2. OneFingerTouchMoveStateManager
 *      Checks if a drag event is using one finger, and continuously tracking that this is the same event
 *      (i.e. to make sure not additional finger has started interacting with the screen before raising
 *      the first finger).
 */
export interface DragMoveStateManager<E extends Event> {
    startMove: (e: E) => void;
    endMove: (e?: E) => void;
    isValidStartEvent: (e: E) => boolean;
    isValidMoveEvent: (e: E) => boolean;
    isValidEndEvent: (e?: E) => boolean;
    updateButtons?: (buttons: number[]) => void;
}

export class MouseMoveStateManager implements DragMoveStateManager<MouseEvent> {
    _eventButton: number | undefined;
    _correctEvent: (e: MouseEvent, buttons?: number[]) => boolean;
    _buttons: number[] = [LEFT_BUTTON];

    constructor(options: {
        checkCorrectEvent: (e: MouseEvent, buttons?:number[]) => boolean;
    }) {
        this._correctEvent = options.checkCorrectEvent;
    }

    startMove(e: MouseEvent) {
        const eventButton = DOM.mouseButton(e);
        this._eventButton = eventButton;
    }

    endMove(_e?: MouseEvent) {
        delete this._eventButton;
    }

    isValidStartEvent(e: MouseEvent) {
        return this._correctEvent(e, this._buttons);
    }

    isValidMoveEvent(e: MouseEvent) {
        // Some browsers don't fire a `mouseup` when the mouseup occurs outside
        // the window or iframe:
        // https://github.com/mapbox/mapbox-gl-js/issues/4622
        //
        // If the button is no longer pressed during this `mousemove` it may have
        // been released outside of the window or iframe.
        return !buttonNoLongerPressed(e, this._eventButton);
    }

    isValidEndEvent(e: MouseEvent) {
        const eventButton = DOM.mouseButton(e);
        return eventButton === this._eventButton;
    }

    updateButtons(buttons: number[]) {
        this._buttons = buttons;
    }
}

export class OneFingerTouchMoveStateManager implements DragMoveStateManager<TouchEvent> {
    _firstTouch: number | undefined;

    constructor() {
        this._firstTouch = undefined;
    }

    _isOneFingerTouch(e: TouchEvent) {
        return e.targetTouches.length === 1;
    }

    _isSameTouchEvent(e: TouchEvent) {
        return e.targetTouches[0].identifier === this._firstTouch;
    }

    startMove(e: TouchEvent) {
        const firstTouch = e.targetTouches[0].identifier;
        this._firstTouch = firstTouch;
    }

    endMove(_e?: TouchEvent) {
        delete this._firstTouch;
    }

    isValidStartEvent(e: TouchEvent) {
        return this._isOneFingerTouch(e);
    }

    isValidMoveEvent(e: TouchEvent) {
        return this._isOneFingerTouch(e) && this._isSameTouchEvent(e);
    }

    isValidEndEvent(e: TouchEvent) {
        return this._isOneFingerTouch(e) && this._isSameTouchEvent(e);
    }
}

export class MouseOrTouchMoveStateManager implements DragMoveStateManager<MouseEvent | TouchEvent> {
    constructor(
        private mouseMoveStateManager = new MouseMoveStateManager({checkCorrectEvent: () => true}),
        private oneFingerTouchMoveStateManager = new OneFingerTouchMoveStateManager()
    ) {}

    _executeRelevantHandler(e: MouseEvent | TouchEvent, onMouseEvent: (MouseEvent) => any, onTouchEvent: (TouchEvent) => any) {
        if (e instanceof MouseEvent) return onMouseEvent(e);
        if (typeof TouchEvent !== 'undefined' && e instanceof TouchEvent) return onTouchEvent(e);
    }

    startMove(e: MouseEvent | TouchEvent) {
        this._executeRelevantHandler(e,
            e => this.mouseMoveStateManager.startMove(e),
            e => this.oneFingerTouchMoveStateManager.startMove(e));
    }

    endMove(e?: MouseEvent | TouchEvent) {
        this._executeRelevantHandler(e,
            e => this.mouseMoveStateManager.endMove(e),
            e => this.oneFingerTouchMoveStateManager.endMove(e));
    }

    isValidStartEvent(e: MouseEvent | TouchEvent) {
        return this._executeRelevantHandler(e,
            e => this.mouseMoveStateManager.isValidStartEvent(e),
            e => this.oneFingerTouchMoveStateManager.isValidStartEvent(e));
    }

    isValidMoveEvent(e: MouseEvent | TouchEvent) {
        return this._executeRelevantHandler(e,
            e => this.mouseMoveStateManager.isValidMoveEvent(e),
            e => this.oneFingerTouchMoveStateManager.isValidMoveEvent(e));
    }

    isValidEndEvent(e?: MouseEvent | TouchEvent) {
        return this._executeRelevantHandler(e,
            e => this.mouseMoveStateManager.isValidEndEvent(e),
            e => this.oneFingerTouchMoveStateManager.isValidEndEvent(e));
    }
}
