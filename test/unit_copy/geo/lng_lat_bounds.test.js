import {test} from '../../util/test';
import LngLat from '../../../rollup/build/tsc/geo/lng_lat';
import LngLatBounds from '../../../rollup/build/tsc/geo/lng_lat_bounds';

test('LngLatBounds', (t) => {
    t.test('#constructor', (t) => {
        const sw = new LngLat(0, 0);
        const ne = new LngLat(-10, 10);
        const bounds = new LngLatBounds(sw, ne);
        expect(bounds.getSouth()).toBe(0);
        expect(bounds.getWest()).toBe(0);
        expect(bounds.getNorth()).toBe(10);
        expect(bounds.getEast()).toBe(-10);
        t.end();
    });

    t.test('#constructor across dateline', (t) => {
        const sw = new LngLat(170, 0);
        const ne = new LngLat(-170, 10);
        const bounds = new LngLatBounds(sw, ne);
        expect(bounds.getSouth()).toBe(0);
        expect(bounds.getWest()).toBe(170);
        expect(bounds.getNorth()).toBe(10);
        expect(bounds.getEast()).toBe(-170);
        t.end();
    });

    t.test('#constructor across pole', (t) => {
        const sw = new LngLat(0, 85);
        const ne = new LngLat(-10, -85);
        const bounds = new LngLatBounds(sw, ne);
        expect(bounds.getSouth()).toBe(85);
        expect(bounds.getWest()).toBe(0);
        expect(bounds.getNorth()).toBe(-85);
        expect(bounds.getEast()).toBe(-10);
        t.end();
    });

    t.test('#constructor no args', (t) => {
        const bounds = new LngLatBounds();
        expect(() => {
            bounds.getCenter();
        }).toThrow();
        t.end();
    });

    t.test('#extend with coordinate', (t) => {
        const bounds = new LngLatBounds([0, 0], [10, 10]);
        bounds.extend([-10, -10]);

        expect(bounds.getSouth()).toBe(-10);
        expect(bounds.getWest()).toBe(-10);
        expect(bounds.getNorth()).toBe(10);
        expect(bounds.getEast()).toBe(10);

        bounds.extend(new LngLat(-15, -15));

        expect(bounds.getSouth()).toBe(-15);
        expect(bounds.getWest()).toBe(-15);
        expect(bounds.getNorth()).toBe(10);
        expect(bounds.getEast()).toBe(10);

        bounds.extend([-20, -20, 100]);

        expect(bounds.getSouth()).toBe(-20);
        expect(bounds.getWest()).toBe(-20);
        expect(bounds.getNorth()).toBe(10);
        expect(bounds.getEast()).toBe(10);

        t.end();
    });

    t.test('#extend with bounds', (t) => {
        const bounds1 = new LngLatBounds([0, 0], [10, 10]);
        const bounds2 = new LngLatBounds([-10, -10], [10, 10]);

        bounds1.extend(bounds2);

        expect(bounds1.getSouth()).toBe(-10);
        expect(bounds1.getWest()).toBe(-10);
        expect(bounds1.getNorth()).toBe(10);
        expect(bounds1.getEast()).toBe(10);

        const bounds3 = [[-15, -15], [15, 15]];
        bounds1.extend(bounds3);

        expect(bounds1.getSouth()).toBe(-15);
        expect(bounds1.getWest()).toBe(-15);
        expect(bounds1.getNorth()).toBe(15);
        expect(bounds1.getEast()).toBe(15);

        const bounds4 = new LngLatBounds([-20, -20, 20, 20]);
        bounds1.extend(bounds4);

        expect(bounds1.getSouth()).toBe(-20);
        expect(bounds1.getWest()).toBe(-20);
        expect(bounds1.getNorth()).toBe(20);
        expect(bounds1.getEast()).toBe(20);

        t.end();
    });

    t.test('#extend with null', (t) => {
        const bounds = new LngLatBounds([0, 0], [10, 10]);

        bounds.extend(null);

        expect(bounds.getSouth()).toBe(0);
        expect(bounds.getWest()).toBe(0);
        expect(bounds.getNorth()).toBe(10);
        expect(bounds.getEast()).toBe(10);

        t.end();
    });

    t.test('#extend undefined bounding box', (t) => {
        const bounds1 = new LngLatBounds(undefined, undefined);
        const bounds2 = new LngLatBounds([-10, -10], [10, 10]);

        bounds1.extend(bounds2);

        expect(bounds1.getSouth()).toBe(-10);
        expect(bounds1.getWest()).toBe(-10);
        expect(bounds1.getNorth()).toBe(10);
        expect(bounds1.getEast()).toBe(10);

        t.end();
    });

    t.test('#extend same LngLat instance', (t) => {
        const point = new LngLat(0, 0);
        const bounds = new LngLatBounds(point, point);

        bounds.extend(new LngLat(15, 15));

        expect(bounds.getSouth()).toBe(0);
        expect(bounds.getWest()).toBe(0);
        expect(bounds.getNorth()).toBe(15);
        expect(bounds.getEast()).toBe(15);

        t.end();
    });

    t.test('#extend with empty array', (t) => {
        const point = new LngLat(0, 0);
        const bounds = new LngLatBounds(point, point);

        expect(() => {
            bounds.extend([]);
        }).toThrowError(
            "`LngLatLike` argument must be specified as a LngLat instance, an object {lng: <lng>, lat: <lat>}, an object {lon: <lng>, lat: <lat>}, or an array of [<lng>, <lat>]"
        );

        t.end();
    });

    t.test('accessors', (t) => {
        const sw = new LngLat(0, 0);
        const ne = new LngLat(-10, -20);
        const bounds = new LngLatBounds(sw, ne);
        expect(bounds.getCenter()).toEqual(new LngLat(-5, -10));
        expect(bounds.getSouth()).toBe(0);
        expect(bounds.getWest()).toBe(0);
        expect(bounds.getNorth()).toBe(-20);
        expect(bounds.getEast()).toBe(-10);
        expect(bounds.getSouthWest()).toEqual(new LngLat(0, 0));
        expect(bounds.getSouthEast()).toEqual(new LngLat(-10, 0));
        expect(bounds.getNorthEast()).toEqual(new LngLat(-10, -20));
        expect(bounds.getNorthWest()).toEqual(new LngLat(0, -20));
        t.end();
    });

    t.test('#convert', (t) => {
        const sw = new LngLat(0, 0);
        const ne = new LngLat(-10, 10);
        const bounds = new LngLatBounds(sw, ne);
        expect(LngLatBounds.convert(undefined)).toBe(undefined);
        expect(LngLatBounds.convert(bounds)).toEqual(bounds);
        expect(LngLatBounds.convert([sw, ne])).toEqual(bounds);
        expect(
            LngLatBounds.convert([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()])
        ).toEqual(bounds);
        t.end();
    });

    t.test('#toArray', (t) => {
        const llb = new LngLatBounds([-73.9876, 40.7661], [-73.9397, 40.8002]);
        expect(llb.toArray()).toEqual([[-73.9876, 40.7661], [-73.9397, 40.8002]]);
        t.end();
    });

    t.test('#toString', (t) => {
        const llb = new LngLatBounds([-73.9876, 40.7661], [-73.9397, 40.8002]);
        expect(llb.toString()).toEqual('LngLatBounds(LngLat(-73.9876, 40.7661), LngLat(-73.9397, 40.8002))');
        t.end();
    });

    t.test('#isEmpty', (t) => {
        const nullBounds = new LngLatBounds();
        expect(nullBounds.isEmpty()).toBe(true);
        nullBounds.extend([-73.9876, 40.7661], [-73.9397, 40.8002]);
        expect(nullBounds.isEmpty()).toBe(false);
        t.end();
    });

    t.test('contains', (t) => {
        t.test('point', (t) => {
            t.test('point is in bounds', (t) => {
                const llb = new LngLatBounds([-1, -1], [1, 1]);
                const ll = {lng: 0, lat: 0};
                expect(llb.contains(ll)).toBeTruthy();
                t.end();
            });

            t.test('point is not in bounds', (t) => {
                const llb = new LngLatBounds([-1, -1], [1, 1]);
                const ll = {lng: 3, lat: 3};
                expect(llb.contains(ll)).toBeFalsy();
                t.end();
            });

            t.test('point is in bounds that spans dateline', (t) => {
                const llb = new LngLatBounds([190, -10], [170, 10]);
                const ll = {lng: 180, lat: 0};
                expect(llb.contains(ll)).toBeTruthy();
                t.end();
            });

            t.test('point is not in bounds that spans dateline', (t) => {
                const llb = new LngLatBounds([190, -10], [170, 10]);
                const ll = {lng: 0, lat: 0};
                expect(llb.contains(ll)).toBeFalsy();
                t.end();
            });
            t.end();
        });
        t.end();
    });
    t.end();
});
