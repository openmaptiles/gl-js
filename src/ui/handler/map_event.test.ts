import {describe, beforeEach, test, expect, vi} from 'vitest';
import {Map, type MapOptions} from '../map';
import {DOM} from '../../util/dom';
import simulate from '../../../test/unit/lib/simulate_interaction';
import {beforeMapTest} from '../../util/test/util';

function createMap() {
    return new Map({interactive: true, container: DOM.create('div', '', window.document.body)} as any as MapOptions);
}

beforeEach(() => {
    beforeMapTest();
});

describe('map events', () => {
    test('MapEvent handler fires touch events with correct values', () => {
        const map = createMap();
        const target = map.getCanvas();

        const touchstart = vi.fn();
        const touchmove = vi.fn();
        const touchend = vi.fn();

        map.on('touchstart', touchstart);
        map.on('touchmove', touchmove);
        map.on('touchend', touchend);

        const touchesStart = [{target, identifier: 1, clientX: 0, clientY: 50}];
        const touchesMove = [{target, identifier: 1, clientX: 0, clientY: 60}];
        const touchesEnd = [{target, identifier: 1, clientX: 0, clientY: 60}];

        simulate.touchstart(map.getCanvas(), {touches: touchesStart, targetTouches: touchesStart});
        expect(touchstart).toHaveBeenCalledTimes(1);
        expect(touchstart.mock.calls[0][0].point).toEqual({x: 0, y: 50});
        expect(touchmove).toHaveBeenCalledTimes(0);
        expect(touchend).toHaveBeenCalledTimes(0);

        simulate.touchmove(map.getCanvas(), {touches: touchesMove, targetTouches: touchesMove});
        expect(touchstart).toHaveBeenCalledTimes(1);
        expect(touchmove).toHaveBeenCalledTimes(1);
        expect(touchmove.mock.calls[0][0].point).toEqual({x: 0, y: 60});
        expect(touchend).toHaveBeenCalledTimes(0);

        simulate.touchend(map.getCanvas(), {touches: [], targetTouches: [], changedTouches: touchesEnd});
        expect(touchstart).toHaveBeenCalledTimes(1);
        expect(touchmove).toHaveBeenCalledTimes(1);
        expect(touchend).toHaveBeenCalledTimes(1);
        expect(touchend.mock.calls[0][0].point).toEqual({x: 0, y: 60});

        map.remove();
    });

    test('MapEvent handler fires touchmove even while drag handler is active', () => {
        const map = createMap();
        const target = map.getCanvas();
        map.dragPan.enable();

        const touchstart = vi.fn();
        const touchmove = vi.fn();
        const touchend = vi.fn();
        const drag = vi.fn();

        map.on('touchstart', touchstart);
        map.on('touchmove', touchmove);
        map.on('touchend', touchend);
        map.on('drag', drag);

        const touchesStart = [{target, identifier: 1, clientX: 0, clientY: 50}];
        const touchesMove = [{target, identifier: 1, clientX: 0, clientY: 60}];
        const touchesEnd = [{target, identifier: 1, clientX: 0, clientY: 60}];

        simulate.touchstart(map.getCanvas(), {touches: touchesStart, targetTouches: touchesStart});
        expect(touchstart).toHaveBeenCalledTimes(1);
        expect(touchstart.mock.calls[0][0].point).toEqual({x: 0, y: 50});
        expect(touchmove).toHaveBeenCalledTimes(0);
        expect(touchend).toHaveBeenCalledTimes(0);

        simulate.touchmove(map.getCanvas(), {touches: touchesMove, targetTouches: touchesMove});
        expect(touchstart).toHaveBeenCalledTimes(1);
        expect(touchmove).toHaveBeenCalledTimes(1);
        expect(touchmove.mock.calls[0][0].point).toEqual({x: 0, y: 60});
        expect(touchend).toHaveBeenCalledTimes(0);

        simulate.touchend(map.getCanvas(), {touches: [], targetTouches: [], changedTouches: touchesEnd});
        expect(touchstart).toHaveBeenCalledTimes(1);
        expect(touchmove).toHaveBeenCalledTimes(1);
        expect(touchend).toHaveBeenCalledTimes(1);
        expect(touchend.mock.calls[0][0].point).toEqual({x: 0, y: 60});

        map._renderTaskQueue.run();
        expect(drag).toHaveBeenCalledTimes(1);

        map.remove();
    });

    test('MapEvent handler fires contextmenu on MacOS/Linux, but only at mouseup', () => {
        const map = createMap();
        const target = map.getCanvas();
        map.dragPan.enable();

        const contextmenu = vi.fn();

        map.on('contextmenu', contextmenu);

        simulate.mousedown(map.getCanvas(), {target, button: 2, clientX: 10, clientY: 10});
        simulate.contextmenu(map.getCanvas(), {target}); // triggered immediately after mousedown
        expect(contextmenu).toHaveBeenCalledTimes(0);
        simulate.mouseup(map.getCanvas(), {target, button: 2, clientX: 10, clientY: 10});
        expect(contextmenu).toHaveBeenCalledTimes(1);
    });

    test('MapEvent handler does not fire contextmenu on MacOS/Linux, when moved', () => {
        const map = createMap();
        const target = map.getCanvas();
        map.dragPan.enable();

        const contextmenu = vi.fn();

        map.on('contextmenu', contextmenu);

        simulate.mousedown(map.getCanvas(), {target, button: 2, clientX: 10, clientY: 10});
        simulate.contextmenu(map.getCanvas(), {target}); // triggered immediately after mousedown
        simulate.mousemove(map.getCanvas(), {target, buttons: 2, clientX: 50, clientY: 10});
        simulate.mouseup(map.getCanvas(), {target, button: 2, clientX: 70, clientY: 10});
        expect(contextmenu).toHaveBeenCalledTimes(0);
    });

    test('MapEvent handler fires contextmenu on Windows', () => {
        const map = createMap();
        const target = map.getCanvas();
        map.dragPan.enable();

        const contextmenu = vi.fn();

        map.on('contextmenu', contextmenu);

        simulate.mousedown(map.getCanvas(), {target, button: 2, clientX: 10, clientY: 10});
        simulate.mouseup(map.getCanvas(), {target, button: 2, clientX: 10, clientY: 10});
        expect(contextmenu).toHaveBeenCalledTimes(0);
        simulate.contextmenu(map.getCanvas(), {target, button: 2, clientX: 10, clientY: 10}); // triggered only after mouseup
        expect(contextmenu).toHaveBeenCalledTimes(1);
    });

    test('MapEvent handler does not fire contextmenu on Windows, when moved', () => {
        const map = createMap();
        const target = map.getCanvas();
        map.dragPan.enable();

        const contextmenu = vi.fn();

        map.on('contextmenu', contextmenu);

        simulate.mousedown(map.getCanvas(), {target, button: 2, clientX: 10, clientY: 10});
        simulate.mousemove(map.getCanvas(), {target, buttons: 2, clientX: 50, clientY: 10});
        simulate.mouseup(map.getCanvas(), {target, button: 2, clientX: 50, clientY: 10});
        simulate.contextmenu(map.getCanvas(), {target, button: 2, clientX: 10, clientY: 10}); // triggered only after mouseup
        expect(contextmenu).toHaveBeenCalledTimes(0);
    });

    test('MapMouseEvent constructor does not throw error with Event instance instead of MouseEvent as originalEvent param', () => {
        const map = createMap();
        const target = map.getCanvasContainer();

        expect(()=> {
            target.dispatchEvent(new Event('mousedown'));
            target.dispatchEvent(new Event('mouseup'));
            target.dispatchEvent(new Event('click'));
            target.dispatchEvent(new Event('dblclick'));
            target.dispatchEvent(new Event('mousemove'));
            target.dispatchEvent(new Event('mouseover'));
            target.dispatchEvent(new Event('mouseenter'));
            target.dispatchEvent(new Event('mouseleave'));
            target.dispatchEvent(new Event('mouseout'));
            target.dispatchEvent(new Event('contextmenu'));
            target.dispatchEvent(new Event('wheel'));

            target.dispatchEvent(new Event('touchstart'));
            target.dispatchEvent(new Event('touchmove'));
            target.dispatchEvent(new Event('touchmoveWindow'));
            target.dispatchEvent(new Event('touchend'));
            target.dispatchEvent(new Event('touchcancel'));
        }).not.toThrow();
    });
});
