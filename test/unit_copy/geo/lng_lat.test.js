import {test} from '../../util/test';
import LngLat from '../../../rollup/build/tsc/geo/lng_lat';

test('LngLat', (t) => {
    t.test('#constructor', (t) => {
        expect(new LngLat(0, 0) instanceof LngLat).toBeTruthy();
        expect(() => {
            /*eslint no-new: 0*/
            new LngLat('foo', 0);
        }).toThrowError("Invalid LngLat object: (foo, 0)");
        expect(() => {
            /*eslint no-new: 0*/
            new LngLat(0, -91);
        }).toThrowError('Invalid LngLat latitude value: must be between -90 and 90');
        expect(() => {
            /*eslint no-new: 0*/
            new LngLat(0, 91);
        }).toThrowError('Invalid LngLat latitude value: must be between -90 and 90');
        t.end();
    });

    t.test('#convert', (t) => {
        expect(LngLat.convert([0, 10]) instanceof LngLat).toBeTruthy();
        expect(LngLat.convert([0, 10, 0]) instanceof LngLat).toBeTruthy();
        t.throw(() => {
            LngLat.convert([0, 10, 0, 5]);
        }, "LngLat must not accept an array size bigger than 3'", 'detects and throws on invalid input');
        expect(LngLat.convert({lng: 0, lat: 10}) instanceof LngLat).toBeTruthy();
        expect(LngLat.convert({lng: 0, lat: 0}) instanceof LngLat).toBeTruthy();
        expect(LngLat.convert({lng: 0, lat: 0, elev: 0}) instanceof LngLat).toBeTruthy();
        expect(LngLat.convert({lon: 0, lat: 10}) instanceof LngLat).toBeTruthy();
        expect(LngLat.convert({lon: 0, lat: 0}) instanceof LngLat).toBeTruthy();
        expect(LngLat.convert({lon: 0, lat: 0, elev: 0}) instanceof LngLat).toBeTruthy();
        expect(LngLat.convert(new LngLat(0, 0)) instanceof LngLat).toBeTruthy();
        expect(() => {
            LngLat.convert(0, 10);
        }).toThrowError(
            "`LngLatLike` argument must be specified as a LngLat instance, an object {lng: <lng>, lat: <lat>}, an object {lon: <lng>, lat: <lat>}, or an array of [<lng>, <lat>]"
        );
        t.end();
    });

    t.test('#wrap', (t) => {
        expect(new LngLat(0, 0).wrap()).toEqual({lng: 0, lat: 0});
        expect(new LngLat(10, 20).wrap()).toEqual({lng: 10, lat: 20});
        expect(new LngLat(360, 0).wrap()).toEqual({lng: 0, lat: 0});
        expect(new LngLat(190, 0).wrap()).toEqual({lng: -170, lat: 0});
        t.end();
    });

    t.test('#toArray', (t) => {
        expect(new LngLat(10, 20).toArray()).toEqual([10, 20]);
        t.end();
    });

    t.test('#toString', (t) => {
        expect(new LngLat(10, 20).toString()).toBe('LngLat(10, 20)');
        t.end();
    });

    t.test('#distanceTo', (t) => {
        const newYork = new LngLat(-74.0060, 40.7128);
        const losAngeles = new LngLat(-118.2437, 34.0522);
        const d = newYork.distanceTo(losAngeles); // 3935751.690893987, "true distance" is 3966km
        expect(d > 3935750).toBeTruthy();
        expect(d < 3935752).toBeTruthy();
        t.end();
    });

    t.test('#distanceTo to pole', (t) => {
        const newYork = new LngLat(-74.0060, 40.7128);
        const northPole = new LngLat(-135, 90);
        const d = newYork.distanceTo(northPole); // 5480494.158486183 , "true distance" is 5499km
        expect(d > 5480493).toBeTruthy();
        expect(d < 5480495).toBeTruthy();
        t.end();
    });

    t.test('#distanceTo to Null Island', (t) => {
        const newYork = new LngLat(-74.0060, 40.7128);
        const nullIsland = new LngLat(0, 0);
        const d = newYork.distanceTo(nullIsland); // 8667080.125666846 , "true distance" is 8661km
        expect(d > 8667079).toBeTruthy();
        expect(d < 8667081).toBeTruthy();
        t.end();
    });

    t.test('#toBounds', (t) => {
        expect(new LngLat(0, 0).toBounds(10).toArray()).toEqual(
            [[-0.00008983152770714982, -0.00008983152770714982], [0.00008983152770714982, 0.00008983152770714982]]
        );
        expect(new LngLat(-73.9749, 40.7736).toBounds(10).toArray()).toEqual(
            [[-73.97501862141328, 40.77351016847229], [-73.97478137858673, 40.77368983152771]]
        );
        expect(new LngLat(-73.9749, 40.7736).toBounds().toArray()).toEqual([[-73.9749, 40.7736], [-73.9749, 40.7736]]);
        t.end();
    });

    t.end();
});
