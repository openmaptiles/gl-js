import assert from 'assert';
import Point from '../../symbol/point';

export function indexTouches(touches: Array<Touch>, points: Array<Point>) {
    assert(touches.length === points.length);
    const obj = {};
    for (let i = 0; i < touches.length; i++) {
        obj[touches[i].identifier] = points[i];
    }
    return obj;
}
