import {LngLat, type LngLatLike} from '../lng_lat';
import {MercatorCoordinate, mercatorXfromLng, mercatorYfromLat, mercatorZfromAltitude} from '../mercator_coordinate';
import Point from '@mapbox/point-geometry';
import {wrap, clamp, createIdentityMat4f64, createMat4f64, degreesToRadians, createIdentityMat4f32, zoomScale, scaleZoom} from '../../util/util';
import {type mat2, mat4, vec3, vec4} from 'gl-matrix';
import {UnwrappedTileID, OverscaledTileID, type CanonicalTileID, calculateTileKey} from '../../source/tile_id';
import {interpolates} from '@maplibre/maplibre-gl-style-spec';
import {type PointProjection, xyTransformMat4} from '../../symbol/projection';
import {LngLatBounds} from '../lng_lat_bounds';
import {getMercatorHorizon, projectToWorldCoordinates, unprojectFromWorldCoordinates, calculateTileMatrix, maxMercatorHorizonAngle, cameraMercatorCoordinateFromCenterAndRotation} from './mercator_utils';
import {EXTENT} from '../../data/extent';
import {TransformHelper} from '../transform_helper';
import {MercatorCoveringTilesDetailsProvider} from './mercator_covering_tiles_details_provider';
import {Frustum} from '../../util/primitives/frustum';

import type {Terrain} from '../../render/terrain';
import type {IReadonlyTransform, ITransform} from '../transform_interface';
import type {PaddingOptions} from '../edge_insets';
import type {ProjectionData, ProjectionDataParams} from './projection_data';
import type {CoveringTilesDetailsProvider} from './covering_tiles_details_provider';

export class MercatorTransform implements ITransform {
    private _helper: TransformHelper;

    //
    // Implementation of transform getters and setters
    //

    get pixelsToClipSpaceMatrix(): mat4 {
        return this._helper.pixelsToClipSpaceMatrix;
    }
    get clipSpaceToPixelsMatrix(): mat4 {
        return this._helper.clipSpaceToPixelsMatrix;
    }
    get pixelsToGLUnits(): [number, number] {
        return this._helper.pixelsToGLUnits;
    }
    get centerOffset(): Point {
        return this._helper.centerOffset;
    }
    get size(): Point {
        return this._helper.size;
    }
    get rotationMatrix(): mat2 {
        return this._helper.rotationMatrix;
    }
    get centerPoint(): Point {
        return this._helper.centerPoint;
    }
    get pixelsPerMeter(): number {
        return this._helper.pixelsPerMeter;
    }
    setMinZoom(zoom: number): void {
        this._helper.setMinZoom(zoom);
    }
    setMaxZoom(zoom: number): void {
        this._helper.setMaxZoom(zoom);
    }
    setMinPitch(pitch: number): void {
        this._helper.setMinPitch(pitch);
    }
    setMaxPitch(pitch: number): void {
        this._helper.setMaxPitch(pitch);
    }
    setRenderWorldCopies(renderWorldCopies: boolean): void {
        this._helper.setRenderWorldCopies(renderWorldCopies);
    }
    setBearing(bearing: number): void {
        this._helper.setBearing(bearing);
    }
    setPitch(pitch: number): void {
        this._helper.setPitch(pitch);
    }
    setRoll(roll: number): void {
        this._helper.setRoll(roll);
    }
    setFov(fov: number): void {
        this._helper.setFov(fov);
    }
    setZoom(zoom: number): void {
        this._helper.setZoom(zoom);
    }
    setCenter(center: LngLat): void {
        this._helper.setCenter(center);
    }
    setElevation(elevation: number): void {
        this._helper.setElevation(elevation);
    }
    setMinElevationForCurrentTile(elevation: number): void {
        this._helper.setMinElevationForCurrentTile(elevation);
    }
    setPadding(padding: PaddingOptions): void {
        this._helper.setPadding(padding);
    }
    interpolatePadding(start: PaddingOptions, target: PaddingOptions, t: number): void {
        return this._helper.interpolatePadding(start, target, t);
    }
    isPaddingEqual(padding: PaddingOptions): boolean {
        return this._helper.isPaddingEqual(padding);
    }
    resize(width: number, height: number, constrain: boolean = true): void {
        this._helper.resize(width, height, constrain);
    }
    getMaxBounds(): LngLatBounds {
        return this._helper.getMaxBounds();
    }
    setMaxBounds(bounds?: LngLatBounds): void {
        this._helper.setMaxBounds(bounds);
    }
    overrideNearFarZ(nearZ: number, farZ: number): void {
        this._helper.overrideNearFarZ(nearZ, farZ);
    }
    clearNearFarZOverride(): void {
        this._helper.clearNearFarZOverride();
    }
    getCameraQueryGeometry(queryGeometry: Point[]): Point[] {
        return this._helper.getCameraQueryGeometry(this.getCameraPoint(), queryGeometry);
    }

    get tileSize(): number {
        return this._helper.tileSize;
    }
    get tileZoom(): number {
        return this._helper.tileZoom;
    }
    get scale(): number {
        return this._helper.scale;
    }
    get worldSize(): number {
        return this._helper.worldSize;
    }
    get width(): number {
        return this._helper.width;
    }
    get height(): number {
        return this._helper.height;
    }
    get lngRange(): [number, number] {
        return this._helper.lngRange;
    }
    get latRange(): [number, number] {
        return this._helper.latRange;
    }
    get minZoom(): number {
        return this._helper.minZoom;
    }
    get maxZoom(): number {
        return this._helper.maxZoom;
    }
    get zoom(): number {
        return this._helper.zoom;
    }
    get center(): LngLat {
        return this._helper.center;
    }
    get minPitch(): number {
        return this._helper.minPitch;
    }
    get maxPitch(): number {
        return this._helper.maxPitch;
    }
    get pitch(): number {
        return this._helper.pitch;
    }
    get pitchInRadians(): number {
        return this._helper.pitchInRadians;
    }
    get roll(): number {
        return this._helper.roll;
    }
    get rollInRadians(): number {
        return this._helper.rollInRadians;
    }
    get bearing(): number {
        return this._helper.bearing;
    }
    get bearingInRadians(): number {
        return this._helper.bearingInRadians;
    }
    get fov(): number {
        return this._helper.fov;
    }
    get fovInRadians(): number {
        return this._helper.fovInRadians;
    }
    get elevation(): number {
        return this._helper.elevation;
    }
    get minElevationForCurrentTile(): number {
        return this._helper.minElevationForCurrentTile;
    }
    get padding(): PaddingOptions {
        return this._helper.padding;
    }
    get unmodified(): boolean {
        return this._helper.unmodified;
    }
    get renderWorldCopies(): boolean {
        return this._helper.renderWorldCopies;
    }
    get cameraToCenterDistance(): number { 
        return this._helper.cameraToCenterDistance;
    }
    public get nearZ(): number { 
        return this._helper.nearZ; 
    }
    public get farZ(): number { 
        return this._helper.farZ; 
    }
    public get autoCalculateNearFarZ(): boolean { 
        return this._helper.autoCalculateNearFarZ; 
    }
    setTransitionState(_value: number, _error: number): void {
        // Do nothing
    }
    //
    // Implementation of mercator transform
    //

    private _cameraPosition: vec3;

    private _mercatorMatrix: mat4;
    private _projectionMatrix: mat4;
    private _viewProjMatrix: mat4;
    private _invViewProjMatrix: mat4;
    private _invProjMatrix: mat4;
    private _alignedProjMatrix: mat4;
    private _pixelMatrix: mat4;
    private _pixelMatrix3D: mat4;
    private _pixelMatrixInverse: mat4;
    private _fogMatrix: mat4;

    private _posMatrixCache: Map<string, {f64: mat4; f32: mat4}> = new Map();
    private _alignedPosMatrixCache: Map<string, {f64: mat4; f32: mat4}> = new Map();
    private _fogMatrixCacheF32: Map<string, mat4> = new Map();

    private _coveringTilesDetailsProvider;

    constructor(minZoom?: number, maxZoom?: number, minPitch?: number, maxPitch?: number, renderWorldCopies?: boolean) {
        this._helper = new TransformHelper({
            calcMatrices: () => { this._calcMatrices(); },
            getConstrained: (center, zoom) => { return this.getConstrained(center, zoom); }
        }, minZoom, maxZoom, minPitch, maxPitch, renderWorldCopies);
        this._coveringTilesDetailsProvider = new MercatorCoveringTilesDetailsProvider();
    }

    public clone(): ITransform {
        const clone = new MercatorTransform();
        clone.apply(this);
        return clone;
    }

    public apply(that: IReadonlyTransform, constrain?: boolean, forceOverrideZ?: boolean): void {
        this._helper.apply(that, constrain, forceOverrideZ);
    }

    public get cameraPosition(): vec3 { return this._cameraPosition; }
    public get projectionMatrix(): mat4 { return this._projectionMatrix; }
    public get modelViewProjectionMatrix(): mat4 { return this._viewProjMatrix; }
    public get inverseProjectionMatrix(): mat4 { return this._invProjMatrix; }
    public get mercatorMatrix(): mat4 { return this._mercatorMatrix; } // Not part of ITransform interface

    getVisibleUnwrappedCoordinates(tileID: CanonicalTileID): Array<UnwrappedTileID> {
        const result = [new UnwrappedTileID(0, tileID)];
        if (this._helper._renderWorldCopies) {
            const utl = this.screenPointToMercatorCoordinate(new Point(0, 0));
            const utr = this.screenPointToMercatorCoordinate(new Point(this._helper._width, 0));
            const ubl = this.screenPointToMercatorCoordinate(new Point(this._helper._width, this._helper._height));
            const ubr = this.screenPointToMercatorCoordinate(new Point(0, this._helper._height));
            const w0 = Math.floor(Math.min(utl.x, utr.x, ubl.x, ubr.x));
            const w1 = Math.floor(Math.max(utl.x, utr.x, ubl.x, ubr.x));

            // Add an extra copy of the world on each side to properly render ImageSources and CanvasSources.
            // Both sources draw outside the tile boundaries of the tile that "contains them" so we need
            // to add extra copies on both sides in case offscreen tiles need to draw into on-screen ones.
            const extraWorldCopy = 1;

            for (let w = w0 - extraWorldCopy; w <= w1 + extraWorldCopy; w++) {
                if (w === 0) continue;
                result.push(new UnwrappedTileID(w, tileID));
            }
        }
        return result;
    }

    getCameraFrustum(): Frustum {
        return Frustum.fromInvProjectionMatrix(this._invViewProjMatrix, this.worldSize);
    }
    getClippingPlane(): vec4 | null {
        return null;
    }
    getCoveringTilesDetailsProvider(): CoveringTilesDetailsProvider {
        return this._coveringTilesDetailsProvider;
    }

    recalculateZoomAndCenter(terrain?: Terrain): void {
        // find position the camera is looking on
        const center = this.screenPointToLocation(this.centerPoint, terrain);
        const elevation = terrain ? terrain.getElevationForLngLatZoom(center, this._helper._tileZoom) : 0;
        this._helper.recalculateZoomAndCenter(elevation);
    }

    setLocationAtPoint(lnglat: LngLat, point: Point) {
        const z = mercatorZfromAltitude(this.elevation, this.center.lat);
        const a = this.screenPointToMercatorCoordinateAtZ(point, z);
        const b = this.screenPointToMercatorCoordinateAtZ(this.centerPoint, z);
        const loc = MercatorCoordinate.fromLngLat(lnglat);
        const newCenter = new MercatorCoordinate(
            loc.x - (a.x - b.x),
            loc.y - (a.y - b.y));
        this.setCenter(newCenter?.toLngLat());
        if (this._helper._renderWorldCopies) {
            this.setCenter(this.center.wrap());
        }
    }

    locationToScreenPoint(lnglat: LngLat, terrain?: Terrain): Point {
        return terrain ?
            this.coordinatePoint(MercatorCoordinate.fromLngLat(lnglat), terrain.getElevationForLngLatZoom(lnglat, this._helper._tileZoom), this._pixelMatrix3D) :
            this.coordinatePoint(MercatorCoordinate.fromLngLat(lnglat));
    }

    screenPointToLocation(p: Point, terrain?: Terrain): LngLat {
        return this.screenPointToMercatorCoordinate(p, terrain)?.toLngLat();
    }

    screenPointToMercatorCoordinate(p: Point, terrain?: Terrain): MercatorCoordinate {
        // get point-coordinate from terrain coordinates framebuffer
        if (terrain) {
            const coordinate = terrain.pointCoordinate(p);
            if (coordinate != null) {
                return coordinate;
            }
        }
        return this.screenPointToMercatorCoordinateAtZ(p);
    }

    screenPointToMercatorCoordinateAtZ(p: Point, mercatorZ?: number): MercatorCoordinate {

        // calculate point-coordinate on flat earth
        const targetZ = mercatorZ ? mercatorZ : 0;
        // since we don't know the correct projected z value for the point,
        // unproject two points to get a line and then find the point on that
        // line with z=0

        const coord0 = [p.x, p.y, 0, 1] as vec4;
        const coord1 = [p.x, p.y, 1, 1] as vec4;

        vec4.transformMat4(coord0, coord0, this._pixelMatrixInverse);
        vec4.transformMat4(coord1, coord1, this._pixelMatrixInverse);

        const w0 = coord0[3];
        const w1 = coord1[3];
        const x0 = coord0[0] / w0;
        const x1 = coord1[0] / w1;
        const y0 = coord0[1] / w0;
        const y1 = coord1[1] / w1;
        const z0 = coord0[2] / w0;
        const z1 = coord1[2] / w1;

        const t = z0 === z1 ? 0 : (targetZ - z0) / (z1 - z0);

        return new MercatorCoordinate(
            interpolates.number(x0, x1, t) / this.worldSize,
            interpolates.number(y0, y1, t) / this.worldSize,
            targetZ);
    }

    /**
     * Given a coordinate, return the screen point that corresponds to it
     * @param coord - the coordinates
     * @param elevation - the elevation
     * @param pixelMatrix - the pixel matrix
     * @returns screen point
     */
    coordinatePoint(coord: MercatorCoordinate, elevation: number = 0, pixelMatrix: mat4 = this._pixelMatrix): Point {
        const p = [coord.x * this.worldSize, coord.y * this.worldSize, elevation, 1] as vec4;
        vec4.transformMat4(p, p, pixelMatrix);
        return new Point(p[0] / p[3], p[1] / p[3]);
    }

    getBounds(): LngLatBounds {
        const top = Math.max(0, this._helper._height / 2 - getMercatorHorizon(this));
        return new LngLatBounds()
            .extend(this.screenPointToLocation(new Point(0, top)))
            .extend(this.screenPointToLocation(new Point(this._helper._width, top)))
            .extend(this.screenPointToLocation(new Point(this._helper._width, this._helper._height)))
            .extend(this.screenPointToLocation(new Point(0, this._helper._height)));
    }

    isPointOnMapSurface(p: Point, terrain?: Terrain): boolean {
        if (terrain) {
            const coordinate = terrain.pointCoordinate(p);
            return coordinate != null;
        }
        return (p.y > this.height / 2 - getMercatorHorizon(this));
    }

    /**
     * Calculate the posMatrix that, given a tile coordinate, would be used to display the tile on a map.
     * This function is specific to the mercator projection.
     * @param tileID - the tile ID
     * @param aligned - whether to use a pixel-aligned matrix variant, intended for rendering raster tiles
     * @param useFloat32 - when true, returns a float32 matrix instead of float64. Use float32 for matrices that are passed to shaders, use float64 for everything else.
     */
    calculatePosMatrix(tileID: UnwrappedTileID | OverscaledTileID, aligned: boolean = false, useFloat32?: boolean): mat4 {
        const posMatrixKey = tileID.key ?? calculateTileKey(tileID.wrap, tileID.canonical.z, tileID.canonical.z, tileID.canonical.x, tileID.canonical.y);
        const cache = aligned ? this._alignedPosMatrixCache : this._posMatrixCache;
        if (cache.has(posMatrixKey)) {
            const matrices = cache.get(posMatrixKey);
            return useFloat32 ? matrices.f32 : matrices.f64;
        }

        const tileMatrix = calculateTileMatrix(tileID, this.worldSize);
        mat4.multiply(tileMatrix, aligned ? this._alignedProjMatrix : this._viewProjMatrix, tileMatrix);
        const matrices = {
            f64: tileMatrix,
            f32: new Float32Array(tileMatrix), // Must have a 32 bit float version for WebGL, otherwise WebGL calls in Chrome get very slow.
        };
        cache.set(posMatrixKey, matrices);
        // Make sure to return the correct precision
        return useFloat32 ? matrices.f32 : matrices.f64;
    }

    calculateFogMatrix(unwrappedTileID: UnwrappedTileID): mat4 {
        const posMatrixKey = unwrappedTileID.key;
        const cache = this._fogMatrixCacheF32;
        if (cache.has(posMatrixKey)) {
            return cache.get(posMatrixKey);
        }

        const fogMatrix = calculateTileMatrix(unwrappedTileID, this.worldSize);
        mat4.multiply(fogMatrix, this._fogMatrix, fogMatrix);

        cache.set(posMatrixKey, new Float32Array(fogMatrix)); // Must be 32 bit floats, otherwise WebGL calls in Chrome get very slow.
        return cache.get(posMatrixKey);
    }

    /**
     * This mercator implementation returns center lngLat and zoom to ensure that:
     *
     * 1) everything beyond the bounds is excluded
     * 2) a given lngLat is as near the center as possible
     *
     * Bounds are those set by maxBounds or North & South "Poles" and, if only 1 globe is displayed, antimeridian.
     */
    getConstrained(lngLat: LngLat, zoom: number): {center: LngLat; zoom: number} {
        zoom = clamp(+zoom, this.minZoom, this.maxZoom);
        const result = {
            center: new LngLat(lngLat.lng, lngLat.lat),
            zoom
        };

        let lngRange = this._helper._lngRange;

        if (!this._helper._renderWorldCopies && lngRange === null) {
            const almost180 = 180 - 1e-10;
            lngRange = [-almost180, almost180];
        }

        const worldSize = this.tileSize * zoomScale(result.zoom); // A world size for the requested zoom level, not the current world size
        let minY = 0;
        let maxY = worldSize;
        let minX = 0;
        let maxX = worldSize;
        let scaleY = 0;
        let scaleX = 0;
        const {x: screenWidth, y: screenHeight} = this.size;

        if (this._helper._latRange) {
            const latRange = this._helper._latRange;
            minY = mercatorYfromLat(latRange[1]) * worldSize;
            maxY = mercatorYfromLat(latRange[0]) * worldSize;
            const shouldZoomIn = maxY - minY < screenHeight;
            if (shouldZoomIn) scaleY = screenHeight / (maxY - minY);
        }

        if (lngRange) {
            minX = wrap(
                mercatorXfromLng(lngRange[0]) * worldSize,
                0,
                worldSize
            );
            maxX = wrap(
                mercatorXfromLng(lngRange[1]) * worldSize,
                0,
                worldSize
            );

            if (maxX < minX) maxX += worldSize;

            const shouldZoomIn = maxX - minX < screenWidth;
            if (shouldZoomIn) scaleX = screenWidth / (maxX - minX);
        }

        const {x: originalX, y: originalY} = projectToWorldCoordinates(worldSize, lngLat);
        let modifiedX, modifiedY;

        const scale = Math.max(scaleX || 0, scaleY || 0);

        if (scale) {
            // zoom in to exclude all beyond the given lng/lat ranges
            const newPoint = new Point(
                scaleX ? (maxX + minX) / 2 : originalX,
                scaleY ? (maxY + minY) / 2 : originalY);
            result.center = unprojectFromWorldCoordinates(worldSize, newPoint).wrap();
            result.zoom += scaleZoom(scale);
            return result;
        }

        if (this._helper._latRange) {
            const h2 = screenHeight / 2;
            if (originalY - h2 < minY) modifiedY = minY + h2;
            if (originalY + h2 > maxY) modifiedY = maxY - h2;
        }

        if (lngRange) {
            const centerX = (minX + maxX) / 2;
            let wrappedX = originalX;
            if (this._helper._renderWorldCopies) {
                wrappedX = wrap(originalX, centerX - worldSize / 2, centerX + worldSize / 2);
            }
            const w2 = screenWidth / 2;

            if (wrappedX - w2 < minX) modifiedX = minX + w2;
            if (wrappedX + w2 > maxX) modifiedX = maxX - w2;
        }

        // pan the map if the screen goes off the range
        if (modifiedX !== undefined || modifiedY !== undefined) {
            const newPoint = new Point(modifiedX ?? originalX, modifiedY ?? originalY);
            result.center = unprojectFromWorldCoordinates(worldSize, newPoint).wrap();
        }

        return result;
    }

    calculateCenterFromCameraLngLatAlt(lnglat: LngLatLike, alt: number, bearing?: number, pitch?: number): {center: LngLat; elevation: number; zoom: number} {
        return this._helper.calculateCenterFromCameraLngLatAlt(lnglat, alt, bearing, pitch);
    }

    _calculateNearFarZIfNeeded(cameraToSeaLevelDistance: number, limitedPitchRadians: number, offset: Point): void {
        if (!this._helper.autoCalculateNearFarZ) {
            return;
        }
        // In case of negative minimum elevation (e.g. the dead see, under the sea maps) use a lower plane for calculation
        const minRenderDistanceBelowCameraInMeters = 100;
        const minElevation = Math.min(this.elevation, this.minElevationForCurrentTile, this.getCameraAltitude() - minRenderDistanceBelowCameraInMeters);
        const cameraToLowestPointDistance = cameraToSeaLevelDistance - minElevation * this._helper._pixelPerMeter / Math.cos(limitedPitchRadians);
        const lowestPlane = minElevation < 0 ? cameraToLowestPointDistance : cameraToSeaLevelDistance;

        // Find the distance from the center point [width/2 + offset.x, height/2 + offset.y] to the
        // center top point [width/2 + offset.x, 0] in Z units, using the law of sines.
        // 1 Z unit is equivalent to 1 horizontal px at the center of the map
        // (the distance between[width/2, height/2] and [width/2 + 1, height/2])
        const groundAngle = Math.PI / 2 + this.pitchInRadians;
        const zfov = degreesToRadians(this.fov) * (Math.abs(Math.cos(degreesToRadians(this.roll))) * this.height + Math.abs(Math.sin(degreesToRadians(this.roll))) * this.width) / this.height;
        const fovAboveCenter = zfov * (0.5 + offset.y / this.height);
        const topHalfSurfaceDistance = Math.sin(fovAboveCenter) * lowestPlane / Math.sin(clamp(Math.PI - groundAngle - fovAboveCenter, 0.01, Math.PI - 0.01));

        // Find the distance from the center point to the horizon
        const horizon = getMercatorHorizon(this);
        const horizonAngle = Math.atan(horizon / this._helper.cameraToCenterDistance);
        const minFovCenterToHorizonRadians = degreesToRadians(90 - maxMercatorHorizonAngle);
        const fovCenterToHorizon = horizonAngle > minFovCenterToHorizonRadians ? 2 * horizonAngle * (0.5 + offset.y / (horizon * 2)) : minFovCenterToHorizonRadians;
        const topHalfSurfaceDistanceHorizon = Math.sin(fovCenterToHorizon) * lowestPlane / Math.sin(clamp(Math.PI - groundAngle - fovCenterToHorizon, 0.01, Math.PI - 0.01));

        // Calculate z distance of the farthest fragment that should be rendered.
        // Add a bit extra to avoid precision problems when a fragment's distance is exactly `furthestDistance`
        const topHalfMinDistance = Math.min(topHalfSurfaceDistance, topHalfSurfaceDistanceHorizon);

        this._helper._farZ = (Math.cos(Math.PI / 2 - limitedPitchRadians) * topHalfMinDistance + lowestPlane) * 1.01;

        // The larger the value of nearZ is
        // - the more depth precision is available for features (good)
        // - clipping starts appearing sooner when the camera is close to 3d features (bad)
        //
        // Other values work for mapbox-gl-js but deck.gl was encountering precision issues
        // when rendering custom layers. This value was experimentally chosen and
        // seems to solve z-fighting issues in deck.gl while not clipping buildings too close to the camera.
        this._helper._nearZ = this._helper._height / 50;
    }

    _calcMatrices(): void {
        if (!this._helper._height) return;

        const offset = this.centerOffset;
        const point = projectToWorldCoordinates(this.worldSize, this.center);
        const x = point.x, y = point.y;
        this._helper._pixelPerMeter = mercatorZfromAltitude(1, this.center.lat) * this.worldSize;

        // Calculate the camera to sea-level distance in pixel in respect of terrain
        const limitedPitchRadians = degreesToRadians(Math.min(this.pitch, maxMercatorHorizonAngle));
        const cameraToSeaLevelDistance = Math.max(this._helper.cameraToCenterDistance / 2, this._helper.cameraToCenterDistance + this._helper._elevation * this._helper._pixelPerMeter / Math.cos(limitedPitchRadians));

        this._calculateNearFarZIfNeeded(cameraToSeaLevelDistance, limitedPitchRadians, offset);

        // matrix for conversion from location to clip space(-1 .. 1)
        let m: mat4;
        m = new Float64Array(16) as any;
        mat4.perspective(m, this.fovInRadians, this._helper._width / this._helper._height, this._helper._nearZ, this._helper._farZ);
        this._invProjMatrix = new Float64Array(16) as any as mat4;
        mat4.invert(this._invProjMatrix, m);

        // Apply center of perspective offset
        m[8] = -offset.x * 2 / this._helper._width;
        m[9] = offset.y * 2 / this._helper._height;
        this._projectionMatrix = mat4.clone(m);

        mat4.scale(m, m, [1, -1, 1]);
        mat4.translate(m, m, [0, 0, -this._helper.cameraToCenterDistance]);
        mat4.rotateZ(m, m, -this.rollInRadians);
        mat4.rotateX(m, m, this.pitchInRadians);
        mat4.rotateZ(m, m, -this.bearingInRadians);
        mat4.translate(m, m, [-x, -y, 0]);

        // The mercatorMatrix can be used to transform points from mercator coordinates
        // ([0, 0] nw, [1, 1] se) to clip space.
        this._mercatorMatrix = mat4.scale([] as any, m, [this.worldSize, this.worldSize, this.worldSize]);

        // scale vertically to meters per pixel (inverse of ground resolution):
        mat4.scale(m, m, [1, 1, this._helper._pixelPerMeter]);

        // matrix for conversion from world space to screen coordinates in 2D
        this._pixelMatrix = mat4.multiply(new Float64Array(16) as any, this.clipSpaceToPixelsMatrix, m);

        // matrix for conversion from world space to clip space (-1 .. 1)
        mat4.translate(m, m, [0, 0, -this.elevation]); // elevate camera over terrain
        this._viewProjMatrix = m;
        this._invViewProjMatrix = mat4.invert([] as any, m);

        const cameraPos: vec4 = [0, 0, -1, 1];
        vec4.transformMat4(cameraPos, cameraPos, this._invViewProjMatrix);
        this._cameraPosition = [
            cameraPos[0] / cameraPos[3],
            cameraPos[1] / cameraPos[3],
            cameraPos[2] / cameraPos[3]
        ];

        // create a fog matrix, same es proj-matrix but with near clipping-plane in mapcenter
        // needed to calculate a correct z-value for fog calculation, because projMatrix z value is not
        this._fogMatrix = new Float64Array(16) as any;
        mat4.perspective(this._fogMatrix, this.fovInRadians, this.width / this.height, cameraToSeaLevelDistance, this._helper._farZ);
        this._fogMatrix[8] = -offset.x * 2 / this.width;
        this._fogMatrix[9] = offset.y * 2 / this.height;
        mat4.scale(this._fogMatrix, this._fogMatrix, [1, -1, 1]);
        mat4.translate(this._fogMatrix, this._fogMatrix, [0, 0, -this.cameraToCenterDistance]);
        mat4.rotateZ(this._fogMatrix, this._fogMatrix, -this.rollInRadians);
        mat4.rotateX(this._fogMatrix, this._fogMatrix, this.pitchInRadians);
        mat4.rotateZ(this._fogMatrix, this._fogMatrix, -this.bearingInRadians);
        mat4.translate(this._fogMatrix, this._fogMatrix, [-x, -y, 0]);
        mat4.scale(this._fogMatrix, this._fogMatrix, [1, 1, this._helper._pixelPerMeter]);
        mat4.translate(this._fogMatrix, this._fogMatrix, [0, 0, -this.elevation]); // elevate camera over terrain

        // matrix for conversion from world space to screen coordinates in 3D
        this._pixelMatrix3D = mat4.multiply(new Float64Array(16) as any, this.clipSpaceToPixelsMatrix, m);

        // Make a second projection matrix that is aligned to a pixel grid for rendering raster tiles.
        // We're rounding the (floating point) x/y values to achieve to avoid rendering raster images to fractional
        // coordinates. Additionally, we adjust by half a pixel in either direction in case that viewport dimension
        // is an odd integer to preserve rendering to the pixel grid. We're rotating this shift based on the angle
        // of the transformation so that 0°, 90°, 180°, and 270° rasters are crisp, and adjust the shift so that
        // it is always <= 0.5 pixels.
        const xShift = (this._helper._width % 2) / 2, yShift = (this._helper._height % 2) / 2,
            angleCos = Math.cos(this.bearingInRadians), angleSin = Math.sin(-this.bearingInRadians),
            dx = x - Math.round(x) + angleCos * xShift + angleSin * yShift,
            dy = y - Math.round(y) + angleCos * yShift + angleSin * xShift;
        const alignedM = new Float64Array(m) as any as mat4;
        mat4.translate(alignedM, alignedM, [dx > 0.5 ? dx - 1 : dx, dy > 0.5 ? dy - 1 : dy, 0]);
        this._alignedProjMatrix = alignedM;

        // inverse matrix for conversion from screen coordinates to location
        m = mat4.invert(new Float64Array(16) as any, this._pixelMatrix);
        if (!m) throw new Error('failed to invert matrix');
        this._pixelMatrixInverse = m;

        this._clearMatrixCaches();
    }

    private _clearMatrixCaches(): void {
        this._posMatrixCache.clear();
        this._alignedPosMatrixCache.clear();
        this._fogMatrixCacheF32.clear();
    }

    maxPitchScaleFactor(): number {
        // calcMatrices hasn't run yet
        if (!this._pixelMatrixInverse) return 1;

        const coord = this.screenPointToMercatorCoordinate(new Point(0, 0));
        const p = [coord.x * this.worldSize, coord.y * this.worldSize, 0, 1] as vec4;
        const topPoint = vec4.transformMat4(p, p, this._pixelMatrix);
        return topPoint[3] / this._helper.cameraToCenterDistance;
    }

    getCameraPoint(): Point {
        return this._helper.getCameraPoint();
    }

    getCameraAltitude(): number {
        return this._helper.getCameraAltitude();
    }

    getCameraLngLat(): LngLat {
        const pixelPerMeter = mercatorZfromAltitude(1, this.center.lat) * this.worldSize;
        const cameraToCenterDistanceMeters = this._helper.cameraToCenterDistance / pixelPerMeter;
        const camMercator = cameraMercatorCoordinateFromCenterAndRotation(this.center, this.elevation, this.pitch, this.bearing, cameraToCenterDistanceMeters);
        return camMercator.toLngLat();
    }

    lngLatToCameraDepth(lngLat: LngLat, elevation: number) {
        const coord = MercatorCoordinate.fromLngLat(lngLat);
        const p = [coord.x * this.worldSize, coord.y * this.worldSize, elevation, 1] as vec4;
        vec4.transformMat4(p, p, this._viewProjMatrix);
        return (p[2] / p[3]);
    }

    getProjectionData(params: ProjectionDataParams): ProjectionData {
        const {overscaledTileID, aligned, applyTerrainMatrix} = params;
        const mercatorTileCoordinates = this._helper.getMercatorTileCoordinates(overscaledTileID);
        const tilePosMatrix = overscaledTileID ? this.calculatePosMatrix(overscaledTileID, aligned, true) : null;
        
        let mainMatrix: mat4;
        if (overscaledTileID && overscaledTileID.terrainRttPosMatrix32f && applyTerrainMatrix) {
            mainMatrix = overscaledTileID.terrainRttPosMatrix32f;
        } else if (tilePosMatrix) {
            mainMatrix = tilePosMatrix; // This matrix should be float32
        } else {
            mainMatrix = createIdentityMat4f32();
        }
        return {
            mainMatrix, // Might be set to a custom matrix by different projections.
            tileMercatorCoords: mercatorTileCoordinates,
            clippingPlane: [0, 0, 0, 0],
            projectionTransition: 0.0, // Range 0..1, where 0 is mercator, 1 is another projection, mostly globe.
            fallbackMatrix: mainMatrix,
        };
    }

    isLocationOccluded(_: LngLat): boolean {
        return false;
    }

    getPixelScale(): number {
        return 1.0;
    }

    getCircleRadiusCorrection(): number {
        return 1.0;
    }

    getPitchedTextCorrection(_textAnchorX: number, _textAnchorY: number, _tileID: UnwrappedTileID): number {
        return 1.0;
    }

    transformLightDirection(dir: vec3): vec3 {
        return vec3.clone(dir);
    }

    getRayDirectionFromPixel(_p: Point): vec3 {
        throw new Error('Not implemented.'); // No need for this in mercator transform
    }

    projectTileCoordinates(x: number, y: number, unwrappedTileID: UnwrappedTileID, getElevation: (x: number, y: number) => number): PointProjection {
        const matrix = this.calculatePosMatrix(unwrappedTileID);
        let pos;
        if (getElevation) { // slow because of handle z-index
            pos = [x, y, getElevation(x, y), 1] as vec4;
            vec4.transformMat4(pos, pos, matrix);
        } else { // fast because of ignore z-index
            pos = [x, y, 0, 1] as vec4;
            xyTransformMat4(pos, pos, matrix);
        }
        const w = pos[3];
        return {
            point: new Point(pos[0] / w, pos[1] / w),
            signedDistanceFromCamera: w,
            isOccluded: false
        };
    }

    projectPoint(p: Point, pixelPosMatrix: mat4) {
        const point = vec4.transformMat4([] as any, [p.x, p.y, 0, 1], pixelPosMatrix);
        return new Point(point[0] / point[3], point[1] / point[3]);
    }

    populateCache(coords: Array<OverscaledTileID>): void {
        for (const coord of coords) {
            // Return value is thrown away, but this function will still
            // place the pos matrix into the transform's internal cache.
            this.calculatePosMatrix(coord);
        }
    }

    getMatrixForModel(location: LngLatLike, altitude?: number): mat4 {
        const modelAsMercatorCoordinate = MercatorCoordinate.fromLngLat(
            location,
            altitude
        );
        const scale = modelAsMercatorCoordinate.meterInMercatorCoordinateUnits();

        const m = createIdentityMat4f64();
        mat4.translate(m, m, [modelAsMercatorCoordinate.x, modelAsMercatorCoordinate.y, modelAsMercatorCoordinate.z]);
        mat4.rotateZ(m, m, Math.PI);
        mat4.rotateX(m, m, Math.PI / 2);
        mat4.scale(m, m, [-scale, scale, scale]);
        return m;
    }

    getProjectionDataForCustomLayer(applyGlobeMatrix: boolean = true): ProjectionData {
        const tileID = new OverscaledTileID(0, 0, 0, 0, 0);
        const projectionData = this.getProjectionData({overscaledTileID: tileID, applyGlobeMatrix});

        const tileMatrix = calculateTileMatrix(tileID, this.worldSize);
        mat4.multiply(tileMatrix, this._viewProjMatrix, tileMatrix);

        projectionData.tileMercatorCoords = [0, 0, 1, 1];

        // Even though we requested projection data for the mercator base tile which covers the entire mercator range,
        // the shader projection machinery still expects inputs to be in tile units range [0..EXTENT].
        // Since custom layers are expected to supply mercator coordinates [0..1], we need to rescale
        // both matrices by EXTENT. We also need to rescale Z.

        const scale: vec3 = [EXTENT, EXTENT, this.worldSize / this._helper.pixelsPerMeter];

        // We pass full-precision 64bit float matrices to custom layers to prevent precision loss in case the user wants to do further transformations.
        // Otherwise we get very visible precision-artifacts and twitching for objects that are bulding-scale.
        const projectionMatrixScaled = createMat4f64();
        mat4.scale(projectionMatrixScaled, tileMatrix, scale);

        projectionData.fallbackMatrix = projectionMatrixScaled;
        projectionData.mainMatrix = projectionMatrixScaled;
        return projectionData;
    }

    getFastPathSimpleProjectionMatrix(tileID: OverscaledTileID): mat4 {
        return this.calculatePosMatrix(tileID);
    }
}
