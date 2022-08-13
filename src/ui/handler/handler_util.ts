import {naiveAssert} from '../../util/test/util';
import Point from '@mapbox/point-geometry';

export function indexTouches(touches: Array<Touch>, points: Array<Point>) {
    naiveAssert(touches.length === points.length);
    const obj = {};
    for (let i = 0; i < touches.length; i++) {
        obj[touches[i].identifier] = points[i];
    }
    return obj;
}
