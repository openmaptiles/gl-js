import '../stub_loader';
import {test} from '../util/test';
import mapboxgl from '../../rollup/build/tsc';

test('mapboxgl', (t) => {
    t.test('workerCount', (t) => {
        t.ok(typeof mapboxgl.workerCount === 'number');
        t.end();
    });
    t.end();
});
