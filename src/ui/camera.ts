import {extend, wrap, defaultEasing, pick} from '../util/util';
import {interpolates} from '@maplibre/maplibre-gl-style-spec';
import {browser} from '../util/browser';
import {LngLat} from '../geo/lng_lat';
import {LngLatBounds} from '../geo/lng_lat_bounds';
import Point from '@mapbox/point-geometry';
import {Event, Evented} from '../util/evented';
import {Terrain} from '../render/terrain';
import {MercatorCoordinate} from '../geo/mercator_coordinate';

import type {ITransform} from '../geo/transform_interface';
import type {LngLatLike} from '../geo/lng_lat';
import type {LngLatBoundsLike} from '../geo/lng_lat_bounds';
import type {TaskID} from '../util/task_queue';
import type {PaddingOptions} from '../geo/edge_insets';
import type {HandlerManager} from './handler_manager';
import {scaleZoom} from '../geo/transform_helper';
import {ICameraHelper} from '../geo/projection/camera_helper';

/**
 * A [Point](https://github.com/mapbox/point-geometry) or an array of two numbers representing `x` and `y` screen coordinates in pixels.
 *
 * @group Geography and Geometry
 *
 * @example
 * ```ts
 * let p1 = new Point(-77, 38); // a PointLike which is a Point
 * let p2 = [-77, 38]; // a PointLike which is an array of two numbers
 * ```
 */
export type PointLike = Point | [number, number];

/**
 * A helper to allow require of at least one property
 */
export type RequireAtLeastOne<T> = { [K in keyof T]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<keyof T, K>>>; }[keyof T];

/**
 * Options common to {@link Map#jumpTo}, {@link Map#easeTo}, and {@link Map#flyTo}, controlling the desired location,
 * zoom, bearing, pitch, and roll of the camera. All properties are optional, and when a property is omitted, the current
 * camera value for that property will remain unchanged.
 *
 * @example
 * Set the map's initial perspective with CameraOptions
 * ```ts
 * let map = new Map({
 *   container: 'map',
 *   style: 'https://demotiles.maplibre.org/style.json',
 *   center: [-73.5804, 45.53483],
 *   pitch: 60,
 *   bearing: -60,
 *   zoom: 10
 * });
 * ```
 * @see [Set pitch and bearing](https://maplibre.org/maplibre-gl-js/docs/examples/set-perspective/)
 * @see [Jump to a series of locations](https://maplibre.org/maplibre-gl-js/docs/examples/jump-to/)
 * @see [Fly to a location](https://maplibre.org/maplibre-gl-js/docs/examples/flyto/)
 * @see [Display buildings in 3D](https://maplibre.org/maplibre-gl-js/docs/examples/3d-buildings/)
 */
export type CameraOptions = CenterZoomBearing & {
    /**
     * The desired pitch in degrees. The pitch is the angle towards the horizon
     * measured in degrees with a range between 0 and 60 degrees. For example, pitch: 0 provides the appearance
     * of looking straight down at the map, while pitch: 60 tilts the user's perspective towards the horizon.
     * Increasing the pitch value is often used to display 3D objects.
     */
    pitch?: number;
    /**
     * The desired roll in degrees. The roll is the angle about the camera boresight.
     */
    roll?: number;
    /**
     * The elevation of the center point in meters above sea level.
     */
    elevation?: number;
};

/**
 * Holds center, zoom and bearing properties
 */
export type CenterZoomBearing = {
    /**
     * The desired center.
     */
    center?: LngLatLike;
    /**
     * The desired mercator zoom level.
     */
    zoom?: number;
    /**
     * The desired bearing in degrees. The bearing is the compass direction that
     * is "up". For example, `bearing: 90` orients the map so that east is up.
     */
    bearing?: number;
}

/**
 * The options object related to the {@link Map#jumpTo} method
 */
export type JumpToOptions = CameraOptions & {
    /**
     * Dimensions in pixels applied on each side of the viewport for shifting the vanishing point.
     */
    padding?: PaddingOptions;
}

/**
 * A options object for the {@link Map#cameraForBounds} method
 */
export type CameraForBoundsOptions = CameraOptions & {
    /**
     * The amount of padding in pixels to add to the given bounds.
     */
    padding?: number | RequireAtLeastOne<PaddingOptions>;
    /**
     * The center of the given bounds relative to the map's center, measured in pixels.
     * @defaultValue [0, 0]
     */
    offset?: PointLike;
    /**
     * The maximum zoom level to allow when the camera would transition to the specified bounds.
     */
    maxZoom?: number;
}

/**
 * The {@link Map#flyTo} options object
 */
export type FlyToOptions = AnimationOptions & CameraOptions & {
    /**
     * The zooming "curve" that will occur along the
     * flight path. A high value maximizes zooming for an exaggerated animation, while a low
     * value minimizes zooming for an effect closer to {@link Map#easeTo}. 1.42 is the average
     * value selected by participants in the user study discussed in
     * [van Wijk (2003)](https://www.win.tue.nl/~vanwijk/zoompan.pdf). A value of
     * `Math.pow(6, 0.25)` would be equivalent to the root mean squared average velocity. A
     * value of 1 would produce a circular motion.
     * @defaultValue 1.42
     */
    curve?: number;
    /**
     * The zero-based zoom level at the peak of the flight path. If
     * `options.curve` is specified, this option is ignored.
     */
    minZoom?: number;
    /**
     * The average speed of the animation defined in relation to
     * `options.curve`. A speed of 1.2 means that the map appears to move along the flight path
     * by 1.2 times `options.curve` screenfuls every second. A _screenful_ is the map's visible span.
     * It does not correspond to a fixed physical distance, but varies by zoom level.
     * @defaultValue 1.2
     */
    speed?: number;
    /**
     * The average speed of the animation measured in screenfuls
     * per second, assuming a linear timing curve. If `options.speed` is specified, this option is ignored.
     */
    screenSpeed?: number;
    /**
     * The animation's maximum duration, measured in milliseconds.
     * If duration exceeds maximum duration, it resets to 0.
     */
    maxDuration?: number;
    /**
     * The amount of padding in pixels to add to the given bounds.
     */
    padding?: number | RequireAtLeastOne<PaddingOptions>;
}

export type EaseToOptions = AnimationOptions & CameraOptions & {
    delayEndEvents?: number;
    padding?: number | RequireAtLeastOne<PaddingOptions>;
    /**
     * If `zoom` is specified, `around` determines the point around which the zoom is centered.
     */
    around?: LngLatLike;
}

/**
 * Options for {@link Map#fitBounds} method
 */
export type FitBoundsOptions = FlyToOptions & {
    /**
     * If `true`, the map transitions using {@link Map#easeTo}. If `false`, the map transitions using {@link Map#flyTo}.
     * See those functions and {@link AnimationOptions} for information about options available.
     * @defaultValue false
     */
    linear?: boolean;
    /**
     * The center of the given bounds relative to the map's center, measured in pixels.
     * @defaultValue [0, 0]
     */
    offset?: PointLike;
    /**
     * The maximum zoom level to allow when the map view transitions to the specified bounds.
     */
    maxZoom?: number;
}

/**
 * Options common to map movement methods that involve animation, such as {@link Map#panBy} and
 * {@link Map#easeTo}, controlling the duration and easing function of the animation. All properties
 * are optional.
 *
 */
export type AnimationOptions = {
    /**
     * The animation's duration, measured in milliseconds.
     */
    duration?: number;
    /**
     * A function taking a time in the range 0..1 and returning a number where 0 is
     * the initial state and 1 is the final state.
     */
    easing?: (_: number) => number;
    /**
     * of the target center relative to real map container center at the end of animation.
     */
    offset?: PointLike;
    /**
     * If `false`, no animation will occur.
     */
    animate?: boolean;
    /**
     * If `true`, then the animation is considered essential and will not be affected by
     * [`prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/\@media/prefers-reduced-motion).
     */
    essential?: boolean;
    /**
     * Default false. Needed in 3D maps to let the camera stay in a constant
     * height based on sea-level. After the animation finished the zoom-level will be recalculated in respect of
     * the distance from the camera to the center-coordinate-altitude.
     */
    freezeElevation?: boolean;
};

/**
 * A callback hook that allows manipulating the camera and being notified about camera updates before they happen
 */
export type CameraUpdateTransformFunction =  (next: {
    center: LngLat;
    zoom: number;
    roll: number;
    pitch: number;
    bearing: number;
    elevation: number;
}) => {
    center?: LngLat;
    zoom?: number;
    roll?: number;
    pitch?: number;
    bearing?: number;
    elevation?: number;
};

export abstract class Camera extends Evented {
    transform: ITransform;
    cameraHelper: ICameraHelper;
    terrain: Terrain;
    handlers: HandlerManager;

    _moving: boolean;
    _zooming: boolean;
    _rotating: boolean;
    _pitching: boolean;
    _rolling: boolean;
    _padding: boolean;

    _bearingSnap: number;
    _easeStart: number;
    _easeOptions: {
        duration?: number;
        easing?: (_: number) => number;
    };
    _easeId: string | void;

    _onEaseFrame: (_: number) => void;
    _onEaseEnd: (easeId?: string) => void;
    _easeFrameId: TaskID;

    /**
     * @internal
     * holds the geographical coordinate of the target
     */
    _elevationCenter: LngLat;
    /**
     * @internal
     * holds the targ altitude value, = center elevation of the target.
     * This value may changes during flight, because new terrain-tiles loads during flight.
     */
    _elevationTarget: number;
    /**
     * @internal
     * holds the start altitude value, = center elevation before animation begins
     * this value will recalculated during flight in respect of changing _elevationTarget values,
     * so the linear interpolation between start and target keeps smooth and without jumps.
     */
    _elevationStart: number;
    /**
     * @internal
     * Saves the current state of the elevation freeze - this is used during map movement to prevent "rocky" camera movement.
     */
    _elevationFreeze: boolean;
    /**
     * @internal
     * Used to track accumulated changes during continuous interaction
     */
    _requestedCameraState?: ITransform;
    /**
     * A callback used to defer camera updates or apply arbitrary constraints.
     * If specified, this Camera instance can be used as a stateless component in React etc.
     */
    transformCameraUpdate: CameraUpdateTransformFunction | null;

    /**
     * @internal
     * If true, the elevation of the center point will automatically be set to the terrain elevation
     * (or zero if terrain is not enabled). If false, the elevation of the center point will default
     * to sea level and will not automatically update. Defaults to true. Needs to be set to false to
     * keep the camera above ground when pitch \> 90 degrees.
     */
    _centerClampedToGround: boolean;

    /**
     * @internal
     * Controls whether the camera should avoid going below terrain surface.
     * When false, the camera can go under the terrain.
     */
    _terrainCollision?: boolean;

    abstract _requestRenderFrame(a: () => void): TaskID;
    abstract _cancelRenderFrame(_: TaskID): void;

    constructor(transform: ITransform, cameraHelper: ICameraHelper, options: {
        bearingSnap: number;
    }) {
        super();
        this._moving = false;
        this._zooming = false;
        this.transform = transform;
        this._bearingSnap = options.bearingSnap;
        this.cameraHelper = cameraHelper;
        this._terrainCollision = true;

        this.on('moveend', () => {
            delete this._requestedCameraState;
        });
    }

    /**
     * @internal
     * Creates a new specialized transform instance from a projection instance and migrates
     * to this new transform, carrying over all the properties of the old transform (center, pitch, etc.).
     * When the style's projection is changed (or first set), this function should be called.
     */
    migrateProjection(newTransform: ITransform, newCameraHelper: ICameraHelper) {
        newTransform.apply(this.transform);
        this.transform = newTransform;
        this.cameraHelper = newCameraHelper;
    }

    /**
     * Returns the map's geographical centerpoint.
     *
     * @returns The map's geographical centerpoint.
     * @example
     * Return a LngLat object such as `{lng: 0, lat: 0}`
     * ```ts
     * let center = map.getCenter();
     * // access longitude and latitude values directly
     * let {lng, lat} = map.getCenter();
     * ```
     */
    getCenter(): LngLat { return new LngLat(this.transform.center.lng, this.transform.center.lat); }

    /**
     * Sets the map's geographical centerpoint. Equivalent to `jumpTo({center: center})`.
     *
     * Triggers the following events: `movestart` and `moveend`.
     *
     * @param center - The centerpoint to set.
     * @param eventData - Additional properties to be added to event objects of events triggered by this method.
     * @example
     * ```ts
     * map.setCenter([-74, 38]);
     * ```
     */
    setCenter(center: LngLatLike, eventData?: any) {
        return this.jumpTo({center}, eventData);
    }

    /**
     * Returns the elevation of the map's center point.
     *
     * @returns The elevation of the map's center point, in meters above sea level.
     */
    getCenterElevation(): number { return this.transform.elevation; }

    /**
     * Sets the elevation of the map's center point, in meters above sea level. Equivalent to `jumpTo({elevation: elevation})`.
     *
     * Triggers the following events: `movestart` and `moveend`.
     *
     * @param elevation - The elevation to set, in meters above sea level.
     * @param eventData - Additional properties to be added to event objects of events triggered by this method.
     */
    setCenterElevation(elevation: number, eventData?: any): this {
        this.jumpTo({elevation}, eventData);
        return this;
    }

    /**
     * Returns the value of `centerClampedToGround`.
     *
     * If true, the elevation of the center point will automatically be set to the terrain elevation
     * (or zero if terrain is not enabled). If false, the elevation of the center point will default
     * to sea level and will not automatically update. Defaults to true. Needs to be set to false to
     * keep the camera above ground when pitch \> 90 degrees.
     */
    getCenterClampedToGround(): boolean { return this._centerClampedToGround; }

    /**
     * Sets the value of `centerClampedToGround`.
     *
     * If true, the elevation of the center point will automatically be set to the terrain elevation
     * (or zero if terrain is not enabled). If false, the elevation of the center point will default
     * to sea level and will not automatically update. Defaults to true. Needs to be set to false to
     * keep the camera above ground when pitch \> 90 degrees.
     */
    setCenterClampedToGround(centerClampedToGround: boolean): void {
        this._centerClampedToGround = centerClampedToGround;
    }

    /**
     * Gets whether terrain collision detection is enabled.
     *
     * When true (default), camera will avoid going below terrain surface.
     * When false, camera can go under the terrain.
     */
    getTerrainCollision(): boolean {
        return this._terrainCollision;
    }

    /**
     * Sets whether terrain collision detection is enabled.
     *
     * When true (default), camera will avoid going below terrain surface.
     * When false, camera can go under the terrain.
     */
    setTerrainCollision(terrainCollision: boolean): void {
        this._terrainCollision = terrainCollision;
    }

    /**
     * Pans the map by the specified offset.
     *
     * Triggers the following events: `movestart` and `moveend`.
     *
     * @param offset - `x` and `y` coordinates by which to pan the map.
     * @param options - Options object
     * @param eventData - Additional properties to be added to event objects of events triggered by this method.
     * @see [Navigate the map with game-like controls](https://maplibre.org/maplibre-gl-js/docs/examples/game-controls/)
     */
    panBy(offset: PointLike, options?: AnimationOptions, eventData?: any): this {
        offset = Point.convert(offset).mult(-1);
        return this.panTo(this.transform.center, extend({offset}, options), eventData);
    }

    /**
     * Pans the map to the specified location with an animated transition.
     *
     * Triggers the following events: `movestart` and `moveend`.
     *
     * @param lnglat - The location to pan the map to.
     * @param options - Options describing the destination and animation of the transition.
     * @param eventData - Additional properties to be added to event objects of events triggered by this method.
     * @example
     * ```ts
     * map.panTo([-74, 38]);
     * // Specify that the panTo animation should last 5000 milliseconds.
     * map.panTo([-74, 38], {duration: 5000});
     * ```
     * @see [Update a feature in realtime](https://maplibre.org/maplibre-gl-js/docs/examples/live-update-feature/)
     */
    panTo(lnglat: LngLatLike, options?: AnimationOptions, eventData?: any): this {
        return this.easeTo(extend({
            center: lnglat
        }, options), eventData);
    }

    /**
     * Returns the map's current zoom level.
     *
     * @returns The map's current zoom level.
     * @example
     * ```ts
     * map.getZoom();
     * ```
     */
    getZoom(): number { return this.transform.zoom; }

    /**
     * Sets the map's zoom level. Equivalent to `jumpTo({zoom: zoom})`.
     *
     * Triggers the following events: `movestart`, `move`, `moveend`, `zoomstart`, `zoom`, and `zoomend`.
     *
     * @param zoom - The zoom level to set (0-20).
     * @param eventData - Additional properties to be added to event objects of events triggered by this method.
     * @example
     * Zoom to the zoom level 5 without an animated transition
     * ```ts
     * map.setZoom(5);
     * ```
     */
    setZoom(zoom: number, eventData?: any): this {
        this.jumpTo({zoom}, eventData);
        return this;
    }

    /**
     * Zooms the map to the specified zoom level, with an animated transition.
     *
     * Triggers the following events: `movestart`, `move`, `moveend`, `zoomstart`, `zoom`, and `zoomend`.
     *
     * @param zoom - The zoom level to transition to.
     * @param options - Options object
     * @param eventData - Additional properties to be added to event objects of events triggered by this method.
     * @example
     * ```ts
     * // Zoom to the zoom level 5 without an animated transition
     * map.zoomTo(5);
     * // Zoom to the zoom level 8 with an animated transition
     * map.zoomTo(8, {
     *   duration: 2000,
     *   offset: [100, 50]
     * });
     * ```
     */
    zoomTo(zoom: number, options?: AnimationOptions | null, eventData?: any): this {
        return this.easeTo(extend({
            zoom
        }, options), eventData);
    }

    /**
     * Increases the map's zoom level by 1.
     *
     * Triggers the following events: `movestart`, `move`, `moveend`, `zoomstart`, `zoom`, and `zoomend`.
     *
     * @param options - Options object
     * @param eventData - Additional properties to be added to event objects of events triggered by this method.
     * @example
     * Zoom the map in one level with a custom animation duration
     * ```ts
     * map.zoomIn({duration: 1000});
     * ```
     */
    zoomIn(options?: AnimationOptions, eventData?: any): this {
        this.zoomTo(this.getZoom() + 1, options, eventData);
        return this;
    }

    /**
     * Decreases the map's zoom level by 1.
     *
     * Triggers the following events: `movestart`, `move`, `moveend`, `zoomstart`, `zoom`, and `zoomend`.
     *
     * @param options - Options object
     * @param eventData - Additional properties to be added to event objects of events triggered by this method.
     * @example
     * Zoom the map out one level with a custom animation offset
     * ```ts
     * map.zoomOut({offset: [80, 60]});
     * ```
     */
    zoomOut(options?: AnimationOptions, eventData?: any): this {
        this.zoomTo(this.getZoom() - 1, options, eventData);
        return this;
    }

    /**
     * Returns the map's current vertical field of view, in degrees.
     *
     * @returns The map's current vertical field of view.
     * @defaultValue 36.87
     * @example
     * ```ts
     * const verticalFieldOfView = map.getVerticalFieldOfView();
     * ```
     */
    getVerticalFieldOfView(): number { return this.transform.fov; }

    /**
     * Sets the map's vertical field of view, in degrees.
     *
     * Triggers the following events: `movestart`, `move`, and `moveend`.
     *
     * @param fov - The vertical field of view to set, in degrees (0-180).
     * @param eventData - Additional properties to be added to event objects of events triggered by this method.
     * @defaultValue 36.87
     * @example
     * Change vertical field of view to 30 degrees
     * ```ts
     * map.setVerticalFieldOfView(30);
     * ```
     */
    setVerticalFieldOfView(fov: number, eventData?: any): this {
        if (fov != this.transform.fov) {
            this.transform.setFov(fov);
            this.fire(new Event('movestart', eventData))
                .fire(new Event('move', eventData))
                .fire(new Event('moveend', eventData));
        }
        return this;
    }

    /**
     * Returns the map's current bearing. The bearing is the compass direction that is "up"; for example, a bearing
     * of 90° orients the map so that east is up.
     *
     * @returns The map's current bearing.
     * @see [Navigate the map with game-like controls](https://maplibre.org/maplibre-gl-js/docs/examples/game-controls/)
     */
    getBearing(): number { return this.transform.bearing; }

    /**
     * Sets the map's bearing (rotation). The bearing is the compass direction that is "up"; for example, a bearing
     * of 90° orients the map so that east is up.
     *
     * Equivalent to `jumpTo({bearing: bearing})`.
     *
     * Triggers the following events: `movestart`, `moveend`, and `rotate`.
     *
     * @param bearing - The desired bearing.
     * @param eventData - Additional properties to be added to event objects of events triggered by this method.
     * @example
     * Rotate the map to 90 degrees
     * ```ts
     * map.setBearing(90);
     * ```
     */
    setBearing(bearing: number, eventData?: any): this {
        this.jumpTo({bearing}, eventData);
        return this;
    }

    /**
     * Returns the current padding applied around the map viewport.
     *
     * @returns The current padding around the map viewport.
     */
    getPadding(): PaddingOptions { return this.transform.padding; }

    /**
     * Sets the padding in pixels around the viewport.
     *
     * Equivalent to `jumpTo({padding: padding})`.
     *
     * Triggers the following events: `movestart` and `moveend`.
     *
     * @param padding - The desired padding.
     * @param eventData - Additional properties to be added to event objects of events triggered by this method.
     * @example
     * Sets a left padding of 300px, and a top padding of 50px
     * ```ts
     * map.setPadding({ left: 300, top: 50 });
     * ```
     */
    setPadding(padding: PaddingOptions, eventData?: any): this {
        this.jumpTo({padding}, eventData);
        return this;
    }

    /**
     * Rotates the map to the specified bearing, with an animated transition. The bearing is the compass direction
     * that is "up"; for example, a bearing of 90° orients the map so that east is up.
     *
     * Triggers the following events: `movestart`, `moveend`, and `rotate`.
     *
     * @param bearing - The desired bearing.
     * @param options - Options object
     * @param eventData - Additional properties to be added to event objects of events triggered by this method.
     */
    rotateTo(bearing: number, options?: AnimationOptions, eventData?: any): this {
        return this.easeTo(extend({
            bearing
        }, options), eventData);
    }

    /**
     * Rotates the map so that north is up (0° bearing), with an animated transition.
     *
     * Triggers the following events: `movestart`, `moveend`, and `rotate`.
     *
     * @param options - Options object
     * @param eventData - Additional properties to be added to event objects of events triggered by this method.
     */
    resetNorth(options?: AnimationOptions, eventData?: any): this {
        this.rotateTo(0, extend({duration: 1000}, options), eventData);
        return this;
    }

    /**
     * Rotates and pitches the map so that north is up (0° bearing) and pitch and roll are 0°, with an animated transition.
     *
     * Triggers the following events: `movestart`, `move`, `moveend`, `pitchstart`, `pitch`, `pitchend`, `rollstart`, `roll`, `rollend`, and `rotate`.
     *
     * @param options - Options object
     * @param eventData - Additional properties to be added to event objects of events triggered by this method.
     */
    resetNorthPitch(options?: AnimationOptions, eventData?: any): this {
        this.easeTo(extend({
            bearing: 0,
            pitch: 0,
            roll: 0,
            duration: 1000
        }, options), eventData);
        return this;
    }

    /**
     * Snaps the map so that north is up (0° bearing), if the current bearing is close enough to it (i.e. within the
     * `bearingSnap` threshold).
     *
     * Triggers the following events: `movestart`, `moveend`, and `rotate`.
     *
     * @param options - Options object
     * @param eventData - Additional properties to be added to event objects of events triggered by this method.
     */
    snapToNorth(options?: AnimationOptions, eventData?: any): this {
        if (Math.abs(this.getBearing()) < this._bearingSnap) {
            return this.resetNorth(options, eventData);
        }
        return this;
    }

    /**
     * Returns the map's current pitch (tilt).
     *
     * @returns The map's current pitch, measured in degrees away from the plane of the screen.
     */
    getPitch(): number { return this.transform.pitch; }

    /**
     * Sets the map's pitch (tilt). Equivalent to `jumpTo({pitch: pitch})`.
     *
     * Triggers the following events: `movestart`, `moveend`, `pitchstart`, and `pitchend`.
     *
     * @param pitch - The pitch to set, measured in degrees away from the plane of the screen (0-60).
     * @param eventData - Additional properties to be added to event objects of events triggered by this method.
     */
    setPitch(pitch: number, eventData?: any): this {
        this.jumpTo({pitch}, eventData);
        return this;
    }

    /**
     * Returns the map's current roll angle.
     *
     * @returns The map's current roll, measured in degrees about the camera boresight.
     */
    getRoll(): number { return this.transform.roll; }

    /**
     * Sets the map's roll angle. Equivalent to `jumpTo({roll: roll})`.
     *
     * Triggers the following events: `movestart`, `moveend`, `rollstart`, and `rollend`.
     *
     * @param roll - The roll to set, measured in degrees about the camera boresight
     * @param eventData - Additional properties to be added to event objects of events triggered by this method.
     */
    setRoll(roll: number, eventData?: any): this {
        this.jumpTo({roll}, eventData);
        return this;
    }

    /**
     * @param bounds - Calculate the center for these bounds in the viewport and use
     * the highest zoom level up to and including `Map#getMaxZoom()` that fits
     * in the viewport. LngLatBounds represent a box that is always axis-aligned with bearing 0.
     * Bounds will be taken in [sw, ne] order. Southwest point will always be to the left of the northeast point.
     * @param options - Options object
     * @returns If map is able to fit to provided bounds, returns `center`, `zoom`, and `bearing`.
     * If map is unable to fit, method will warn and return undefined.
     * @example
     * ```ts
     * let bbox = [[-79, 43], [-73, 45]];
     * let newCameraTransform = map.cameraForBounds(bbox, {
     *   padding: {top: 10, bottom:25, left: 15, right: 5}
     * });
     * ```
     */
    cameraForBounds(bounds: LngLatBoundsLike, options?: CameraForBoundsOptions): CenterZoomBearing | undefined {
        bounds = LngLatBounds.convert(bounds).adjustAntiMeridian();
        const bearing = options && options.bearing || 0;

        return this._cameraForBoxAndBearing(bounds.getNorthWest(), bounds.getSouthEast(), bearing, options);
    }

    /**
     * @internal
     * Calculate the center of these two points in the viewport and use
     * the highest zoom level up to and including `Map#getMaxZoom()` that fits
     * the AABB defined by these points in the viewport at the specified bearing.
     * @param p0 - First point
     * @param p1 - Second point
     * @param bearing - Desired map bearing at end of animation, in degrees
     * @param options - the camera options
     * @returns If map is able to fit to provided bounds, returns `center`, `zoom`, and `bearing`.
     *      If map is unable to fit, method will warn and return undefined.
     * @example
     * ```ts
     * let p0 = [-79, 43];
     * let p1 = [-73, 45];
     * let bearing = 90;
     * let newCameraTransform = map._cameraForBoxAndBearing(p0, p1, bearing, {
     *   padding: {top: 10, bottom:25, left: 15, right: 5}
     * });
     * ```
     */
    _cameraForBoxAndBearing(p0: LngLatLike, p1: LngLatLike, bearing: number, options?: CameraForBoundsOptions): CenterZoomBearing | undefined {
        const defaultPadding = {
            top: 0,
            bottom: 0,
            right: 0,
            left: 0
        };
        options = extend({
            padding: defaultPadding,
            offset: [0, 0],
            maxZoom: this.transform.maxZoom
        }, options);

        if (typeof options.padding === 'number') {
            const p = options.padding;
            options.padding = {
                top: p,
                bottom: p,
                right: p,
                left: p
            };
        }

        const padding = extend(defaultPadding, options.padding) as PaddingOptions;
        options.padding = padding;
        const tr = this.transform;
        const bounds = new LngLatBounds(p0, p1);

        return this.cameraHelper.cameraForBoxAndBearing(options, padding, bounds, bearing, tr);
    }

    /**
     * Pans and zooms the map to contain its visible area within the specified geographical bounds.
     * This function will also reset the map's bearing to 0 if bearing is nonzero.
     *
     * Triggers the following events: `movestart` and `moveend`.
     *
     * @param bounds - Center these bounds in the viewport and use the highest
     * zoom level up to and including `Map#getMaxZoom()` that fits them in the viewport.
     * Bounds will be taken in [sw, ne] order. Southwest point will always be to the left of the northeast point.
     * @param options - Options supports all properties from {@link AnimationOptions} and {@link CameraOptions} in addition to the fields below.
     * @param eventData - Additional properties to be added to event objects of events triggered by this method.
     * @example
     * ```ts
     * let bbox = [[-79, 43], [-73, 45]];
     * map.fitBounds(bbox, {
     *   padding: {top: 10, bottom:25, left: 15, right: 5}
     * });
     * ```
     * @see [Fit a map to a bounding box](https://maplibre.org/maplibre-gl-js/docs/examples/fitbounds/)
     */
    fitBounds(bounds: LngLatBoundsLike, options?: FitBoundsOptions, eventData?: any): this {
        return this._fitInternal(
            this.cameraForBounds(bounds, options),
            options,
            eventData);
    }

    /**
     * Pans, rotates and zooms the map to to fit the box made by points p0 and p1
     * once the map is rotated to the specified bearing. To zoom without rotating,
     * pass in the current map bearing.
     *
     * Triggers the following events: `movestart`, `move`, `moveend`, `zoomstart`, `zoom`, `zoomend` and `rotate`.
     *
     * @param p0 - First point on screen, in pixel coordinates
     * @param p1 - Second point on screen, in pixel coordinates
     * @param bearing - Desired map bearing at end of animation, in degrees
     * @param options - Options object
     * @param eventData - Additional properties to be added to event objects of events triggered by this method.
     * @example
     * ```ts
     * let p0 = [220, 400];
     * let p1 = [500, 900];
     * map.fitScreenCoordinates(p0, p1, map.getBearing(), {
     *   padding: {top: 10, bottom:25, left: 15, right: 5}
     * });
     * ```
     * @see Used by {@link BoxZoomHandler}
     */
    fitScreenCoordinates(p0: PointLike, p1: PointLike, bearing: number, options?: FitBoundsOptions, eventData?: any): this {
        return this._fitInternal(
            this._cameraForBoxAndBearing(
                this.transform.screenPointToLocation(Point.convert(p0)),
                this.transform.screenPointToLocation(Point.convert(p1)),
                bearing,
                options),
            options,
            eventData);
    }

    _fitInternal(calculatedOptions?: CenterZoomBearing, options?: FitBoundsOptions, eventData?: any): this {
        // cameraForBounds warns + returns undefined if unable to fit:
        if (!calculatedOptions) return this;

        options = extend(calculatedOptions, options);
        // Explicitly remove the padding field because, calculatedOptions already accounts for padding by setting zoom and center accordingly.
        delete options.padding;

        return options.linear ?
            this.easeTo(options, eventData) :
            this.flyTo(options, eventData);
    }

    /**
     * Changes any combination of center, zoom, bearing, pitch, and roll, without
     * an animated transition. The map will retain its current values for any
     * details not specified in `options`.
     *
     * Triggers the following events: `movestart`, `move`, `moveend`, `zoomstart`, `zoom`, `zoomend`, `pitchstart`,
     * `pitch`, `pitchend`, `rollstart`, `roll`, `rollend` and `rotate`.
     *
     * @param options - Options object
     * @param eventData - Additional properties to be added to event objects of events triggered by this method.
     * @example
     * ```ts
     * // jump to coordinates at current zoom
     * map.jumpTo({center: [0, 0]});
     * // jump with zoom, pitch, and bearing options
     * map.jumpTo({
     *   center: [0, 0],
     *   zoom: 8,
     *   pitch: 45,
     *   bearing: 90
     * });
     * ```
     * @see [Jump to a series of locations](https://maplibre.org/maplibre-gl-js/docs/examples/jump-to/)
     * @see [Update a feature in realtime](https://maplibre.org/maplibre-gl-js/docs/examples/live-update-feature/)
     */
    jumpTo(options: JumpToOptions, eventData?: any): this {
        this.stop();

        const tr = this._getTransformForUpdate();
        let bearingChanged = false,
            pitchChanged = false;
        let rollChanged = false;

        const oldZoom = tr.zoom;

        this.cameraHelper.handleJumpToCenterZoom(tr, options);

        const zoomChanged = tr.zoom !== oldZoom;

        if ('elevation' in options && tr.elevation !== +options.elevation) {
            tr.setElevation(+options.elevation);
        }

        if ('bearing' in options && tr.bearing !== +options.bearing) {
            bearingChanged = true;
            tr.setBearing(+options.bearing);
        }

        if ('pitch' in options && tr.pitch !== +options.pitch) {
            pitchChanged = true;
            tr.setPitch(+options.pitch);
        }

        if ('roll' in options && tr.roll !== +options.roll) {
            rollChanged = true;
            tr.setRoll(+options.roll);
        }

        if (options.padding != null && !tr.isPaddingEqual(options.padding)) {
            tr.setPadding(options.padding);
        }
        this._applyUpdatedTransform(tr);

        this.fire(new Event('movestart', eventData))
            .fire(new Event('move', eventData));

        if (zoomChanged) {
            this.fire(new Event('zoomstart', eventData))
                .fire(new Event('zoom', eventData))
                .fire(new Event('zoomend', eventData));
        }

        if (bearingChanged) {
            this.fire(new Event('rotatestart', eventData))
                .fire(new Event('rotate', eventData))
                .fire(new Event('rotateend', eventData));
        }

        if (pitchChanged) {
            this.fire(new Event('pitchstart', eventData))
                .fire(new Event('pitch', eventData))
                .fire(new Event('pitchend', eventData));
        }

        if (rollChanged) {
            this.fire(new Event('rollstart', eventData))
                .fire(new Event('roll', eventData))
                .fire(new Event('rollend', eventData));
        }

        return this.fire(new Event('moveend', eventData));
    }

    /**
     * Given a camera 'from' position and a position to look at (`to`), calculates zoom and camera rotation and returns them as {@link CameraOptions}.
     * @param from - The camera to look from
     * @param altitudeFrom - The altitude of the camera to look from
     * @param to - The center to look at
     * @param altitudeTo - Optional altitude of the center to look at. If none given the ground height will be used.
     * @returns the calculated camera options
     * @example
     * ```ts
     * // Calculate options to look from (1°, 0°, 1000m) to (1°, 1°, 0m)
     * const cameraLngLat = new LngLat(1, 0);
     * const cameraAltitude = 1000;
     * const targetLngLat = new LngLat(1, 1);
     * const targetAltitude = 0;
     * const cameraOptions = map.calculateCameraOptionsFromTo(cameraLngLat, cameraAltitude, targetLngLat, targetAltitude);
     * // Apply calculated options
     * map.jumpTo(cameraOptions);
     * ```
     */
    calculateCameraOptionsFromTo(from: LngLat, altitudeFrom: number, to: LngLat, altitudeTo: number = 0): CameraOptions {
        const fromMercator = MercatorCoordinate.fromLngLat(from, altitudeFrom);
        const toMercator = MercatorCoordinate.fromLngLat(to, altitudeTo);
        const dx = toMercator.x - fromMercator.x;
        const dy = toMercator.y - fromMercator.y;
        const dz = toMercator.z - fromMercator.z;

        const distance3D = Math.hypot(dx, dy, dz);
        if (distance3D === 0) throw new Error('Can\'t calculate camera options with same From and To');

        const groundDistance = Math.hypot(dx, dy);

        const zoom = scaleZoom(this.transform.cameraToCenterDistance / distance3D / this.transform.tileSize);
        const bearing = (Math.atan2(dx, -dy) * 180) / Math.PI;
        let pitch = (Math.acos(groundDistance / distance3D) * 180) / Math.PI;
        pitch = dz < 0 ? 90 - pitch : 90 + pitch;

        return {
            center: toMercator.toLngLat(),
            elevation: altitudeTo,
            zoom,
            pitch,
            bearing
        };
    }

    /**
     * Given a camera position and rotation, calculates zoom and center point and returns them as {@link CameraOptions}.
     * @param cameraLngLat - The lng, lat of the camera to look from
     * @param cameraAlt - The altitude of the camera to look from, in meters above sea level
     * @param bearing - Bearing of the camera, in degrees
     * @param pitch - Pitch of the camera, in degrees
     * @param roll - Roll of the camera, in degrees
     * @returns the calculated camera options
     * @example
     * ```ts
     * // Calculate options to look from camera position(1°, 0°, 1000m) with bearing = 90°, pitch = 30°, and roll = 45°
     * const cameraLngLat = new LngLat(1, 0);
     * const cameraAltitude = 1000;
     * const bearing = 90;
     * const pitch = 30;
     * const roll = 45;
     * const cameraOptions = map.calculateCameraOptionsFromCameraLngLatAltRotation(cameraLngLat, cameraAltitude, bearing, pitch, roll);
     * // Apply calculated options
     * map.jumpTo(cameraOptions);
     * ```
     */
    calculateCameraOptionsFromCameraLngLatAltRotation(cameraLngLat: LngLat, cameraAlt: number, bearing: number, pitch: number, roll?: number): CameraOptions {
        const centerInfo = this.transform.calculateCenterFromCameraLngLatAlt(cameraLngLat, cameraAlt, bearing, pitch);
        return {
            center: centerInfo.center,
            elevation: centerInfo.elevation,
            zoom: centerInfo.zoom,
            bearing,
            pitch,
            roll
        };
    }

    /**
     * Changes any combination of `center`, `zoom`, `bearing`, `pitch`, `roll`, and `padding` with an animated transition
     * between old and new values. The map will retain its current values for any
     * details not specified in `options`.
     *
     * Note: The transition will happen instantly if the user has enabled
     * the `reduced motion` accessibility feature enabled in their operating system,
     * unless `options` includes `essential: true`.
     *
     * Triggers the following events: `movestart`, `move`, `moveend`, `zoomstart`, `zoom`, `zoomend`, `pitchstart`,
     * `pitch`, `pitchend`, `rollstart`, `roll`, `rollend`, and `rotate`.
     *
     * @param options - Options describing the destination and animation of the transition.
     * Accepts {@link CameraOptions} and {@link AnimationOptions}.
     * @param eventData - Additional properties to be added to event objects of events triggered by this method.
     * @see [Navigate the map with game-like controls](https://maplibre.org/maplibre-gl-js/docs/examples/game-controls/)
     */
    easeTo(options: EaseToOptions & {
        easeId?: string;
        noMoveStart?: boolean;
    }, eventData?: any): this {
        this._stop(false, options.easeId);

        options = extend({
            offset: [0, 0],
            duration: 500,
            easing: defaultEasing
        }, options);

        if (options.animate === false || (!options.essential && browser.prefersReducedMotion)) {
            options.duration = 0;
        }

        const tr = this._getTransformForUpdate();
        const startBearing = this.getBearing(),
            startPitch = tr.pitch,
            startRoll = tr.roll,
            bearing = 'bearing' in options ? this._normalizeBearing(options.bearing, startBearing) : startBearing,
            pitch = 'pitch' in options ? +options.pitch : startPitch,
            roll = 'roll' in options ? this._normalizeBearing(options.roll, startRoll) : startRoll,
            padding = ('padding' in options ? options.padding : tr.padding) as PaddingOptions;
        const offsetAsPoint = Point.convert(options.offset);

        let around, aroundPoint;

        if (options.around) {
            around = LngLat.convert(options.around);
            aroundPoint = tr.locationToScreenPoint(around);
        }

        const currently = {
            moving: this._moving,
            zooming: this._zooming,
            rotating: this._rotating,
            pitching: this._pitching,
            rolling: this._rolling
        };

        const easeHandler = this.cameraHelper.handleEaseTo(tr, {
            bearing,
            pitch,
            roll,
            padding,
            around,
            aroundPoint,
            offsetAsPoint,
            offset: options.offset,
            zoom: options.zoom,
            center: options.center,
        });

        this._rotating = this._rotating || (startBearing !== bearing);
        this._pitching = this._pitching || (pitch !== startPitch);
        this._rolling = this._rolling || (roll !== startRoll);
        this._padding = !tr.isPaddingEqual(padding as PaddingOptions);
        this._zooming = this._zooming || easeHandler.isZooming;
        this._easeId = options.easeId;
        this._prepareEase(eventData, options.noMoveStart, currently);

        if (this.terrain) {
            this._prepareElevation(easeHandler.elevationCenter);
        }

        this._ease((k) => {
            easeHandler.easeFunc(k);

            if (this.terrain && !options.freezeElevation) this._updateElevation(k);
            this._applyUpdatedTransform(tr);
            this._fireMoveEvents(eventData);

        }, (interruptingEaseId?: string) => {
            if (this.terrain && options.freezeElevation) this._finalizeElevation();
            this._afterEase(eventData, interruptingEaseId);
        }, options as any);

        return this;
    }

    _prepareEase(eventData: any, noMoveStart: boolean, currently: any = {}) {
        this._moving = true;
        if (!noMoveStart && !currently.moving) {
            this.fire(new Event('movestart', eventData));
        }
        if (this._zooming && !currently.zooming) {
            this.fire(new Event('zoomstart', eventData));
        }
        if (this._rotating && !currently.rotating) {
            this.fire(new Event('rotatestart', eventData));
        }
        if (this._pitching && !currently.pitching) {
            this.fire(new Event('pitchstart', eventData));
        }
        if (this._rolling && !currently.rolling) {
            this.fire(new Event('rollstart', eventData));
        }
    }

    _prepareElevation(center: LngLat) {
        this._elevationCenter = center;
        this._elevationStart = this.transform.elevation;
        this._elevationTarget = this.terrain.getElevationForLngLatZoom(center, this.transform.tileZoom);
        this._elevationFreeze = true;
    }

    _updateElevation(k: number) {
        this.transform.setMinElevationForCurrentTile(this.terrain.getMinTileElevationForLngLatZoom(this._elevationCenter, this.transform.tileZoom));
        const elevation = this.terrain.getElevationForLngLatZoom(this._elevationCenter, this.transform.tileZoom);
        // target terrain updated during flight, slowly move camera to new height
        if (k < 1 && elevation !== this._elevationTarget) {
            const pitch1 = this._elevationTarget - this._elevationStart;
            const pitch2 = (elevation - (pitch1 * k + this._elevationStart)) / (1 - k);
            this._elevationStart += k * (pitch1 - pitch2);
            this._elevationTarget = elevation;
        }
        this.transform.setElevation(interpolates.number(this._elevationStart, this._elevationTarget, k));
    }

    _finalizeElevation() {
        this._elevationFreeze = false;
        if (this.getCenterClampedToGround()) {
            this.transform.recalculateZoomAndCenter(this.terrain);
        }
    }

    /**
     * @internal
     * Called when the camera is about to be manipulated.
     * If `transformCameraUpdate` is specified or terrain is enabled, a copy of
     * the current transform is created to track the accumulated changes.
     * This underlying transform represents the "desired state" proposed by input handlers / animations / UI controls.
     * It may differ from the state used for rendering (`this.transform`).
     * @returns Transform to apply changes to
     */
    _getTransformForUpdate(): ITransform {
        if (!this.transformCameraUpdate && !this.terrain) return this.transform;

        if (!this._requestedCameraState) {
            this._requestedCameraState = this.transform.clone();
        }
        return this._requestedCameraState;
    }

    /**
     * @internal
     * Checks the given transform for the camera being below terrain surface and
     * returns new pitch and zoom to fix that.
     *
     * With the new pitch and zoom, the camera will be at the same ground
     * position but at higher altitude. It will still point to the same spot on
     * the map.
     *
     * @param tr - The transform to check.
     */
    _elevateCameraIfInsideTerrain(tr: ITransform) : { pitch?: number; zoom?: number } {
        if (!this._terrainCollision) {
            return {};
        }

        if (!this.terrain && tr.elevation >= 0 && tr.pitch <= 90) {
            return {};
        }
        const cameraLngLat = tr.getCameraLngLat();
        const cameraAltitude = tr.getCameraAltitude();
        const minAltitude = this.terrain ? this.terrain.getElevationForLngLatZoom(cameraLngLat, tr.zoom) : 0;
        if (cameraAltitude < minAltitude) {
            const newCamera = this.calculateCameraOptionsFromTo(
                cameraLngLat, minAltitude, tr.center, tr.elevation);
            return {
                pitch: newCamera.pitch,
                zoom: newCamera.zoom,
            };
        }
        return {};
    }

    /**
     * @internal
     * Called after the camera is done being manipulated.
     * @param tr - the requested camera end state
     * If the camera is inside terrain, it gets elevated.
     * Call `transformCameraUpdate` if present, and then apply the "approved" changes.
     */
    _applyUpdatedTransform(tr: ITransform) {
        const modifiers : ((tr: ITransform) => ReturnType<CameraUpdateTransformFunction>)[] = [];
        modifiers.push(tr => this._elevateCameraIfInsideTerrain(tr));
        if (this.transformCameraUpdate) {
            modifiers.push(tr => this.transformCameraUpdate(tr));
        }
        if (!modifiers.length) {
            return;
        }
        const finalTransform = tr.clone();
        for (const modifier of modifiers) {
            const nextTransform = finalTransform.clone();
            const {
                center,
                zoom,
                roll,
                pitch,
                bearing,
                elevation
            } = modifier(nextTransform);
            if (center) nextTransform.setCenter(center);
            if (elevation !== undefined) nextTransform.setElevation(elevation);
            if (zoom !== undefined) nextTransform.setZoom(zoom);
            if (roll !== undefined) nextTransform.setRoll(roll);
            if (pitch !== undefined) nextTransform.setPitch(pitch);
            if (bearing !== undefined) nextTransform.setBearing(bearing);
            finalTransform.apply(nextTransform);
        }
        this.transform.apply(finalTransform);
    }

    _fireMoveEvents(eventData?: any) {
        this.fire(new Event('move', eventData));
        if (this._zooming) {
            this.fire(new Event('zoom', eventData));
        }
        if (this._rotating) {
            this.fire(new Event('rotate', eventData));
        }
        if (this._pitching) {
            this.fire(new Event('pitch', eventData));
        }
        if (this._rolling) {
            this.fire(new Event('roll', eventData));
        }
    }

    _afterEase(eventData?: any, easeId?: string) {
        // if this easing is being stopped to start another easing with
        // the same id then don't fire any events to avoid extra start/stop events
        if (this._easeId && easeId && this._easeId === easeId) {
            return;
        }
        delete this._easeId;

        const wasZooming = this._zooming;
        const wasRotating = this._rotating;
        const wasPitching = this._pitching;
        const wasRolling = this._rolling;
        this._moving = false;
        this._zooming = false;
        this._rotating = false;
        this._pitching = false;
        this._rolling = false;
        this._padding = false;

        if (wasZooming) {
            this.fire(new Event('zoomend', eventData));
        }
        if (wasRotating) {
            this.fire(new Event('rotateend', eventData));
        }
        if (wasPitching) {
            this.fire(new Event('pitchend', eventData));
        }
        if (wasRolling) {
            this.fire(new Event('rollend', eventData));
        }
        this.fire(new Event('moveend', eventData));
    }

    /**
     * Changes any combination of center, zoom, bearing, pitch, and roll, animating the transition along a curve that
     * evokes flight. The animation seamlessly incorporates zooming and panning to help
     * the user maintain her bearings even after traversing a great distance.
     *
     * Note: The animation will be skipped, and this will behave equivalently to `jumpTo`
     * if the user has the `reduced motion` accessibility feature enabled in their operating system,
     * unless 'options' includes `essential: true`.
     *
     * Triggers the following events: `movestart`, `move`, `moveend`, `zoomstart`, `zoom`, `zoomend`, `pitchstart`,
     * `pitch`, `pitchend`, `rollstart`, `roll`, `rollend`, and `rotate`.
     *
     * @param options - Options describing the destination and animation of the transition.
     * Accepts {@link CameraOptions}, {@link AnimationOptions},
     * and the following additional options.
     * @param eventData - Additional properties to be added to event objects of events triggered by this method.
     * @example
     * ```ts
     * // fly with default options to null island
     * map.flyTo({center: [0, 0], zoom: 9});
     * // using flyTo options
     * map.flyTo({
     *   center: [0, 0],
     *   zoom: 9,
     *   speed: 0.2,
     *   curve: 1,
     *   easing(t) {
     *     return t;
     *   }
     * });
     * ```
     * @see [Fly to a location](https://maplibre.org/maplibre-gl-js/docs/examples/flyto/)
     * @see [Slowly fly to a location](https://maplibre.org/maplibre-gl-js/docs/examples/flyto-options/)
     * @see [Fly to a location based on scroll position](https://maplibre.org/maplibre-gl-js/docs/examples/scroll-fly-to/)
     */
    flyTo(options: FlyToOptions, eventData?: any): this {
        // Fall through to jumpTo if user has set prefers-reduced-motion
        if (!options.essential && browser.prefersReducedMotion) {
            const coercedOptions = pick(options, ['center', 'zoom', 'bearing', 'pitch', 'roll', 'elevation']) as CameraOptions;
            return this.jumpTo(coercedOptions, eventData);
        }

        // This method implements an “optimal path” animation, as detailed in:
        //
        // Van Wijk, Jarke J.; Nuij, Wim A. A. “Smooth and efficient zooming and panning.” INFOVIS
        //   ’03. pp. 15–22. <https://www.win.tue.nl/~vanwijk/zoompan.pdf#page=5>.
        //
        // Where applicable, local variable documentation begins with the associated variable or
        // function in van Wijk (2003).

        this.stop();

        options = extend({
            offset: [0, 0],
            speed: 1.2,
            curve: 1.42,
            easing: defaultEasing
        }, options);

        const tr = this._getTransformForUpdate(),
            startBearing = tr.bearing,
            startPitch = tr.pitch,
            startRoll = tr.roll,
            startPadding = tr.padding;

        const bearing = 'bearing' in options ? this._normalizeBearing(options.bearing, startBearing) : startBearing;
        const pitch = 'pitch' in options ? +options.pitch : startPitch;
        const roll = 'roll' in options ? this._normalizeBearing(options.roll, startRoll) : startRoll;
        const padding = ('padding' in options ? options.padding : tr.padding) as PaddingOptions;

        const offsetAsPoint = Point.convert(options.offset);
        let pointAtOffset = tr.centerPoint.add(offsetAsPoint);
        const locationAtOffset = tr.screenPointToLocation(pointAtOffset);

        const flyToHandler = this.cameraHelper.handleFlyTo(tr, {
            bearing,
            pitch,
            roll,
            padding,
            locationAtOffset,
            offsetAsPoint,
            center: options.center,
            minZoom: options.minZoom,
            zoom: options.zoom,
        });

        let rho = options.curve;

        // w₀: Initial visible span, measured in pixels at the initial scale.
        const w0 = Math.max(tr.width, tr.height);
        // w₁: Final visible span, measured in pixels with respect to the initial scale.
        const w1 = w0 / flyToHandler.scaleOfZoom;
        // Length of the flight path as projected onto the ground plane, measured in pixels from
        // the world image origin at the initial scale.
        const u1 = flyToHandler.pixelPathLength;

        if (typeof flyToHandler.scaleOfMinZoom === 'number') {
            // w<sub>m</sub>: Maximum visible span, measured in pixels with respect to the initial
            // scale.
            const wMax = w0 / flyToHandler.scaleOfMinZoom;
            rho = Math.sqrt(wMax / u1 * 2);
        }

        // ρ²
        const rho2 = rho * rho;

        /**
         * rᵢ: Returns the zoom-out factor at one end of the animation.
         *
         * @param descent - `true` for the descent, `false` for the ascent
         */
        function zoomOutFactor(descent: boolean) {
            const b = (w1 * w1 - w0 * w0 + (descent ? -1 : 1) * rho2 * rho2 * u1 * u1) / (2 * (descent ? w1 : w0) * rho2 * u1);
            return Math.log(Math.sqrt(b * b + 1) - b);
        }

        function sinh(n) { return (Math.exp(n) - Math.exp(-n)) / 2; }
        function cosh(n) { return (Math.exp(n) + Math.exp(-n)) / 2; }
        function tanh(n) { return sinh(n) / cosh(n); }

        // r₀: Zoom-out factor during ascent.
        const r0 = zoomOutFactor(false);

        // w(s): Returns the visible span on the ground, measured in pixels with respect to the
        // initial scale. Assumes an angular field of view of 2 arctan ½ ≈ 53°.
        let w: (_: number) => number = function (s) {
            return (cosh(r0) / cosh(r0 + rho * s));
        };

        // u(s): Returns the distance along the flight path as projected onto the ground plane,
        // measured in pixels from the world image origin at the initial scale.
        let u: (_: number) => number = function (s) {
            return w0 * ((cosh(r0) * tanh(r0 + rho * s) - sinh(r0)) / rho2) / u1;
        };

        // S: Total length of the flight path, measured in ρ-screenfuls.
        let S = (zoomOutFactor(true) - r0) / rho;

        // When u₀ = u₁, the optimal path doesn’t require both ascent and descent.
        if (Math.abs(u1) < 0.000002 || !isFinite(S)) {
            // Perform a more or less instantaneous transition if the path is too short.
            if (Math.abs(w0 - w1) < 0.000001) return this.easeTo(options, eventData);

            const k = w1 < w0 ? -1 : 1;
            S = Math.abs(Math.log(w1 / w0)) / rho;

            u = () => 0;
            w = (s) => Math.exp(k * rho * s);
        }

        if ('duration' in options) {
            options.duration = +options.duration;
        } else {
            const V = 'screenSpeed' in options ? +options.screenSpeed / rho : +options.speed;
            options.duration = 1000 * S / V;
        }

        if (options.maxDuration && options.duration > options.maxDuration) {
            options.duration = 0;
        }

        this._zooming = true;
        this._rotating = (startBearing !== bearing);
        this._pitching = (pitch !== startPitch);
        this._rolling = (roll !== startRoll);
        this._padding = !tr.isPaddingEqual(padding as PaddingOptions);

        this._prepareEase(eventData, false);
        if (this.terrain) this._prepareElevation(flyToHandler.targetCenter);

        this._ease((k) => {
            // s: The distance traveled along the flight path, measured in ρ-screenfuls.
            const s = k * S;
            const scale = 1 / w(s);
            const centerFactor = u(s);
            if (this._rotating) {
                tr.setBearing(interpolates.number(startBearing, bearing, k));
            }
            if (this._pitching) {
                tr.setPitch(interpolates.number(startPitch, pitch, k));
            }
            if (this._rolling) {
                tr.setRoll(interpolates.number(startRoll, roll, k));
            }
            if (this._padding) {
                tr.interpolatePadding(startPadding, padding as PaddingOptions, k);
                // When padding is being applied, Transform#centerPoint is changing continuously,
                // thus we need to recalculate offsetPoint every frame
                pointAtOffset = tr.centerPoint.add(offsetAsPoint);
            }

            flyToHandler.easeFunc(k, scale, centerFactor, pointAtOffset);

            if (this.terrain && !options.freezeElevation) this._updateElevation(k);
            this._applyUpdatedTransform(tr);
            this._fireMoveEvents(eventData);
        }, () => {
            if (this.terrain && options.freezeElevation) this._finalizeElevation();
            this._afterEase(eventData);
        }, options);

        return this;
    }

    isEasing() {
        return !!this._easeFrameId;
    }

    /**
     * Stops any animated transition underway.
     */
    stop(): this {
        return this._stop();
    }

    _stop(allowGestures?: boolean, easeId?: string): this {
        if (this._easeFrameId) {
            this._cancelRenderFrame(this._easeFrameId);
            delete this._easeFrameId;
            delete this._onEaseFrame;
        }

        if (this._onEaseEnd) {
            // The _onEaseEnd function might emit events which trigger new
            // animation, which sets a new _onEaseEnd. Ensure we don't delete
            // it unintentionally.
            const onEaseEnd = this._onEaseEnd;
            delete this._onEaseEnd;
            onEaseEnd.call(this, easeId);
        }
        if (!allowGestures) {
            this.handlers?.stop(false);
        }
        return this;
    }

    _ease(frame: (_: number) => void,
        finish: () => void,
        options: {
            animate?: boolean;
            duration?: number;
            easing?: (_: number) => number;
        }) {
        if (options.animate === false || options.duration === 0) {
            frame(1);
            finish();
        } else {
            this._easeStart = browser.now();
            this._easeOptions = options;
            this._onEaseFrame = frame;
            this._onEaseEnd = finish;
            this._easeFrameId = this._requestRenderFrame(this._renderFrameCallback);
        }
    }

    // Callback for map._requestRenderFrame
    _renderFrameCallback = () => {
        const t = Math.min((browser.now() - this._easeStart) / this._easeOptions.duration, 1);
        this._onEaseFrame(this._easeOptions.easing(t));

        // if _stop is called during _onEaseFrame from _fireMoveEvents we should avoid a new _requestRenderFrame, checking it by ensuring _easeFrameId was not deleted
        if (t < 1 && this._easeFrameId) {
            this._easeFrameId = this._requestRenderFrame(this._renderFrameCallback);
        } else {
            this.stop();
        }
    };

    // convert bearing so that it's numerically close to the current one so that it interpolates properly
    _normalizeBearing(bearing: number, currentBearing: number) {
        bearing = wrap(bearing, -180, 180);
        const diff = Math.abs(bearing - currentBearing);
        if (Math.abs(bearing - 360 - currentBearing) < diff) bearing -= 360;
        if (Math.abs(bearing + 360 - currentBearing) < diff) bearing += 360;
        return bearing;
    }

    /**
     * Get the elevation difference between a given point
     * and a point that is currently in the middle of the screen.
     * This method should be used for proper positioning of custom 3d objects, as explained [here](https://maplibre.org/maplibre-gl-js/docs/examples/add-3d-model-with-terrain/)
     * Returns null if terrain is not enabled.
     * This method is subject to change in Maplibre GL JS v5.
     * @param lngLatLike - [x,y] or LngLat coordinates of the location
     * @returns elevation offset in meters
     */
    queryTerrainElevation(lngLatLike: LngLatLike): number | null {
        if (!this.terrain) {
            return null;
        }
        return this.terrain.getElevationForLngLatZoom(LngLat.convert(lngLatLike), this.transform.tileZoom);
    }
}
