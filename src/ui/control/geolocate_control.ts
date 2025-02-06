import {Event, Evented} from '../../util/evented';
import {DOM} from '../../util/dom';
import {extend, warnOnce} from '../../util/util';
import {checkGeolocationSupport} from '../../util/geolocation_support';
import {LngLat} from '../../geo/lng_lat';
import {Marker} from '../marker';

import type {Map} from '../map';
import type {FitBoundsOptions} from '../camera';
import type {IControl} from './control';
import {LngLatBounds} from '../../geo/lng_lat_bounds';

import * as turf from '@turf/circle';
import {type GeoJSONSource} from '../../source/geojson_source';

/**
 * The {@link GeolocateControl} options object
 */
type GeolocateControlOptions = {
    /**
     * A Geolocation API [PositionOptions](https://developer.mozilla.org/en-US/docs/Web/API/PositionOptions) object.
     * @defaultValue `{enableHighAccuracy: false, timeout: 6000}`
     */
    positionOptions?: PositionOptions;
    /**
     * A options object to use when the map is panned and zoomed to the user's location. The default is to use a `maxZoom` of 15 to limit how far the map will zoom in for very accurate locations.
     */
    fitBoundsOptions?: FitBoundsOptions;
    /**
     * If `true` the `GeolocateControl` becomes a toggle button and when active the map will receive updates to the user's location as it changes.
     * @defaultValue false
     */
    trackUserLocation?: boolean;
    /**
     * By default, if `showUserLocation` is `true`, a transparent circle will be drawn around the user location indicating the accuracy (95% confidence level) of the user's location. Set to `false` to disable. Always disabled when `showUserLocation` is `false`.
     * @defaultValue true
     */
    showAccuracyCircle?: boolean;
    /**
     * By default a dot will be shown on the map at the user's location. Set to `false` to disable.
     * @defaultValue true
     */
    showUserLocation?: boolean;
};

const defaultOptions: GeolocateControlOptions = {
    positionOptions: {
        enableHighAccuracy: false,
        maximumAge: 0,
        timeout: 6000 /* 6 sec */
    },
    fitBoundsOptions: {
        maxZoom: 15
    },
    trackUserLocation: false,
    showAccuracyCircle: true,
    showUserLocation: true
};

let numberOfWatches = 0;
let noTimeout = false;

/**
 * A `GeolocateControl` control provides a button that uses the browser's geolocation
 * API to locate the user on the map.
 *
 * Not all browsers support geolocation,
 * and some users may disable the feature. Geolocation support for modern
 * browsers including Chrome requires sites to be served over HTTPS. If
 * geolocation support is not available, the `GeolocateControl` will show
 * as disabled.
 *
 * The zoom level applied will depend on the accuracy of the geolocation provided by the device.
 *
 * The `GeolocateControl` has two modes. If `trackUserLocation` is `false` (default) the control acts as a button, which when pressed will set the map's camera to target the user location. If the user moves, the map won't update. This is most suited for the desktop. If `trackUserLocation` is `true` the control acts as a toggle button that when active the user's location is actively monitored for changes. In this mode the `GeolocateControl` has three interaction states:
 * * active - the map's camera automatically updates as the user's location changes, keeping the location dot in the center. Initial state and upon clicking the `GeolocateControl` button.
 * * passive - the user's location dot automatically updates, but the map's camera does not. Occurs upon the user initiating a map movement.
 * * disabled - occurs if Geolocation is not available, disabled or denied.
 *
 * These interaction states can't be controlled programmatically, rather they are set based on user interactions.
 *
 * ## State Diagram
 * ![GeolocateControl state diagram](https://github.com/maplibre/maplibre-gl-js/assets/3269297/78e720e5-d781-4da8-9803-a7a0e6aaaa9f)
 *
 * @group Markers and Controls
 *
 * @example
 * ```ts
 * map.addControl(new GeolocateControl({
 *     positionOptions: {
 *         enableHighAccuracy: true
 *     },
 *     trackUserLocation: true
 * }));
 * ```
 * @see [Locate the user](https://maplibre.org/maplibre-gl-js/docs/examples/locate-user/)
 *
 * ## Events
 *
 * **Event** `trackuserlocationend` of type {@link Event} will be fired when the `GeolocateControl` changes to the background state, which happens when a user changes the camera during an active position lock. This only applies when `trackUserLocation` is `true`. In the background state, the dot on the map will update with location updates but the camera will not.
 *
 * **Event** `trackuserlocationstart` of type {@link Event} will be fired when the `GeolocateControl` changes to the active lock state, which happens either upon first obtaining a successful Geolocation API position for the user (a `geolocate` event will follow), or the user clicks the geolocate button when in the background state which uses the last known position to recenter the map and enter active lock state (no `geolocate` event will follow unless the users's location changes).
 *
 * **Event** `userlocationlostfocus` of type {@link Event} will be fired when the `GeolocateControl` changes to the background state, which happens when a user changes the camera during an active position lock. This only applies when `trackUserLocation` is `true`. In the background state, the dot on the map will update with location updates but the camera will not.
 *
 * **Event** `userlocationfocus` of type {@link Event} will be fired when the `GeolocateControl` changes to the active lock state, which happens upon the user clicks the geolocate button when in the background state which uses the last known position to recenter the map and enter active lock state.
 *
 * **Event** `geolocate` of type {@link Event} will be fired on each Geolocation API position update which returned as success.
 * `data` - The returned [Position](https://developer.mozilla.org/en-US/docs/Web/API/Position) object from the callback in [Geolocation.getCurrentPosition()](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition) or [Geolocation.watchPosition()](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/watchPosition).
 *
 * **Event** `error` of type {@link Event} will be fired on each Geolocation API position update which returned as an error.
 * `data` - The returned [PositionError](https://developer.mozilla.org/en-US/docs/Web/API/PositionError) object from the callback in [Geolocation.getCurrentPosition()](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition) or [Geolocation.watchPosition()](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/watchPosition).
 *
 * **Event** `outofmaxbounds` of type {@link Event} will be fired on each Geolocation API position update which returned as success but user position is out of map `maxBounds`.
 * `data` - The returned [Position](https://developer.mozilla.org/en-US/docs/Web/API/Position) object from the callback in [Geolocation.getCurrentPosition()](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition) or [Geolocation.watchPosition()](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/watchPosition).
 *
 * @example
 * ```ts
 * // Initialize the geolocate control.
 * let geolocate = new GeolocateControl({
 *   positionOptions: {
 *       enableHighAccuracy: true
 *   },
 *   trackUserLocation: true
 * });
 * // Add the control to the map.
 * map.addControl(geolocate);
 * // Set an event listener that fires
 * // when a trackuserlocationend event occurs.
 * geolocate.on('trackuserlocationend', () => {
 *   console.log('A trackuserlocationend event has occurred.')
 * });
 * ```
 *
 * @example
 * ```ts
 * // Initialize the geolocate control.
 * let geolocate = new GeolocateControl({
 *   positionOptions: {
 *       enableHighAccuracy: true
 *   },
 *   trackUserLocation: true
 * });
 * // Add the control to the map.
 * map.addControl(geolocate);
 * // Set an event listener that fires
 * // when a trackuserlocationstart event occurs.
 * geolocate.on('trackuserlocationstart', () => {
 *   console.log('A trackuserlocationstart event has occurred.')
 * });
 * ```
 *
 * @example
 * ```ts
 * // Initialize the geolocate control.
 * let geolocate = new GeolocateControl({
 *   positionOptions: {
 *       enableHighAccuracy: true
 *   },
 *   trackUserLocation: true
 * });
 * // Add the control to the map.
 * map.addControl(geolocate);
 * // Set an event listener that fires
 * // when an userlocationlostfocus event occurs.
 * geolocate.on('userlocationlostfocus', function() {
 *   console.log('An userlocationlostfocus event has occurred.')
 * });
 * ```
 *
 * @example
 * ```ts
 * // Initialize the geolocate control.
 * let geolocate = new GeolocateControl({
 *   positionOptions: {
 *       enableHighAccuracy: true
 *   },
 *   trackUserLocation: true
 * });
 * // Add the control to the map.
 * map.addControl(geolocate);
 * // Set an event listener that fires
 * // when an userlocationfocus event occurs.
 * geolocate.on('userlocationfocus', function() {
 *   console.log('An userlocationfocus event has occurred.')
 * });
 * ```
 *
 * @example
 * ```ts
 * // Initialize the geolocate control.
 * let geolocate = new GeolocateControl({
 *   positionOptions: {
 *       enableHighAccuracy: true
 *   },
 *   trackUserLocation: true
 * });
 * // Add the control to the map.
 * map.addControl(geolocate);
 * // Set an event listener that fires
 * // when a geolocate event occurs.
 * geolocate.on('geolocate', () => {
 *   console.log('A geolocate event has occurred.')
 * });
 * ```
 *
 * @example
 * ```ts
 * // Initialize the geolocate control.
 * let geolocate = new GeolocateControl({
 *   positionOptions: {
 *       enableHighAccuracy: true
 *   },
 *   trackUserLocation: true
 * });
 * // Add the control to the map.
 * map.addControl(geolocate);
 * // Set an event listener that fires
 * // when an error event occurs.
 * geolocate.on('error', () => {
 *   console.log('An error event has occurred.')
 * });
 * ```
 *
 * @example
 * ```ts
 * // Initialize the geolocate control.
 * let geolocate = new GeolocateControl({
 *   positionOptions: {
 *       enableHighAccuracy: true
 *   },
 *   trackUserLocation: true
 * });
 * // Add the control to the map.
 * map.addControl(geolocate);
 * // Set an event listener that fires
 * // when an outofmaxbounds event occurs.
 * geolocate.on('outofmaxbounds', () => {
 *   console.log('An outofmaxbounds event has occurred.')
 * });
 * ```
 */
export class GeolocateControl extends Evented implements IControl {
    _map: Map;
    options: GeolocateControlOptions;
    _container: HTMLElement;
    _dotElement: HTMLElement;
    _geolocateButton: HTMLButtonElement;
    _geolocationWatchID: number;
    _timeoutId: ReturnType<typeof setTimeout>;
    /* Geolocate Control Watch States
     * This is the private state of the control.
     *
     * OFF
     *    off/inactive
     * WAITING_ACTIVE
     *    Geolocate Control was clicked but still waiting for Geolocation API response with user location
     * ACTIVE_LOCK
     *    Showing the user location as a dot AND tracking the camera to be fixed to their location. If their location changes the map moves to follow.
     * ACTIVE_ERROR
     *    There was en error from the Geolocation API while trying to show and track the user location.
     * BACKGROUND
     *    Showing the user location as a dot but the camera doesn't follow their location as it changes.
     * BACKGROUND_ERROR
     *    There was an error from the Geolocation API while trying to show (but not track) the user location.
     */
    _watchState: 'OFF' | 'ACTIVE_LOCK' | 'WAITING_ACTIVE' | 'ACTIVE_ERROR' | 'BACKGROUND' | 'BACKGROUND_ERROR';
    _lastKnownPosition: any;
    _userLocationDotMarker: Marker;
    _accuracyCirclePolygon: any;
    _accuracy: number;
    _setup: boolean; // set to true once the control has been setup

    /**
     * @param options - the control's options
     */
    constructor(options: GeolocateControlOptions) {
        super();
        this.options = extend({}, defaultOptions, options);
    }

    /** {@inheritDoc IControl.onAdd} */
    onAdd(map: Map) {
        this._map = map;
        this._container = DOM.create('div', 'maplibregl-ctrl maplibregl-ctrl-group');
        this._setupUI();
        checkGeolocationSupport().then((supported) => this._finishSetupUI(supported));
        return this._container;
    }

    /** {@inheritDoc IControl.onRemove} */
    onRemove() {
        // clear the geolocation watch if exists
        if (this._geolocationWatchID !== undefined) {
            window.navigator.geolocation.clearWatch(this._geolocationWatchID);
            this._geolocationWatchID = undefined;
        }

        // clear the markers from the map
        if (this.options.showUserLocation && this._userLocationDotMarker) {
            this._userLocationDotMarker.remove();
        }

        if (this.options.showAccuracyCircle && this._accuracyCirclePolygon) {
            if (this._map.loaded() && this._map.isStyleLoaded()) {
                this._map.removeLayer('accuracy-circle');
                this._map.removeSource('accuracy-circle');
            }
        }

        DOM.remove(this._container);
        this._map = undefined;
        numberOfWatches = 0;
        noTimeout = false;
    }

    /**
     * Check if the Geolocation API Position is outside the map's `maxBounds`.
     *
     * @param position - the Geolocation API Position
     * @returns `true` if position is outside the map's `maxBounds`, otherwise returns `false`.
     */
    _isOutOfMapMaxBounds(position: GeolocationPosition) {
        const bounds = this._map.getMaxBounds();
        const coordinates = position.coords;

        return bounds && (
            coordinates.longitude < bounds.getWest() ||
            coordinates.longitude > bounds.getEast() ||
            coordinates.latitude < bounds.getSouth() ||
            coordinates.latitude > bounds.getNorth()
        );
    }

    _setErrorState() {
        switch (this._watchState) {
            case 'WAITING_ACTIVE':
                this._watchState = 'ACTIVE_ERROR';
                this._geolocateButton.classList.remove('maplibregl-ctrl-geolocate-active');
                this._geolocateButton.classList.add('maplibregl-ctrl-geolocate-active-error');
                break;
            case 'ACTIVE_LOCK':
                this._watchState = 'ACTIVE_ERROR';
                this._geolocateButton.classList.remove('maplibregl-ctrl-geolocate-active');
                this._geolocateButton.classList.add('maplibregl-ctrl-geolocate-active-error');
                this._geolocateButton.classList.add('maplibregl-ctrl-geolocate-waiting');
                // turn marker grey
                break;
            case 'BACKGROUND':
                this._watchState = 'BACKGROUND_ERROR';
                this._geolocateButton.classList.remove('maplibregl-ctrl-geolocate-background');
                this._geolocateButton.classList.add('maplibregl-ctrl-geolocate-background-error');
                this._geolocateButton.classList.add('maplibregl-ctrl-geolocate-waiting');
                // turn marker grey
                break;
            case 'ACTIVE_ERROR':
                break;
            default:
                throw new Error(`Unexpected watchState ${this._watchState}`);
        }
    }

    /**
     * When the Geolocation API returns a new location, update the `GeolocateControl`.
     *
     * @param position - the Geolocation API Position
     */
    _onSuccess = (position: GeolocationPosition) => {
        if (!this._map) {
            // control has since been removed
            return;
        }

        if (this._isOutOfMapMaxBounds(position)) {
            this._setErrorState();

            this.fire(new Event('outofmaxbounds', position));
            this._updateMarker();
            this._finish();

            return;
        }

        if (this.options.trackUserLocation) {
            // keep a record of the position so that if the state is BACKGROUND and the user
            // clicks the button, we can move to ACTIVE_LOCK immediately without waiting for
            // watchPosition to trigger _onSuccess
            this._lastKnownPosition = position;

            switch (this._watchState) {
                case 'WAITING_ACTIVE':
                case 'ACTIVE_LOCK':
                case 'ACTIVE_ERROR':
                    this._watchState = 'ACTIVE_LOCK';
                    this._geolocateButton.classList.remove('maplibregl-ctrl-geolocate-waiting');
                    this._geolocateButton.classList.remove('maplibregl-ctrl-geolocate-active-error');
                    this._geolocateButton.classList.add('maplibregl-ctrl-geolocate-active');
                    break;
                case 'BACKGROUND':
                case 'BACKGROUND_ERROR':
                    this._watchState = 'BACKGROUND';
                    this._geolocateButton.classList.remove('maplibregl-ctrl-geolocate-waiting');
                    this._geolocateButton.classList.remove('maplibregl-ctrl-geolocate-background-error');
                    this._geolocateButton.classList.add('maplibregl-ctrl-geolocate-background');
                    break;
                default:
                    throw new Error(`Unexpected watchState ${this._watchState}`);
            }
        }

        // if showUserLocation and the watch state isn't off then update the marker location
        if (this.options.showUserLocation && this._watchState !== 'OFF') {
            this._updateMarker(position);
        }

        // if in normal mode (not watch mode), or if in watch mode and the state is active watch
        // then update the camera
        if (!this.options.trackUserLocation || this._watchState === 'ACTIVE_LOCK') {
            this._updateCamera(position);
        }

        if (this.options.showUserLocation) {
            this._dotElement.classList.remove('maplibregl-user-location-dot-stale');
        }

        this.fire(new Event('geolocate', position));
        this._finish();
    };

    /**
     * Update the camera location to center on the current position
     *
     * @param position - the Geolocation API Position
     */
    _updateCamera = (position: GeolocationPosition) => {
        const center = new LngLat(position.coords.longitude, position.coords.latitude);
        const radius = position.coords.accuracy;
        const bearing = this._map.getBearing();
        const options = extend({bearing}, this.options.fitBoundsOptions);
        const newBounds = LngLatBounds.fromLngLat(center, radius);

        this._map.fitBounds(newBounds, options, {
            geolocateSource: true // tag this camera change so it won't cause the control to change to background state
        });
    };

    /**
     * Update the user location dot Marker to the current position
     *
     * @param position - the Geolocation API Position
     */
    _updateMarker = (position?: GeolocationPosition | null) => {
        if (position) {
            const center = new LngLat(position.coords.longitude, position.coords.latitude);
            this._userLocationDotMarker.setLngLat(center).addTo(this._map);
            this._accuracy = position.coords.accuracy;
            if (this.options.showUserLocation && this.options.showAccuracyCircle) {

                this._accuracyCirclePolygon = turf.circle([position.coords.longitude, position.coords.latitude],  position.coords.accuracy, {steps: 64,
                    units: 'meters'});

                if (this._map.getSource('accuracy-circle')) {
                    const geoJSONSource = this._map.getSource('accuracy-circle') as GeoJSONSource;
                    geoJSONSource.setData({
                        'type': 'FeatureCollection',
                        'features': [this._accuracyCirclePolygon]
                    });
                } else {
                    if (this._map.loaded() && this._map.isStyleLoaded()) {
                        this._map.addSource('accuracy-circle', {
                            type: 'geojson',
                            data: {
                                'type': 'FeatureCollection',
                                'features': [this._accuracyCirclePolygon]
                            }
                        });
                        this._map.addLayer({
                            id: 'accuracy-circle',
                            type: 'fill',
                            source: 'accuracy-circle',
                            paint: {
                                'fill-color': '#8CCFFF',
                                'fill-opacity': 0.5
                            }
                        });
                    }
                }
            }
        } else {
            this._userLocationDotMarker.remove();
            if (this._map.loaded() && this._map.isStyleLoaded()) {
                this._map.removeLayer('accuracy-circle');
                this._map.removeSource('accuracy-circle');
            }
        }
    };

    _onError = (error: GeolocationPositionError) => {
        if (!this._map) {
            // control has since been removed
            return;
        }

        if (this.options.trackUserLocation) {
            if (error.code === 1) {
                // PERMISSION_DENIED
                this._watchState = 'OFF';
                this._geolocateButton.classList.remove('maplibregl-ctrl-geolocate-waiting');
                this._geolocateButton.classList.remove('maplibregl-ctrl-geolocate-active');
                this._geolocateButton.classList.remove('maplibregl-ctrl-geolocate-active-error');
                this._geolocateButton.classList.remove('maplibregl-ctrl-geolocate-background');
                this._geolocateButton.classList.remove('maplibregl-ctrl-geolocate-background-error');
                this._geolocateButton.disabled = true;
                const title = this._map._getUIString('GeolocateControl.LocationNotAvailable');
                this._geolocateButton.title = title;
                this._geolocateButton.setAttribute('aria-label', title);

                if (this._geolocationWatchID !== undefined) {
                    this._clearWatch();
                }
            } else if (error.code === 3 && noTimeout) {
                // this represents a forced error state
                // this was triggered to force immediate geolocation when a watch is already present
                // see https://github.com/mapbox/mapbox-gl-js/issues/8214
                // and https://w3c.github.io/geolocation-api/#example-5-forcing-the-user-agent-to-return-a-fresh-cached-position
                return;
            } else {
                this._setErrorState();
            }
        }

        if (this._watchState !== 'OFF' && this.options.showUserLocation) {
            this._dotElement.classList.add('maplibregl-user-location-dot-stale');
        }

        this.fire(new Event('error', error));

        this._finish();
    };

    _finish = () => {
        if (this._timeoutId) { clearTimeout(this._timeoutId); }
        this._timeoutId = undefined;
    };

    _setupUI = () => {
        // the control could have been removed before reaching here
        if (!this._map) {
            return;
        }

        this._container.addEventListener('contextmenu', (e: MouseEvent) => e.preventDefault());
        this._geolocateButton = DOM.create('button', 'maplibregl-ctrl-geolocate', this._container);
        DOM.create('span', 'maplibregl-ctrl-icon', this._geolocateButton).setAttribute('aria-hidden', 'true');
        this._geolocateButton.type = 'button';
        this._geolocateButton.disabled = true;
    };

    _finishSetupUI = (supported: boolean) => {
        // this method is called asynchronously during onAdd
        if (!this._map) {
            // control has since been removed
            return;
        }

        if (supported === false) {
            warnOnce('Geolocation support is not available so the GeolocateControl will be disabled.');
            const title = this._map._getUIString('GeolocateControl.LocationNotAvailable');
            this._geolocateButton.disabled = true;
            this._geolocateButton.title = title;
            this._geolocateButton.setAttribute('aria-label', title);
        } else {
            const title = this._map._getUIString('GeolocateControl.FindMyLocation');
            this._geolocateButton.disabled = false;
            this._geolocateButton.title = title;
            this._geolocateButton.setAttribute('aria-label', title);
        }

        if (this.options.trackUserLocation) {
            this._geolocateButton.setAttribute('aria-pressed', 'false');
            this._watchState = 'OFF';
        }

        // when showUserLocation is enabled, keep the Geolocate button disabled until the device location marker is setup on the map
        if (this.options.showUserLocation) {
            this._dotElement = DOM.create('div', 'maplibregl-user-location-dot');

            this._userLocationDotMarker = new Marker({element: this._dotElement});

            if (this.options.trackUserLocation) this._watchState = 'OFF';
        }

        this._geolocateButton.addEventListener('click', () => this.trigger());

        this._setup = true;

        // when the camera is changed (and it's not as a result of the Geolocation Control) change
        // the watch mode to background watch, so that the marker is updated but not the camera.
        if (this.options.trackUserLocation) {
            this._map.on('movestart', (event: any) => {
                const fromResize = event.originalEvent && event.originalEvent.type === 'resize';
                if (!event.geolocateSource && this._watchState === 'ACTIVE_LOCK' && !fromResize) {
                    this._watchState = 'BACKGROUND';
                    this._geolocateButton.classList.add('maplibregl-ctrl-geolocate-background');
                    this._geolocateButton.classList.remove('maplibregl-ctrl-geolocate-active');

                    this.fire(new Event('trackuserlocationend'));
                    this.fire(new Event('userlocationlostfocus'));
                }
            });
        }
    };

    /**
     * Programmatically request and move the map to the user's location.
     *
     * @returns `false` if called before control was added to a map, otherwise returns `true`.
     * @example
     * ```ts
     * // Initialize the geolocate control.
     * let geolocate = new GeolocateControl({
     *  positionOptions: {
     *    enableHighAccuracy: true
     *  },
     *  trackUserLocation: true
     * });
     * // Add the control to the map.
     * map.addControl(geolocate);
     * map.on('load', () => {
     *   geolocate.trigger();
     * });
     * ```
     */
    trigger(): boolean {
        if (!this._setup) {
            warnOnce('Geolocate control triggered before added to a map');
            return false;
        }
        if (this.options.trackUserLocation) {
            // update watchState and do any outgoing state cleanup
            switch (this._watchState) {
                case 'OFF':
                // turn on the Geolocate Control
                    this._watchState = 'WAITING_ACTIVE';

                    this.fire(new Event('trackuserlocationstart'));
                    break;
                case 'WAITING_ACTIVE':
                case 'ACTIVE_LOCK':
                case 'ACTIVE_ERROR':
                case 'BACKGROUND_ERROR':
                // turn off the Geolocate Control
                    numberOfWatches--;
                    noTimeout = false;
                    this._watchState = 'OFF';
                    this._geolocateButton.classList.remove('maplibregl-ctrl-geolocate-waiting');
                    this._geolocateButton.classList.remove('maplibregl-ctrl-geolocate-active');
                    this._geolocateButton.classList.remove('maplibregl-ctrl-geolocate-active-error');
                    this._geolocateButton.classList.remove('maplibregl-ctrl-geolocate-background');
                    this._geolocateButton.classList.remove('maplibregl-ctrl-geolocate-background-error');

                    this.fire(new Event('trackuserlocationend'));
                    break;
                case 'BACKGROUND':
                    this._watchState = 'ACTIVE_LOCK';
                    this._geolocateButton.classList.remove('maplibregl-ctrl-geolocate-background');
                    // set camera to last known location
                    if (this._lastKnownPosition) this._updateCamera(this._lastKnownPosition);

                    this.fire(new Event('trackuserlocationstart'));
                    this.fire(new Event('userlocationfocus'));
                    break;
                default:
                    throw new Error(`Unexpected watchState ${this._watchState}`);
            }

            // incoming state setup
            switch (this._watchState) {
                case 'WAITING_ACTIVE':
                    this._geolocateButton.classList.add('maplibregl-ctrl-geolocate-waiting');
                    this._geolocateButton.classList.add('maplibregl-ctrl-geolocate-active');
                    break;
                case 'ACTIVE_LOCK':
                    this._geolocateButton.classList.add('maplibregl-ctrl-geolocate-active');
                    break;
                case 'OFF':
                    break;
                default:
                    throw new Error(`Unexpected watchState ${this._watchState}`);
            }

            // manage geolocation.watchPosition / geolocation.clearWatch
            if (this._watchState === 'OFF' && this._geolocationWatchID !== undefined) {
                // clear watchPosition as we've changed to an OFF state
                this._clearWatch();
            } else if (this._geolocationWatchID === undefined) {
                // enable watchPosition since watchState is not OFF and there is no watchPosition already running

                this._geolocateButton.classList.add('maplibregl-ctrl-geolocate-waiting');
                this._geolocateButton.setAttribute('aria-pressed', 'true');

                numberOfWatches++;
                let positionOptions;
                if (numberOfWatches > 1) {
                    positionOptions = {maximumAge: 600000, timeout: 0};
                    noTimeout = true;
                } else {
                    positionOptions = this.options.positionOptions;
                    noTimeout = false;
                }

                this._geolocationWatchID = window.navigator.geolocation.watchPosition(
                    this._onSuccess, this._onError, positionOptions);
            }
        } else {
            window.navigator.geolocation.getCurrentPosition(
                this._onSuccess, this._onError, this.options.positionOptions);

            // This timeout ensures that we still call finish() even if
            // the user declines to share their location in Firefox
            this._timeoutId = setTimeout(this._finish, 10000 /* 10sec */);
        }

        return true;
    }

    _clearWatch() {
        window.navigator.geolocation.clearWatch(this._geolocationWatchID);

        this._geolocationWatchID = undefined;
        this._geolocateButton.classList.remove('maplibregl-ctrl-geolocate-waiting');
        this._geolocateButton.setAttribute('aria-pressed', 'false');

        if (this.options.showUserLocation) {
            this._updateMarker(null);
        }
    }
}

