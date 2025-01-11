import Point from '@mapbox/point-geometry';
import {cameraBoundsWarning, type CameraForBoxAndBearingHandlerResult, type EaseToHandlerResult, type EaseToHandlerOptions, type FlyToHandlerResult, type FlyToHandlerOptions, type ICameraHelper, type MapControlsDeltas, updateRotation, type UpdateRotationArgs, cameraForBoxAndBearing} from './camera_helper';
import {LngLat, type LngLatLike} from '../lng_lat';
import {angularCoordinatesToSurfaceVector, computeGlobePanCenter, getGlobeRadiusPixels, getZoomAdjustment, globeDistanceOfLocationsPixels, interpolateLngLatForGlobe} from './globe_utils';
import {clamp, createVec3f64, differenceOfAnglesDegrees, MAX_VALID_LATITUDE, remapSaturate, rollPitchBearingEqual, scaleZoom, warnOnce, zoomScale} from '../../util/util';
import {type mat4, vec3} from 'gl-matrix';
import {normalizeCenter} from '../transform_helper';
import {interpolates} from '@maplibre/maplibre-gl-style-spec';

import type {IReadonlyTransform, ITransform} from '../transform_interface';
import type {CameraForBoundsOptions} from '../../ui/camera';
import type {LngLatBounds} from '../lng_lat_bounds';
import type {PaddingOptions} from '../edge_insets';

/**
 * @internal
 */
export class VerticalPerspectiveCameraHelper implements ICameraHelper {

    get useGlobeControls(): boolean { return true; }

    handlePanInertia(pan: Point, transform: IReadonlyTransform): {
        easingCenter: LngLat;
        easingOffset: Point;
    } {
        const panCenter = computeGlobePanCenter(pan, transform);
        if (Math.abs(panCenter.lng - transform.center.lng) > 180) {
            // If easeTo target would be over 180° distant, the animation would move
            // in the opposite direction that what the user intended.
            // Thus we clamp the movement to 179.5°.
            panCenter.lng = transform.center.lng + 179.5 * Math.sign(panCenter.lng - transform.center.lng);
        }
        return {
            easingCenter: panCenter,
            easingOffset: new Point(0, 0),
        };
    }

    handleMapControlsRollPitchBearingZoom(deltas: MapControlsDeltas, tr: ITransform): void {
        const zoomPixel = deltas.around;
        const zoomLoc = tr.screenPointToLocation(zoomPixel);

        if (deltas.bearingDelta) tr.setBearing(tr.bearing + deltas.bearingDelta);
        if (deltas.pitchDelta) tr.setPitch(tr.pitch + deltas.pitchDelta);
        if (deltas.rollDelta) tr.setRoll(tr.roll + deltas.rollDelta);
        const oldZoomPreZoomDelta = tr.zoom;
        if (deltas.zoomDelta) tr.setZoom(tr.zoom + deltas.zoomDelta);
        const actualZoomDelta = tr.zoom - oldZoomPreZoomDelta;

        if (actualZoomDelta === 0) {
            return;
        }

        // Problem: `setLocationAtPoint` for globe works when it is called a single time, but is a little glitchy in practice when used repeatedly for zooming.
        // - `setLocationAtPoint` repeatedly called at a location behind a pole will eventually glitch out
        // - `setLocationAtPoint` at location the longitude of which is more than 90° different from current center will eventually glitch out
        // But otherwise works fine at higher zooms, or when the target is somewhat near the current map center.
        // Solution: use a heuristic zooming in the problematic cases and interpolate to `setLocationAtPoint` when possible.

        // Magic numbers that control:
        // - when zoom movement slowing starts for cursor not on globe (avoid unnatural map movements)
        // - when we interpolate from exact zooming to heuristic zooming based on longitude difference of target location to current center
        // - when we interpolate from exact zooming to heuristic zooming based on globe being too small on screen
        // - when zoom movement slowing starts for globe being too small on viewport (avoids unnatural/unwanted map movements when map is zoomed out a lot)
        const raySurfaceDistanceForSlowingStart = 0.3; // Zoom movement slowing will start when the planet surface to ray distance is greater than this number (globe radius is 1, so 0.3 is ~2000km form the surface).
        const slowingMultiplier = 0.5; // The lower this value, the slower will the "zoom movement slowing" occur.
        const interpolateToHeuristicStartLng = 45; // When zoom location longitude is this many degrees away from map center, we start interpolating from exact zooming to heuristic zooming.
        const interpolateToHeuristicEndLng = 85; // Longitude difference at which interpolation to heuristic zooming ends.
        const interpolateToHeuristicExponent = 0.25; // Makes interpolation smoother.
        const interpolateToHeuristicStartRadius = 0.75; // When globe is this many times larger than the smaller viewport dimension, we start interpolating from exact zooming to heuristic zooming.
        const interpolateToHeuristicEndRadius = 0.35; // Globe size at which interpolation to heuristic zooming ends.
        const slowingRadiusStart = 0.9; // If globe is this many times larger than the smaller viewport dimension, start inhibiting map movement while zooming
        const slowingRadiusStop = 0.5;
        const slowingRadiusSlowFactor = 0.25; // How much is movement slowed when globe is too small

        const dLngRaw = differenceOfAnglesDegrees(tr.center.lng, zoomLoc.lng);
        const dLng = dLngRaw / (Math.abs(dLngRaw / 180) + 1.0); // This gradually reduces the amount of longitude change if the zoom location is very far, eg. on the other side of the pole (possible when looking at a pole).
        const dLat = differenceOfAnglesDegrees(tr.center.lat, zoomLoc.lat);

        // Slow zoom movement down if the mouse ray is far from the planet.
        const rayDirection = tr.getRayDirectionFromPixel(zoomPixel);
        const rayOrigin = tr.cameraPosition;
        const distanceToClosestPoint = vec3.dot(rayOrigin, rayDirection) * -1; // Globe center relative to ray origin is equal to -rayOrigin and rayDirection is normalized, thus we want to compute dot(-rayOrigin, rayDirection).
        const closestPoint = createVec3f64();
        vec3.add(closestPoint, rayOrigin, [
            rayDirection[0] * distanceToClosestPoint,
            rayDirection[1] * distanceToClosestPoint,
            rayDirection[2] * distanceToClosestPoint
        ]);
        const distanceFromSurface = vec3.length(closestPoint) - 1;
        const distanceFactor = Math.exp(-Math.max(distanceFromSurface - raySurfaceDistanceForSlowingStart, 0) * slowingMultiplier);

        // Slow zoom movement down if the globe is too small on viewport
        const radius = getGlobeRadiusPixels(tr.worldSize, tr.center.lat) / Math.min(tr.width, tr.height); // Radius relative to larger viewport dimension
        const radiusFactor = remapSaturate(radius, slowingRadiusStart, slowingRadiusStop, 1.0, slowingRadiusSlowFactor);

        // Compute how much to move towards the zoom location
        const factor = (1.0 - zoomScale(-actualZoomDelta)) * Math.min(distanceFactor, radiusFactor);

        const oldCenterLat = tr.center.lat;
        const oldZoom = tr.zoom;
        const heuristicCenter = new LngLat(
            tr.center.lng + dLng * factor,
            clamp(tr.center.lat + dLat * factor, -MAX_VALID_LATITUDE, MAX_VALID_LATITUDE)
        );

        // Now compute the map center exact zoom
        tr.setLocationAtPoint(zoomLoc, zoomPixel);
        const exactCenter = tr.center;

        // Interpolate between exact zooming and heuristic zooming depending on the longitude difference between current center and zoom location.
        const interpolationFactorLongitude = remapSaturate(Math.abs(dLngRaw), interpolateToHeuristicStartLng, interpolateToHeuristicEndLng, 0, 1);
        const interpolationFactorRadius = remapSaturate(radius, interpolateToHeuristicStartRadius, interpolateToHeuristicEndRadius, 0, 1);
        const heuristicFactor = Math.pow(Math.max(interpolationFactorLongitude, interpolationFactorRadius), interpolateToHeuristicExponent);

        const lngExactToHeuristic = differenceOfAnglesDegrees(exactCenter.lng, heuristicCenter.lng);
        const latExactToHeuristic = differenceOfAnglesDegrees(exactCenter.lat, heuristicCenter.lat);

        tr.setCenter(new LngLat(
            exactCenter.lng + lngExactToHeuristic * heuristicFactor,
            exactCenter.lat + latExactToHeuristic * heuristicFactor
        ).wrap());
        tr.setZoom(oldZoom + getZoomAdjustment(oldCenterLat, tr.center.lat));
    }

    handleMapControlsPan(deltas: MapControlsDeltas, tr: ITransform, _preZoomAroundLoc: LngLat): void {
        if (!deltas.panDelta) {
            return;
        }

        tr.setLocationAtPoint(_preZoomAroundLoc, deltas.around)
    }

    cameraForBoxAndBearing(options: CameraForBoundsOptions, padding: PaddingOptions, bounds: LngLatBounds, bearing: number, tr: ITransform): CameraForBoxAndBearingHandlerResult {
        const result = cameraForBoxAndBearing(options, padding, bounds, bearing, tr);
        // If globe is enabled, we use the parameters computed for mercator, and just update the zoom to fit the bounds.

        // Get clip space bounds including padding
        const xLeft = (padding.left) / tr.width * 2.0 - 1.0;
        const xRight = (tr.width - padding.right) / tr.width * 2.0 - 1.0;
        const yTop = (padding.top) / tr.height * -2.0 + 1.0;
        const yBottom = (tr.height - padding.bottom) / tr.height * -2.0 + 1.0;

        // Get camera bounds
        const flipEastWest = differenceOfAnglesDegrees(bounds.getWest(), bounds.getEast()) < 0;
        const lngWest = flipEastWest ? bounds.getEast() : bounds.getWest();
        const lngEast = flipEastWest ? bounds.getWest() : bounds.getEast();

        const latNorth = Math.max(bounds.getNorth(), bounds.getSouth()); // "getNorth" doesn't always return north...
        const latSouth = Math.min(bounds.getNorth(), bounds.getSouth());

        // Additional vectors will be tested for the rectangle midpoints
        const lngMid = lngWest + differenceOfAnglesDegrees(lngWest, lngEast) * 0.5;
        const latMid = latNorth + differenceOfAnglesDegrees(latNorth, latSouth) * 0.5;

        // Obtain a globe projection matrix that does not include pitch (unsupported)
        const clonedTr = tr.clone();
        clonedTr.setCenter(result.center);
        clonedTr.setBearing(result.bearing);
        clonedTr.setPitch(0);
        clonedTr.setRoll(0);
        clonedTr.setZoom(result.zoom);
        const matrix = clonedTr.modelViewProjectionMatrix;

        // Vectors to test - the bounds' corners and edge midpoints
        const testVectors = [
            angularCoordinatesToSurfaceVector(bounds.getNorthWest()),
            angularCoordinatesToSurfaceVector(bounds.getNorthEast()),
            angularCoordinatesToSurfaceVector(bounds.getSouthWest()),
            angularCoordinatesToSurfaceVector(bounds.getSouthEast()),
            // Also test edge midpoints
            angularCoordinatesToSurfaceVector(new LngLat(lngEast, latMid)),
            angularCoordinatesToSurfaceVector(new LngLat(lngWest, latMid)),
            angularCoordinatesToSurfaceVector(new LngLat(lngMid, latNorth)),
            angularCoordinatesToSurfaceVector(new LngLat(lngMid, latSouth))
        ];
        const vecToCenter = angularCoordinatesToSurfaceVector(result.center);

        // Test each vector, measure how much to scale down the globe to satisfy all tested points that they are inside clip space.
        let smallestNeededScale = Number.POSITIVE_INFINITY;
        for (const vec of testVectors) {
            if (xLeft < 0)
                smallestNeededScale = VerticalPerspectiveCameraHelper.getLesserNonNegativeNonNull(smallestNeededScale, VerticalPerspectiveCameraHelper.solveVectorScale(vec, vecToCenter, matrix, 'x', xLeft));
            if (xRight > 0)
                smallestNeededScale = VerticalPerspectiveCameraHelper.getLesserNonNegativeNonNull(smallestNeededScale, VerticalPerspectiveCameraHelper.solveVectorScale(vec, vecToCenter, matrix, 'x', xRight));
            if (yTop > 0)
                smallestNeededScale = VerticalPerspectiveCameraHelper.getLesserNonNegativeNonNull(smallestNeededScale, VerticalPerspectiveCameraHelper.solveVectorScale(vec, vecToCenter, matrix, 'y', yTop));
            if (yBottom < 0)
                smallestNeededScale = VerticalPerspectiveCameraHelper.getLesserNonNegativeNonNull(smallestNeededScale, VerticalPerspectiveCameraHelper.solveVectorScale(vec, vecToCenter, matrix, 'y', yBottom));
        }

        if (!Number.isFinite(smallestNeededScale) || smallestNeededScale === 0) {
            cameraBoundsWarning();
            return undefined;
        }

        // Compute target zoom from the obtained scale.
        result.zoom = clonedTr.zoom + scaleZoom(smallestNeededScale);
        return result;
    }

    /**
     * Handles the zoom and center change during camera jumpTo.
     */
    handleJumpToCenterZoom(tr: ITransform, options: { zoom?: number; center?: LngLatLike }): void {
        // Special zoom & center handling for globe:
        // Globe constrained center isn't dependent on zoom level
        const startingLat = tr.center.lat;
        const constrainedCenter = tr.getConstrained(options.center ? LngLat.convert(options.center) : tr.center, tr.zoom).center;
        tr.setCenter(constrainedCenter.wrap());

        // Make sure to compute correct target zoom level if no zoom is specified
        const targetZoom = (typeof options.zoom !== 'undefined') ? +options.zoom : (tr.zoom + getZoomAdjustment(startingLat, constrainedCenter.lat));
        if (tr.zoom !== targetZoom) {
            tr.setZoom(targetZoom);
        }
    }

    handleEaseTo(tr: ITransform, options: EaseToHandlerOptions): EaseToHandlerResult {
        const startZoom = tr.zoom;
        const startCenter = tr.center;
        const startPadding = tr.padding;
        const startEulerAngles = {roll: tr.roll, pitch: tr.pitch, bearing: tr.bearing};
        const endRoll = options.roll === undefined ? tr.roll : options.roll;
        const endPitch = options.pitch === undefined ? tr.pitch : options.pitch;
        const endBearing = options.bearing === undefined ? tr.bearing : options.bearing;
        const endEulerAngles = {roll: endRoll, pitch: endPitch, bearing: endBearing};

        const optionsZoom = typeof options.zoom !== 'undefined';

        const doPadding = !tr.isPaddingEqual(options.padding);

        let isZooming = false;

        // Globe needs special handling for how zoom should be animated.
        // 1) if zoom is set, ease to the given mercator zoom
        // 2) if neither is set, assume constant apparent zoom (constant planet size) is to be kept
        const preConstrainCenter = options.center ?
            LngLat.convert(options.center) :
            startCenter;
        const constrainedCenter = tr.getConstrained(
            preConstrainCenter,
            startZoom // zoom can be whatever at this stage, it should not affect anything if globe is enabled
        ).center;
        normalizeCenter(tr, constrainedCenter);

        const clonedTr = tr.clone();
        clonedTr.setCenter(constrainedCenter);

        clonedTr.setZoom(optionsZoom ?
            +options.zoom :
            startZoom + getZoomAdjustment(startCenter.lat, preConstrainCenter.lat));
        clonedTr.setBearing(options.bearing);
        const clampedPoint = new Point(
            clamp(tr.centerPoint.x + options.offsetAsPoint.x, 0, tr.width),
            clamp(tr.centerPoint.y + options.offsetAsPoint.y, 0, tr.height)
        );
        clonedTr.setLocationAtPoint(constrainedCenter, clampedPoint);
        // Find final animation targets
        const endCenterWithShift = (options.offset && options.offsetAsPoint.mag()) > 0 ? clonedTr.center : constrainedCenter;
        const endZoomWithShift = optionsZoom ?
            +options.zoom :
            startZoom + getZoomAdjustment(startCenter.lat, endCenterWithShift.lat);

        // Planet radius for a given zoom level differs according to latitude
        // Convert zooms to what they would be at equator for the given planet radius
        const normalizedStartZoom = startZoom + getZoomAdjustment(startCenter.lat, 0);
        const normalizedEndZoom = endZoomWithShift + getZoomAdjustment(endCenterWithShift.lat, 0);
        const deltaLng = differenceOfAnglesDegrees(startCenter.lng, endCenterWithShift.lng);
        const deltaLat = differenceOfAnglesDegrees(startCenter.lat, endCenterWithShift.lat);

        const finalScale = zoomScale(normalizedEndZoom - normalizedStartZoom);
        isZooming = (endZoomWithShift !== startZoom);

        const easeFunc = (k: number) => {
            if (!rollPitchBearingEqual(startEulerAngles, endEulerAngles)) {
                updateRotation({
                    startEulerAngles,
                    endEulerAngles,
                    tr,
                    k,
                    useSlerp: startEulerAngles.roll != endEulerAngles.roll} as UpdateRotationArgs);
            }

            if (doPadding) {
                tr.interpolatePadding(startPadding, options.padding,k);
            }

            if (options.around) {
                warnOnce('Easing around a point is not supported under globe projection.');
                tr.setLocationAtPoint(options.around, options.aroundPoint);
            } else {
                const base = normalizedEndZoom > normalizedStartZoom ?
                    Math.min(2, finalScale) :
                    Math.max(0.5, finalScale);
                const speedup = Math.pow(base, 1 - k);
                const factor = k * speedup;

                // Spherical lerp might be used here instead, but that was tested and it leads to very weird paths when the interpolated arc gets near the poles.
                // Instead we interpolate LngLat almost directly, but taking into account that
                // one degree of longitude gets progressively smaller relative to latitude towards the poles.
                const newCenter = interpolateLngLatForGlobe(startCenter, deltaLng, deltaLat, factor);
                tr.setCenter(newCenter.wrap());
            }

            if (isZooming) {
                const normalizedInterpolatedZoom = interpolates.number(normalizedStartZoom, normalizedEndZoom, k);
                const interpolatedZoom = normalizedInterpolatedZoom + getZoomAdjustment(0, tr.center.lat);
                tr.setZoom(interpolatedZoom);
            }
        };

        return {
            easeFunc,
            isZooming,
            elevationCenter: endCenterWithShift,
        };
    }

    handleFlyTo(tr: ITransform, options: FlyToHandlerOptions): FlyToHandlerResult {
        const optionsZoom = typeof options.zoom !== 'undefined';

        const startCenter = tr.center;
        const startZoom = tr.zoom;
        const doPadding = !tr.isPaddingEqual(options.padding);

        // Obtain target center and zoom
        const constrainedCenter = tr.getConstrained(
            LngLat.convert(options.center || options.locationAtOffset),
            startZoom
        ).center;
        const targetZoom = optionsZoom ? +options.zoom : tr.zoom + getZoomAdjustment(tr.center.lat, constrainedCenter.lat);

        // Compute target center that respects offset by creating a temporary transform and calling its `setLocationAtPoint`.
        const clonedTr = tr.clone();
        clonedTr.setCenter(constrainedCenter);
        if (doPadding) {
            clonedTr.setPadding(options.padding as PaddingOptions);
        }
        clonedTr.setZoom(targetZoom);
        clonedTr.setBearing(options.bearing);
        const clampedPoint = new Point(
            clamp(tr.centerPoint.x + options.offsetAsPoint.x, 0, tr.width),
            clamp(tr.centerPoint.y + options.offsetAsPoint.y, 0, tr.height)
        );
        clonedTr.setLocationAtPoint(constrainedCenter, clampedPoint);
        const targetCenter = clonedTr.center;

        normalizeCenter(tr, targetCenter);

        const pixelPathLength = globeDistanceOfLocationsPixels(tr, startCenter, targetCenter);

        const normalizedStartZoom = startZoom + getZoomAdjustment(startCenter.lat, 0);
        const normalizedTargetZoom = targetZoom + getZoomAdjustment(targetCenter.lat, 0);
        const scaleOfZoom = zoomScale(normalizedTargetZoom - normalizedStartZoom);

        const optionsMinZoom = typeof options.minZoom === 'number';

        let scaleOfMinZoom: number;

        if (optionsMinZoom) {
            const normalizedOptionsMinZoom = +options.minZoom + getZoomAdjustment(targetCenter.lat, 0);
            const normalizedMinZoomPreConstrain = Math.min(normalizedOptionsMinZoom, normalizedStartZoom, normalizedTargetZoom);
            const minZoomPreConstrain = normalizedMinZoomPreConstrain + getZoomAdjustment(0, targetCenter.lat);
            const minZoom = tr.getConstrained(targetCenter, minZoomPreConstrain).zoom;
            const normalizedMinZoom = minZoom + getZoomAdjustment(targetCenter.lat, 0);
            scaleOfMinZoom = zoomScale(normalizedMinZoom - normalizedStartZoom);
        }

        const deltaLng = differenceOfAnglesDegrees(startCenter.lng, targetCenter.lng);
        const deltaLat = differenceOfAnglesDegrees(startCenter.lat, targetCenter.lat);

        const easeFunc = (k: number, scale: number, centerFactor: number, _pointAtOffset: Point) => {
            const interpolatedCenter = interpolateLngLatForGlobe(startCenter, deltaLng, deltaLat, centerFactor);

            const newCenter = k === 1 ? targetCenter : interpolatedCenter;
            tr.setCenter(newCenter.wrap());

            const interpolatedZoom = normalizedStartZoom + scaleZoom(scale);
            tr.setZoom(k === 1 ? targetZoom : (interpolatedZoom + getZoomAdjustment(0, newCenter.lat)));
        };

        return {
            easeFunc,
            scaleOfZoom,
            targetCenter,
            scaleOfMinZoom,
            pixelPathLength,
        };
    }

    /**
     * Computes how much to scale the globe in order for a given point on its surface (a location) to project to a given clip space coordinate in either the X or the Y axis.
     * @param vector - Position of the queried location on the surface of the unit sphere globe.
     * @param toCenter - Position of current transform center on the surface of the unit sphere globe.
     * This is needed because zooming the globe not only changes its scale,
     * but also moves the camera closer or further away along this vector (pitch is disregarded).
     * @param projection - The globe projection matrix.
     * @param targetDimension - The dimension in which the scaled vector must match the target value in clip space.
     * @param targetValue - The target clip space value in the specified dimension to which the queried vector must project.
     * @returns How much to scale the globe.
     */
    private static solveVectorScale(vector: vec3, toCenter: vec3, projection: mat4, targetDimension: 'x' | 'y', targetValue: number): number | null {
        // We want to compute how much to scale the sphere in order for the input `vector` to project to `targetValue` in the given `targetDimension` (X or Y).
        const k = targetValue;
        const columnXorY = targetDimension === 'x' ?
            [projection[0], projection[4], projection[8], projection[12]] : // X
            [projection[1], projection[5], projection[9], projection[13]];  // Y
        const columnZ = [projection[3], projection[7], projection[11], projection[15]];

        const vecDotXY = vector[0] * columnXorY[0] + vector[1] * columnXorY[1] + vector[2] * columnXorY[2];
        const vecDotZ = vector[0] * columnZ[0] + vector[1] * columnZ[1] + vector[2] * columnZ[2];
        const toCenterDotXY = toCenter[0] * columnXorY[0] + toCenter[1] * columnXorY[1] + toCenter[2] * columnXorY[2];
        const toCenterDotZ = toCenter[0] * columnZ[0] + toCenter[1] * columnZ[1] + toCenter[2] * columnZ[2];

        // The following can be derived from writing down what happens to a vector scaled by a parameter ("V * t") when it is multiplied by a projection matrix, then solving for "t".
        // Or rather, we derive it for a vector "V * t + (1-t) * C". Where V is `vector` and C is `toCenter`. The extra addition is needed because zooming out also moves the camera along "C".

        const t = (toCenterDotXY + columnXorY[3] - k * toCenterDotZ - k * columnZ[3]) / (toCenterDotXY - vecDotXY - k * toCenterDotZ + k * vecDotZ);

        if (
            toCenterDotXY + k * vecDotZ === vecDotXY + k * toCenterDotZ ||
            columnZ[3] * (vecDotXY - toCenterDotXY) + columnXorY[3] * (toCenterDotZ - vecDotZ) + vecDotXY * toCenterDotZ === toCenterDotXY * vecDotZ
        ) {
            // The computed result is invalid.
            return null;
        }
        return t;
    }

    /**
     * Returns `newValue` if it is:
     *
     * - not null AND
     * - not negative AND
     * - smaller than `newValue`,
     *
     * ...otherwise returns `oldValue`.
     */
    private static getLesserNonNegativeNonNull(oldValue: number, newValue: number): number {
        if (newValue !== null && newValue >= 0 && newValue < oldValue) {
            return newValue;
        } else {
            return oldValue;
        }
    }
}
