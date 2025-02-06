import {describe, beforeEach, afterEach, test, expect, vi, type MockInstance} from 'vitest';
import geolocation from 'mock-geolocation';
import {LngLatBounds} from '../../geo/lng_lat_bounds';
import {createMap, beforeMapTest, sleep} from '../../util/test/util';
import {GeolocateControl} from './geolocate_control';
vi.mock('../../util/geolocation_support', () => (
    {
        checkGeolocationSupport: vi.fn()
    }
));
import {checkGeolocationSupport} from '../../util/geolocation_support';
import type {LngLat} from '../../geo/lng_lat';

/**
 * Convert the coordinates of a LngLat object to a fixed number of digits
 * @param lngLat - the location
 * @param digits - digits the number of digits to set
 * @returns a string representation of the object with the required number of digits
 */
function lngLatAsFixed(lngLat: LngLat, digits: number): {lat: string; lng: string} {
    return {
        lng: lngLat.lng.toFixed(digits),
        lat: lngLat.lat.toFixed(digits)
    };
}

describe('GeolocateControl with no options', () => {
    geolocation.use();
    let map;

    beforeEach(() => {
        beforeMapTest();
        map = createMap(undefined, undefined);
        (checkGeolocationSupport as unknown as MockInstance).mockImplementationOnce(() => Promise.resolve(true));
    });

    afterEach(() => {
        map.remove();
    });

    test('is disabled when there is no support', async () => {
        (checkGeolocationSupport as unknown as MockInstance).mockReset().mockImplementationOnce(() => Promise.resolve(false));
        const geolocate = new GeolocateControl(undefined);
        const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        map.addControl(geolocate);
        await sleep(0);
        expect(geolocate._geolocateButton.disabled).toBeTruthy();
        spy.mockRestore();
    });

    test('is enabled when there is support', async () => {
        const geolocate = new GeolocateControl(undefined);
        map.addControl(geolocate);
        await sleep(0);
        expect(geolocate._geolocateButton.disabled).toBeFalsy();
    });

    test('has permissions', async () => {

        (window.navigator as any).permissions = {
            query: () => Promise.resolve({state: 'granted'})
        };

        const geolocate = new GeolocateControl(undefined);
        map.addControl(geolocate);

        await sleep(0);
        expect(geolocate._geolocateButton.disabled).toBeFalsy();
    });

    test('error event', async () => {
        const geolocate = new GeolocateControl(undefined);
        map.addControl(geolocate);
        await sleep(0);
        const click = new window.Event('click');
        const errorPromise = geolocate.once('error');
        geolocate._geolocateButton.dispatchEvent(click);

        geolocation.sendError({code: 2, message: 'error message'});
        const error = await errorPromise;

        expect(error.code).toBe(2);
        expect(error.message).toBe('error message');
    });

    test('does not throw if removed quickly', () => {
        (checkGeolocationSupport as unknown as MockInstance).mockReset()
            .mockImplementationOnce(() => {
                return sleep(10);
            });

        const geolocate = new GeolocateControl(undefined);
        map.addControl(geolocate);
        map.removeControl(geolocate);
    });

    test('outofmaxbounds event in active lock state', async () => {
        const geolocate = new GeolocateControl(undefined);
        map.addControl(geolocate);
        await sleep(0);
        map.setMaxBounds([[0, 0], [10, 10]]);
        geolocate._watchState = 'ACTIVE_LOCK';

        const click = new window.Event('click');

        const outofmaxboundsPromise = geolocate.once('outofmaxbounds');
        geolocate._geolocateButton.dispatchEvent(click);
        geolocation.send({latitude: 10, longitude: 20, accuracy: 3, timestamp: 4});
        const position = await outofmaxboundsPromise;

        expect(geolocate._watchState).toBe('ACTIVE_ERROR');
        expect(position.coords.latitude).toBe(10);
        expect(position.coords.longitude).toBe(20);
        expect(position.coords.accuracy).toBe(3);
        expect(position.timestamp).toBe(4);
    });

    test('outofmaxbounds event in background state', async () => {
        const geolocate = new GeolocateControl(undefined);
        map.addControl(geolocate);
        await sleep(0);
        map.setMaxBounds([[0, 0], [10, 10]]);
        geolocate._watchState = 'BACKGROUND';

        const click = new window.Event('click');

        const promise = geolocate.once('outofmaxbounds');
        geolocate._geolocateButton.dispatchEvent(click);
        geolocation.send({latitude: 10, longitude: 20, accuracy: 3, timestamp: 4});
        const position = await promise;
        expect(geolocate._watchState).toBe('BACKGROUND_ERROR');
        expect(position.coords.latitude).toBe(10);
        expect(position.coords.longitude).toBe(20);
        expect(position.coords.accuracy).toBe(3);
        expect(position.timestamp).toBe(4);
    });

    test('geolocate event', async () => {
        const geolocate = new GeolocateControl(undefined);
        map.addControl(geolocate);
        await sleep(0);
        const click = new window.Event('click');

        const promise = geolocate.once('geolocate');
        geolocate._geolocateButton.dispatchEvent(click);
        geolocation.send({latitude: 10, longitude: 20, accuracy: 30, timestamp: 40});

        const position = await promise;
        expect(position.coords.latitude).toBe(10);
        expect(position.coords.longitude).toBe(20);
        expect(position.coords.accuracy).toBe(30);
        expect(position.timestamp).toBe(40);
    });

    test('trigger', async () => {
        const geolocate = new GeolocateControl(undefined);
        map.addControl(geolocate);
        await sleep(0);
        expect(geolocate.trigger()).toBeTruthy();
    });

    test('trigger and then error when tracking user location should get to active error state', async () => {
        const geolocate = new GeolocateControl({trackUserLocation: true});
        map.addControl(geolocate);
        await sleep(0);

        geolocate.trigger();
        geolocation.sendError({code: 2, message: 'error message'});
        expect(geolocate._watchState).toBe('ACTIVE_ERROR');
        expect(geolocate._geolocateButton.classList.contains('maplibregl-ctrl-geolocate-active-error')).toBeTruthy();
    });

    test('trigger before added to map', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => { });

        const geolocate = new GeolocateControl(undefined);

        expect(geolocate.trigger()).toBeFalsy();
        expect(console.warn).toHaveBeenCalledWith('Geolocate control triggered before added to a map');
    });

    test('geolocate fitBoundsOptions', async () => {
        const geolocate = new GeolocateControl({
            fitBoundsOptions: {
                duration: 0,
                maxZoom: 10
            }
        });
        map.addControl(geolocate);
        await sleep(0);
        const click = new window.Event('click');

        const moveEndPromise = map.once('moveend');
        geolocate._geolocateButton.dispatchEvent(click);
        geolocation.send({latitude: 10, longitude: 20, accuracy: 1});
        await moveEndPromise;
        expect(map.getZoom()).toBe(10);
    });

    test('was removed before Geolocation support was checked', () => {
        expect(() => {
            const geolocate = new GeolocateControl(undefined);
            map.addControl(geolocate);
            geolocate.trigger();
            map.removeControl(geolocate);
        }).not.toThrow();
    });

    test('non-zero bearing', async () => {
        map.setBearing(45);
        const geolocate = new GeolocateControl({
            fitBoundsOptions: {
                duration: 0,
                maxZoom: 10
            }
        });
        map.addControl(geolocate);
        await sleep(0);
        const click = new window.Event('click');

        const moveEndPromise = map.once('moveend');
        geolocate._geolocateButton.dispatchEvent(click);
        geolocation.send({latitude: 10, longitude: 20, accuracy: 1});
        await moveEndPromise;
        expect(lngLatAsFixed(map.getCenter(), 4)).toEqual({lat: '10.0000', lng: '20.0000'});
        expect(map.getBearing()).toBe(45);
        expect(map.getZoom()).toBe(10);
    });

    test('no watching map camera on geolocation', async () => {
        const geolocate = new GeolocateControl({
            fitBoundsOptions: {
                maxZoom: 20,
                duration: 0
            }
        });
        map.addControl(geolocate);
        await sleep(0);
        const click = new window.Event('click');

        const moveEndPromise = map.once('moveend');
        geolocate._geolocateButton.dispatchEvent(click);
        geolocation.send({latitude: 10, longitude: 20, accuracy: 1000});
        await moveEndPromise;
        const mapCenter = map.getCenter();
        expect(lngLatAsFixed(mapCenter, 4)).toEqual({lat: '10.0000', lng: '20.0000'});

        const mapBounds = map.getBounds();

        // map bounds should contain or equal accuracy bounds, that is the ensure accuracy bounds doesn't fall outside the map bounds
        const accuracyBounds = LngLatBounds.fromLngLat(mapCenter, 1000);

        expect(accuracyBounds.getNorth().toFixed(4) <= mapBounds.getNorth().toFixed(4)).toBeTruthy();
        expect(accuracyBounds.getSouth().toFixed(4) >= mapBounds.getSouth().toFixed(4)).toBeTruthy();
        expect(accuracyBounds.getEast().toFixed(4) <= mapBounds.getEast().toFixed(4)).toBeTruthy();
        expect(accuracyBounds.getWest().toFixed(4) >= mapBounds.getWest().toFixed(4)).toBeTruthy();

        // map bounds should not be too much bigger on all edges of the accuracy bounds (this test will only work for an orthogonal bearing),
        // ensures map bounds does not contain buffered accuracy bounds, as if it does there is too much gap around the accuracy bounds
        const bufferedAccuracyBounds = LngLatBounds.fromLngLat(mapCenter, 1100);

        expect(
            (bufferedAccuracyBounds.getNorth().toFixed(4) < mapBounds.getNorth().toFixed(4)) &&
            (bufferedAccuracyBounds.getSouth().toFixed(4) > mapBounds.getSouth().toFixed(4)) &&
            (bufferedAccuracyBounds.getEast().toFixed(4) < mapBounds.getEast().toFixed(4)) &&
            (bufferedAccuracyBounds.getWest().toFixed(4) > mapBounds.getWest().toFixed(4))
        ).toBeFalsy();
    });

    test('watching map updates recenter on location with dot', async () => {
        const geolocate = new GeolocateControl({
            trackUserLocation: true,
            showUserLocation: true,
            fitBoundsOptions: {
                duration: 0
            }
        });
        map.addControl(geolocate);
        await sleep(0);
        const click = new window.Event('click');

        const firstMoveEnd = map.once('moveend');
        geolocate._geolocateButton.dispatchEvent(click);
        geolocation.send({latitude: 10, longitude: 20, accuracy: 30});

        await firstMoveEnd;

        expect(lngLatAsFixed(map.getCenter(), 4)).toEqual({lat: '10.0000', lng: '20.0000'});
        expect(geolocate._userLocationDotMarker._map).toBeTruthy();
        expect(
            geolocate._userLocationDotMarker._element.classList.contains('maplibregl-user-location-dot-stale')
        ).toBeFalsy();
        const secontMoveEnd = map.once('moveend');
        geolocation.change({latitude: 40, longitude: 50, accuracy: 60});
        await secontMoveEnd;
        expect(lngLatAsFixed(map.getCenter(), 4)).toEqual({lat: '40.0000', lng: '50.0000'});
        const errorPromise = geolocate.once('error');
        geolocation.changeError({code: 2, message: 'position unavailable'});
        await errorPromise;
        expect(geolocate._userLocationDotMarker._map).toBeTruthy();
        expect(geolocate._userLocationDotMarker._element.classList.contains('maplibregl-user-location-dot-stale')).toBeTruthy();
    });

    /**
     * @deprecated 'trackuserlocationend' event will not be thrown in this situation later,
     * 'userlocationlostfocus event' test added instead.
     */
    test('watching map background event', async () => {
        const geolocate = new GeolocateControl({
            trackUserLocation: true,
            fitBoundsOptions: {
                duration: 0
            }
        });
        map.addControl(geolocate);
        await sleep(0);
        const click = new window.Event('click');

        const moveEndPromise = map.once('moveend');
        // click the button to activate it into the enabled watch state
        geolocate._geolocateButton.dispatchEvent(click);
        // send through a location update which should reposition the map and trigger the 'moveend' event above
        geolocation.send({latitude: 10, longitude: 20, accuracy: 30});
        await moveEndPromise;
        const trackPromise = geolocate.once('trackuserlocationend');
        // manually pan the map away from the geolocation position which should trigger the 'trackuserlocationend' event above
        map.jumpTo({
            center: [10, 5]
        });
        await trackPromise;
        expect(map.getCenter()).toEqual({lng: 10, lat: 5});
    });

    test('userlocationlostfocus event', async () => {
        const geolocate = new GeolocateControl({
            trackUserLocation: true,
            fitBoundsOptions: {
                duration: 0
            }
        });
        map.addControl(geolocate);
        await sleep(0);
        const click = new window.Event('click');

        const moveEndPromise = map.once('moveend');
        // click the button to activate it into the enabled watch state
        geolocate._geolocateButton.dispatchEvent(click);
        // send through a location update which should reposition the map and trigger the 'moveend' event above
        geolocation.send({latitude: 10, longitude: 20, accuracy: 30});
        await moveEndPromise;
        const trackPromise = geolocate.once('userlocationlostfocus');
        // manually pan the map away from the geolocation position which should trigger the 'userlocationlostfocus' event above
        map.jumpTo({
            center: [10, 5]
        });
        await trackPromise;
        expect(map.getCenter()).toEqual({lng: 10, lat: 5});
    });

    test('watching geolocate turns off', async () => {
        const geolocate = new GeolocateControl({
            trackUserLocation: true,
            fitBoundsOptions: {
                duration: 0
            }
        });
        map.addControl(geolocate);
        await sleep(0);
        const click = new window.Event('click');

        const moveEndPromise = map.once('moveend');
        // click the button to activate it into the enabled watch state
        geolocate._geolocateButton.dispatchEvent(click);
        // send through a location update which should reposition the map and trigger the 'moveend' event above
        geolocation.send({latitude: 10, longitude: 20, accuracy: 30});
        await moveEndPromise;
        const turnOffPromise = geolocate.once('trackuserlocationend');
        // click the button to deactivate geolocate and trigger 'trackuserlocationend' event
        geolocate._geolocateButton.dispatchEvent(click);
        await turnOffPromise;
        expect(geolocate._watchState).toBe('OFF');
    });

    test('watching map background state', async () => {
        const geolocate = new GeolocateControl({
            trackUserLocation: true,
            fitBoundsOptions: {
                duration: 0
            }
        });
        map.addControl(geolocate);
        await sleep(0);
        const click = new window.Event('click');

        const moveEndPromise = map.once('moveend');
        // click the button to activate it into the enabled watch state
        geolocate._geolocateButton.dispatchEvent(click);
        // send through a location update which should reposition the map and trigger the 'moveend' event above
        geolocation.send({latitude: 10, longitude: 20, accuracy: 30});
        await moveEndPromise;
        const secondMoveEnd = map.once('moveend');
        // manually pan the map away from the geolocation position which should trigger the 'moveend' event above
        map.jumpTo({
            center: [10, 5]
        });
        await secondMoveEnd;
        const geolocatePromise = geolocate.once('geolocate');
        //  update the geolocation position, since we are in background state when 'geolocate' is triggered above, the camera shouldn't have changed
        geolocation.change({latitude: 0, longitude: 0, accuracy: 10});
        await geolocatePromise;
        expect(map.getCenter()).toEqual({lng: 10, lat: 5});
    });

    test('trackuserlocationstart event', async () => {
        const geolocate = new GeolocateControl({
            trackUserLocation: true,
            fitBoundsOptions: {
                duration: 0
            }
        });
        map.addControl(geolocate);
        await sleep(0);
        const click = new window.Event('click');

        const promise = geolocate.once('trackuserlocationstart');
        geolocate._geolocateButton.dispatchEvent(click);
        await promise;
        expect(map.getCenter()).toEqual({lng: 0, lat: 0});
    });

    test('userlocationfocus event', async () => {
        const geolocate = new GeolocateControl({
            trackUserLocation: true,
            fitBoundsOptions: {
                duration: 0
            }
        });
        map.addControl(geolocate);
        await sleep(0);
        const click = new window.Event('click');

        const moveEndPromise = map.once('moveend');
        // click the button to activate it into the enabled watch state
        geolocate._geolocateButton.dispatchEvent(click);
        // send through a location update which should reposition the map and trigger the 'moveend' event above
        geolocation.send({latitude: 10, longitude: 20, accuracy: 30});
        await moveEndPromise;
        const trackPromise = geolocate.once('userlocationlostfocus');
        // manually pan the map away from the geolocation position which should trigger the 'userlocationlostfocus' event above
        map.jumpTo({
            center: [10, 5]
        });
        await trackPromise;
        const lockToDotPromise = geolocate.once('userlocationfocus');
        // click the button to focus on user location and trigger 'userlocationfocus' event
        geolocate._geolocateButton.dispatchEvent(click);
        await lockToDotPromise;
        expect(geolocate._watchState).toBe('ACTIVE_LOCK');
    });

    test('does not switch to BACKGROUND and stays in ACTIVE_LOCK state on window resize', async () => {
        const geolocate = new GeolocateControl({
            trackUserLocation: true,
        });
        map.addControl(geolocate);
        await sleep(0);
        const click = new window.Event('click');

        const geolocatePromise = geolocate.once('geolocate');
        geolocate._geolocateButton.dispatchEvent(click);
        geolocation.send({latitude: 10, longitude: 20, accuracy: 30, timestamp: 40});
        await geolocatePromise;
        expect(geolocate._watchState).toBe('ACTIVE_LOCK');
        window.dispatchEvent(new window.Event('resize'));
        expect(geolocate._watchState).toBe('ACTIVE_LOCK');
    });

    test('switches to BACKGROUND state on map manipulation', async () => {
        const geolocate = new GeolocateControl({
            trackUserLocation: true,
        });
        map.addControl(geolocate);
        await sleep(0);
        const click = new window.Event('click');

        const geolocatePromise = geolocate.once('geolocate');
        geolocate._geolocateButton.dispatchEvent(click);
        geolocation.send({latitude: 10, longitude: 20, accuracy: 30, timestamp: 40});
        await geolocatePromise;
        expect(geolocate._watchState).toBe('ACTIVE_LOCK');
        map.jumpTo({
            center: [0, 0]
        });
        expect(geolocate._watchState).toBe('BACKGROUND');
    });

    /*
    test('accuracy circle not shown if showAccuracyCircle = false', async () => {
        const geolocate = new GeolocateControl({
            trackUserLocation: true,
            showUserLocation: true,
            showAccuracyCircle: false,
        });
        map.addControl(geolocate);
        await sleep(0);
        const click = new window.Event('click');

        const geolocatePromise = geolocate.once('geolocate');
        geolocate._geolocateButton.dispatchEvent(click);
        geolocation.send({latitude: 10, longitude: 20, accuracy: 700});
        await geolocatePromise;
        map.jumpTo({
            center: [10, 20]
        });
        const zoomendPromise = map.once('zoomend');
        map.zoomTo(10, {duration: 0});
        await zoomendPromise;
        expect(!geolocate._circleElement.style.width).toBeTruthy();
    });
    */

    /*
    test('accuracy circle radius matches reported accuracy', async () => {
        const geolocate = new GeolocateControl({
            trackUserLocation: true,
            showUserLocation: true,
        });
        map.addControl(geolocate);
        await sleep(0);
        const click = new window.Event('click');

        const geolocatePromise = geolocate.once('geolocate');
        geolocate._geolocateButton.dispatchEvent(click);
        geolocation.send({latitude: 10, longitude: 20, accuracy: 700});
        await geolocatePromise;
        expect(geolocate._accuracyCircleMarker._map).toBeTruthy();
        expect(geolocate._accuracy).toBe(700);
        map.jumpTo({
            center: [10, 20]
        });

        // test with bugger radius
        let zoomendPromise = map.once('zoomend');
        map.zoomTo(12, {duration: 0});
        await zoomendPromise;
        expect(geolocate._circleElement.style.width).toBe('79px');
        zoomendPromise = map.once('zoomend');
        map.zoomTo(10, {duration: 0});
        await zoomendPromise;
        expect(geolocate._circleElement.style.width).toBe('20px');
        zoomendPromise = map.once('zoomend');

        // test with smaller radius
        geolocation.send({latitude: 10, longitude: 20, accuracy: 20});
        map.zoomTo(20, {duration: 0});
        await zoomendPromise;
        expect(geolocate._circleElement.style.width).toBe('19982px');
        zoomendPromise = map.once('zoomend');
        map.zoomTo(18, {duration: 0});
        await zoomendPromise;
        expect(geolocate._circleElement.style.width).toBe('4996px');
    });
    */

    /*
    test('shown even if trackUserLocation = false', async () => {
        const geolocate = new GeolocateControl({
            trackUserLocation: false,
            showUserLocation: true,
            showAccuracyCircle: true,
        });
        map.addControl(geolocate);
        await sleep(0);
        const click = new window.Event('click');

        const geolocatePromise = geolocate.once('geolocate');
        geolocate._geolocateButton.dispatchEvent(click);
        geolocation.send({latitude: 10, longitude: 20, accuracy: 700});
        await geolocatePromise;
        map.jumpTo({
            center: [10, 20]
        });
        const zoomendPromise = map.once('zoomend');
        map.zoomTo(10, {duration: 0});
        await zoomendPromise;
        expect(geolocate._circleElement.style.width).toBeTruthy();
    });
    */

    /*
    test('shown even if trackUserLocation = false', async () => {
        const geolocate = new GeolocateControl({
            trackUserLocation: false,
            showUserLocation: true,
            showAccuracyCircle: true,
        });
        map.addControl(geolocate);
        await sleep(0);
        const click = new window.Event('click');

        const geolocatePromise = geolocate.once('geolocate');
        geolocate._geolocateButton.dispatchEvent(click);
        geolocation.send({latitude: 10, longitude: 20, accuracy: 700});
        await geolocatePromise;
        map.jumpTo({
            center: [10, 20]
        });
        const zoomendPromise = map.once('zoomend');
        map.zoomTo(10, {duration: 0});
        await zoomendPromise;
        expect(geolocate._circleElement.style.width).toBeTruthy();
    });
    */

    test('Geolocate control should appear only once', async () => {
        const geolocateControl = new GeolocateControl({});

        map.addControl(geolocateControl);
        // adding and removing to verify there is no race condition, and it is just added once
        map.removeControl(geolocateControl);
        map.addControl(geolocateControl);

        await map.once('idle');

        const geolocateUIelem = await geolocateControl._container.getElementsByClassName('maplibregl-ctrl-geolocate');
        expect(geolocateUIelem).toHaveLength(1);
    });
});
