import {vec3} from 'gl-matrix';
import {clamp, lerp, MAX_VALID_LATITUDE, mod, remapSaturate, scaleZoom, wrap} from '../../util/util';
import {LngLat} from '../lng_lat';
import {EXTENT} from '../../data/extent';
import type Point from '@mapbox/point-geometry';

export function getGlobeCircumferencePixels(transform: {worldSize: number; center: {lat: number}}): number {
    const radius = getGlobeRadiusPixels(transform.worldSize, transform.center.lat);
    const circumference = 2.0 * Math.PI * radius;
    return circumference;
}

export function globeDistanceOfLocationsPixels(transform: {worldSize: number; center: {lat: number}}, a: LngLat, b: LngLat): number {
    const vecA = angularCoordinatesToSurfaceVector(a);
    const vecB = angularCoordinatesToSurfaceVector(b);
    const dot = vec3.dot(vecA, vecB);
    const radians = Math.acos(dot);
    const circumference = getGlobeCircumferencePixels(transform);
    return radians / (2.0 * Math.PI) * circumference;
}

/**
 * For given mercator coordinates in range 0..1, returns the angular coordinates on the sphere's surface, in radians.
 */
export function mercatorCoordinatesToAngularCoordinatesRadians(mercatorX: number, mercatorY: number): [number, number] {
    const sphericalX = mod(mercatorX * Math.PI * 2.0 + Math.PI, Math.PI * 2);
    const sphericalY = 2.0 * Math.atan(Math.exp(Math.PI - (mercatorY * Math.PI * 2.0))) - Math.PI * 0.5;
    return [sphericalX, sphericalY];
}

/**
 * For a given longitude and latitude (note: in radians) returns the normalized vector from the planet center to the specified place on the surface.
 * @param lngRadians - Longitude in radians.
 * @param latRadians - Latitude in radians.
 */
export function angularCoordinatesRadiansToVector(lngRadians: number, latRadians: number): vec3 {
    const len = Math.cos(latRadians);
    const vec = new Float64Array(3) as any;
    vec[0] = Math.sin(lngRadians) * len;
    vec[1] = Math.sin(latRadians);
    vec[2] = Math.cos(lngRadians) * len;
    return vec;
}

/**
 * Projects a point within a tile to the surface of the unit sphere globe.
 * @param inTileX - X coordinate inside the tile in range [0 .. 8192].
 * @param inTileY - Y coordinate inside the tile in range [0 .. 8192].
 * @param tileIdX - Tile's X coordinate in range [0 .. 2^zoom - 1].
 * @param tileIdY - Tile's Y coordinate in range [0 .. 2^zoom - 1].
 * @param tileIdZ - Tile's zoom.
 * @returns A 3D vector - coordinates of the projected point on a unit sphere.
 */
export function projectTileCoordinatesToSphere(inTileX: number, inTileY: number, tileIdX: number, tileIdY: number, tileIdZ: number): vec3 {
    // This code could be assembled from 3 functions, but this is a hot path for symbol placement,
    // so for optimization purposes everything is inlined by hand.
    //
    // Non-inlined variant of this function would be this:
    //     const mercator = tileCoordinatesToMercatorCoordinates(inTileX, inTileY, tileID);
    //     const angular = mercatorCoordinatesToAngularCoordinatesRadians(mercator.x, mercator.y);
    //     const sphere = angularCoordinatesRadiansToVector(angular[0], angular[1]);
    //     return sphere;
    const scale = 1.0 / (1 << tileIdZ);
    const mercatorX = inTileX / EXTENT * scale + tileIdX * scale;
    const mercatorY = inTileY / EXTENT * scale + tileIdY * scale;
    const sphericalX = mod(mercatorX * Math.PI * 2.0 + Math.PI, Math.PI * 2);
    const sphericalY = 2.0 * Math.atan(Math.exp(Math.PI - (mercatorY * Math.PI * 2.0))) - Math.PI * 0.5;
    const len = Math.cos(sphericalY);
    const vec = new Float64Array(3) as any;
    vec[0] = Math.sin(sphericalX) * len;
    vec[1] = Math.sin(sphericalY);
    vec[2] = Math.cos(sphericalX) * len;
    return vec;
}

/**
 * For a given longitude and latitude (note: in degrees) returns the normalized vector from the planet center to the specified place on the surface.
 */
export function angularCoordinatesToSurfaceVector(lngLat: LngLat): vec3 {
    return angularCoordinatesRadiansToVector(lngLat.lng * Math.PI / 180, lngLat.lat * Math.PI / 180);
}

export function getGlobeRadiusPixels(worldSize: number, latitudeDegrees: number) {
    // We want zoom levels to be consistent between globe and flat views.
    // This means that the pixel size of features at the map center point
    // should be the same for both globe and flat view.
    // For this reason we scale the globe up when map center is nearer to the poles.
    return worldSize / (2.0 * Math.PI) / Math.cos(latitudeDegrees * Math.PI / 180);
}

/**
 * Given a 3D point on the surface of a unit sphere, returns its angular coordinates in degrees.
 * The input vector must be normalized.
 */
export function sphereSurfacePointToCoordinates(surface: vec3): LngLat {
    const latRadians = Math.asin(surface[1]);
    const latDegrees = latRadians / Math.PI * 180.0;
    const lengthXZ = Math.sqrt(surface[0] * surface[0] + surface[2] * surface[2]);
    if (lengthXZ > 1e-6) {
        const projX = surface[0] / lengthXZ;
        const projZ = surface[2] / lengthXZ;
        const acosZ = Math.acos(projZ);
        const lngRadians = (projX > 0) ? acosZ : -acosZ;
        const lngDegrees = lngRadians / Math.PI * 180.0;
        return new LngLat(wrap(lngDegrees, -180, 180), latDegrees);
    } else {
        return new LngLat(0.0, latDegrees);
    }
}

function planetScaleAtLatitude(latitudeDegrees: number): number {
    return Math.cos(latitudeDegrees * Math.PI / 180);
}

/**
 * Computes how much to modify zoom to keep the globe size constant when changing latitude.
 * @param transform - An instance of any transform. Does not have any relation on the computed values.
 * @param oldLat - Latitude before change, in degrees.
 * @param newLat - Latitude after change, in degrees.
 * @returns A value to add to zoom level used for old latitude to keep same planet radius at new latitude.
 */
export function getZoomAdjustment(oldLat: number, newLat: number): number {
    const oldCircumference = planetScaleAtLatitude(oldLat);
    const newCircumference = planetScaleAtLatitude(newLat);
    return scaleZoom(newCircumference / oldCircumference);
}

export function getDegreesPerPixel(worldSize: number, lat: number): number {
    return 360.0 / getGlobeCircumferencePixels({worldSize, center: {lat}});
}

/**
 * Returns transform's new center rotation after applying panning.
 * @param panDelta - Panning delta, in same units as what is supplied to {@link HandlerManager}.
 * @param tr - Current transform. This object is not modified by the function.
 * @returns New center location to set to the map's transform to apply the specified panning.
 */
export function computeGlobePanCenter(panDelta: Point, tr: {
    readonly bearingInRadians: number;
    readonly worldSize: number;
    readonly center: LngLat;
    readonly zoom: number;
}): LngLat {
    // Apply map bearing to the panning vector
    const rotatedPanDelta = panDelta.rotate(tr.bearingInRadians);
    // Compute what the current zoom would be if the transform center would be moved to latitude 0.
    const normalizedGlobeZoom = tr.zoom + getZoomAdjustment(tr.center.lat, 0);
    // Note: we divide longitude speed by planet width at the given latitude. But we diminish this effect when the globe is zoomed out a lot.
    const lngSpeed = lerp(
        1.0 / planetScaleAtLatitude(tr.center.lat), // speed adjusted by latitude
        1.0 / planetScaleAtLatitude(Math.min(Math.abs(tr.center.lat), 60)), // also adjusted, but latitude is clamped to 60° to avoid too large speeds near poles
        remapSaturate(normalizedGlobeZoom, 7, 3, 0, 1.0) // Values chosen so that globe interactions feel good. Not scientific by any means.
    );
    const panningDegreesPerPixel = getDegreesPerPixel(tr.worldSize, tr.center.lat);
    return new LngLat(
        tr.center.lng - rotatedPanDelta.x * panningDegreesPerPixel * lngSpeed,
        clamp(tr.center.lat + rotatedPanDelta.y * panningDegreesPerPixel, -MAX_VALID_LATITUDE, MAX_VALID_LATITUDE)
    );
}

/**
 * Integration of `1 / cos(x)`.
 */
function integrateSecX(x: number): number {
    const xHalf = 0.5 * x;
    const sin = Math.sin(xHalf);
    const cos = Math.cos(xHalf);
    return Math.log(sin + cos) - Math.log(cos - sin);
}

/**
 * Interpolates globe center between two locations while preserving apparent rotation speed during interpolation.
 * @param start - The starting location of the interpolation.
 * @param deltaLng - Longitude delta to the end of the interpolation.
 * @param deltaLat - Latitude delta to the end of the interpolation.
 * @param t - The interpolation point in [0..1], where 0 is starting location, 1 is end location and other values are in between.
 * @returns The interpolated location.
 */
export function interpolateLngLatForGlobe(start: LngLat, deltaLng: number, deltaLat: number, t: number): LngLat {
    // Rate of change of longitude when moving the globe should be roughly 1/cos(latitude)
    // We want to use this rate of change, even for interpolation during easing.
    // Thus we know the derivative of our interpolation function: 1/cos(x)
    // To get our interpolation function, we need to integrate that.

    const interpolatedLat = start.lat + deltaLat * t;

    if (Math.abs(deltaLat) > 1) {
        const endLat = start.lat + deltaLat;
        const onDifferentHemispheres = Math.sign(endLat) !== Math.sign(start.lat);
        // Where do we sample the integrated speed curve?
        const samplePointStart = (onDifferentHemispheres ? -Math.abs(start.lat) : Math.abs(start.lat)) * Math.PI / 180;
        const samplePointEnd = Math.abs(start.lat + deltaLat) * Math.PI / 180;
        // Read the integrated speed curve at those points, and at the interpolation value "t".
        const valueT = integrateSecX(samplePointStart + t * (samplePointEnd - samplePointStart));
        const valueStart = integrateSecX(samplePointStart);
        const valueEnd = integrateSecX(samplePointEnd);
        // Compute new interpolation factor based on the speed curve
        const newT = (valueT - valueStart) / (valueEnd - valueStart);
        // Interpolate using that factor
        const interpolatedLng = start.lng + deltaLng * newT;
        return new LngLat(
            interpolatedLng,
            interpolatedLat
        );
    } else {
        // Fall back to simple interpolation when latitude doesn't change much.
        const interpolatedLng = start.lng + deltaLng * t;
        return new LngLat(
            interpolatedLng,
            interpolatedLat
        );
    }
}
