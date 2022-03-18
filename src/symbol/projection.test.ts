import { project } from "./projection";

import Point from '@mapbox/point-geometry';
import {mat4, vec4} from 'gl-matrix';

describe('Projection', () => {
    test('matrix float precision', () => {
        let point = new Point(10.000000005 , 0);
        let matrix = mat4.create();
        expect(project(point,matrix).point.x).toBeCloseTo(point.x, 10);
    })
});