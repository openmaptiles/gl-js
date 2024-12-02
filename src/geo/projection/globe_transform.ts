import {type mat2, mat4, type vec3, type vec4} from 'gl-matrix';
import {TransformHelper} from '../transform_helper';
import {MercatorTransform} from './mercator_transform';
import {VerticalPerspectiveTransform} from './vertical_perspective_transform';
import {LngLat, type LngLatLike,} from '../lng_lat';
import {createMat4f32, createMat4f64, differenceOfAnglesDegrees, easeCubicInOut, lerp, warnOnce} from '../../util/util';
import {OverscaledTileID, type UnwrappedTileID, type CanonicalTileID} from '../../source/tile_id';
import {browser} from '../../util/browser';
import {globeConstants, type GlobeProjection} from './globe';
import {EXTENT} from '../../data/extent';

import type Point from '@mapbox/point-geometry';
import type {MercatorCoordinate} from '../mercator_coordinate';
import type {LngLatBounds} from '../lng_lat_bounds';
import type {Frustum} from '../../util/primitives/frustum';
import type {Terrain} from '../../render/terrain';
import type {PointProjection} from '../../symbol/projection';
import type {IReadonlyTransform, ITransform, TransformUpdateResult} from '../transform_interface';
import type {PaddingOptions} from '../edge_insets';
import type {ProjectionData, ProjectionDataParams} from './projection_data';
import type {CoveringTilesDetailsProvider} from './covering_tiles_details_provider';

/**
 * Globe transform is a transform that moves between vertical perspective and mercator projections.
 */
export class GlobeTransform implements ITransform {
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
    resize(width: number, height: number): void {
        this._helper.resize(width, height);
    }
    getMaxBounds(): LngLatBounds {
        return this._helper.getMaxBounds();
    }
    setMaxBounds(bounds?: LngLatBounds): void {
        this._helper.setMaxBounds(bounds);
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

    //
    // Implementation of globe transform
    //

    // Transition handling
    private _lastGlobeStateEnabled: boolean = true;

    /**
     * Stores when {@link newFrameUpdate} was last called.
     * Serves as a unified clock for globe (instead of each function using a slightly different value from `browser.now()`).
     */
    private _lastUpdateTimeSeconds = browser.now() / 1000.0;
    /**
     * Stores when switch from globe to mercator or back last occurred, for animation purposes.
     * This switch can be caused either by the map passing the threshold zoom level,
     * or by {@link setGlobeViewAllowed} being called.
     */
    private _lastGlobeChangeTimeSeconds: number = browser.now() / 1000 - 10; // Ten seconds before transform creation

    private _skipNextAnimation: boolean = true;

    /**
     * Note: projection instance should only be accessed in the {@link newFrameUpdate} function.
     * to ensure the transform's state isn't unintentionally changed.
     */
    private _projectionInstance: GlobeProjection;
    private _globeLatitudeErrorCorrectionRadians: number = 0;

    /**
     * True when globe render path should be used instead of the old but simpler mercator rendering.
     * Globe automatically transitions to mercator at high zoom levels, which causes a switch from
     * globe to mercator render path.
     */
    get isGlobeRendering(): boolean {
        return this._globeness > 0;
    }

    get currentTransform(): ITransform {
        return this.isGlobeRendering ? this._verticalPerspectiveTransform : this._mercatorTransform;
    }

    /**
     * Globe projection can smoothly interpolate between globe view and mercator. This variable controls this interpolation.
     * Value 0 is mercator, value 1 is globe, anything between is an interpolation between the two projections.
     */
    private _globeness: number = 1.0;
    private _mercatorTransform: MercatorTransform;
    private _verticalPerspectiveTransform: VerticalPerspectiveTransform;

    public constructor(globeProjection: GlobeProjection) {

        this._helper = new TransformHelper({
            calcMatrices: () => { this._calcMatrices(); },
            getConstrained: (center, zoom) => { return this.getConstrained(center, zoom); }
        });
        this._globeness = 1; // When transform is cloned for use in symbols, `_updateAnimation` function which usually sets this value never gets called.
        this._projectionInstance = globeProjection;
        this._mercatorTransform = new MercatorTransform();
        this._verticalPerspectiveTransform = new VerticalPerspectiveTransform();
    }

    clone(): ITransform {
        const clone = new GlobeTransform(null);
        clone._globeness = this._globeness;
        clone._globeLatitudeErrorCorrectionRadians = this._globeLatitudeErrorCorrectionRadians;
        clone.apply(this);
        return clone;
    }

    public apply(that: IReadonlyTransform): void {
        this._helper.apply(that);
        this._mercatorTransform.apply(this);
        this._verticalPerspectiveTransform.apply(this, this._globeLatitudeErrorCorrectionRadians);
    }

    public get projectionMatrix(): mat4 { return this.currentTransform.projectionMatrix }

    public get modelViewProjectionMatrix(): mat4 { return this.currentTransform.modelViewProjectionMatrix }

    public get inverseProjectionMatrix(): mat4 { return this.currentTransform.inverseProjectionMatrix; }

    public get cameraPosition(): vec3 { return this.currentTransform.cameraPosition; }

    public get nearZ(): number { return this.currentTransform.nearZ; }

    public get farZ(): number { return this.currentTransform.farZ; }

    /**
     * Should be called at the beginning of every frame to synchronize the transform with the underlying projection.
     */
    newFrameUpdate(): TransformUpdateResult {
        this._lastUpdateTimeSeconds = browser.now() / 1000.0;
        const oldGlobeRendering = this.isGlobeRendering;

        this._globeness = this._computeGlobenessAnimation();
        // Everything below this comment must happen AFTER globeness update
        this._updateErrorCorrectionValue();
        this._calcMatrices();
        this._verticalPerspectiveTransform.getCoveringTilesDetailsProvider().newFrame();
        this._mercatorTransform.getCoveringTilesDetailsProvider().newFrame();

        if (oldGlobeRendering === this.isGlobeRendering) {
            return {
                forcePlacementUpdate: false,
            };
        } else {
            return {
                forcePlacementUpdate: true,
                fireProjectionEvent: {
                    type: 'projectiontransition',
                    newProjection: this.isGlobeRendering ? 'globe' : 'globe-mercator',
                },
                forceSourceUpdate: true,
            };
        }
    }

    /**
     * This function should never be called on a cloned transform, thus ensuring that
     * the state of a cloned transform is never changed after creation.
     */
    private _updateErrorCorrectionValue(): void {
        if (!this._projectionInstance) {
            return;
        }
        this._projectionInstance.useGlobeRendering = this.isGlobeRendering;
        this._projectionInstance.errorQueryLatitudeDegrees = this.center.lat;
        this._globeLatitudeErrorCorrectionRadians = this._projectionInstance.latitudeErrorCorrectionRadians;
    }

    /**
     * Compute new globeness, if needed.
     */
    private _computeGlobenessAnimation(): number {
        // Update globe transition animation
        const globeState = this.zoom < globeConstants.maxGlobeZoom;
        const currentTimeSeconds = this._lastUpdateTimeSeconds;
        if (globeState !== this._lastGlobeStateEnabled) {
            this._lastGlobeChangeTimeSeconds = currentTimeSeconds;
            this._lastGlobeStateEnabled = globeState;
        }

        const oldGlobeness = this._globeness;

        // Transition parameter, where 0 is the start and 1 is end.
        const globeTransition = Math.min(Math.max((currentTimeSeconds - this._lastGlobeChangeTimeSeconds) / globeConstants.globeTransitionTimeSeconds, 0.0), 1.0);
        let newGlobeness = globeState ? globeTransition : (1.0 - globeTransition);

        if (this._skipNextAnimation) {
            newGlobeness = globeState ? 1.0 : 0.0;
            this._lastGlobeChangeTimeSeconds = currentTimeSeconds - globeConstants.globeTransitionTimeSeconds * 2.0;
            this._skipNextAnimation = false;
        }

        newGlobeness = easeCubicInOut(newGlobeness); // Smooth animation

        if (oldGlobeness !== newGlobeness) {
            this.setCenter(new LngLat(
                this._mercatorTransform.center.lng + differenceOfAnglesDegrees(this._mercatorTransform.center.lng, this.center.lng) * newGlobeness,
                lerp(this._mercatorTransform.center.lat, this.center.lat, newGlobeness)
            ));
            this.setZoom(lerp(this._mercatorTransform.zoom, this.zoom, newGlobeness));
        }

        return newGlobeness;
    }

    isRenderingDirty(): boolean {
        // Globe transition
        return (this._lastUpdateTimeSeconds - this._lastGlobeChangeTimeSeconds) < globeConstants.globeTransitionTimeSeconds;
    }

    getProjectionData(params: ProjectionDataParams): ProjectionData {
        const mercatorProjectionData = this._mercatorTransform.getProjectionData(params);
        const verticalPerspectiveProjectionData = this._verticalPerspectiveTransform.getProjectionData(params);

        return {
            mainMatrix: this.isGlobeRendering ? verticalPerspectiveProjectionData.mainMatrix : mercatorProjectionData.mainMatrix,
            clippingPlane: verticalPerspectiveProjectionData.clippingPlane,
            tileMercatorCoords: verticalPerspectiveProjectionData.tileMercatorCoords,
            projectionTransition: params.applyGlobeMatrix ? this._globeness : 0,
            fallbackMatrix: mercatorProjectionData.fallbackMatrix,
        };
    }

    public isLocationOccluded(location: LngLat): boolean {
        return this.currentTransform.isLocationOccluded(location);
    }

    public transformLightDirection(dir: vec3): vec3 {
        return this.currentTransform.transformLightDirection(dir);
    }

    public getPixelScale(): number {
        return lerp(this._mercatorTransform.getPixelScale(), this._verticalPerspectiveTransform.getPixelScale(), this._globeness);
    }

    public getCircleRadiusCorrection(): number {
        // HM TODO: there was a "double" interpolation here which was removed. Check if it's needed.
        return lerp(this._mercatorTransform.getCircleRadiusCorrection(), this._verticalPerspectiveTransform.getCircleRadiusCorrection(), this._globeness);
    }

    public getPitchedTextCorrection(textAnchorX: number, textAnchorY: number, tileID: UnwrappedTileID): number {
        const mercatorCorrection = this._mercatorTransform.getPitchedTextCorrection(textAnchorX, textAnchorY, tileID);
        const verticalCorrection = this._verticalPerspectiveTransform.getPitchedTextCorrection(textAnchorX, textAnchorY, tileID);
        return lerp(mercatorCorrection, verticalCorrection, this._globeness);
    }

    public projectTileCoordinates(x: number, y: number, unwrappedTileID: UnwrappedTileID, getElevation: (x: number, y: number) => number): PointProjection {
        return this.currentTransform.projectTileCoordinates(x, y, unwrappedTileID, getElevation);
    }

    private _calcMatrices(): void {
        if (!this._helper._width || !this._helper._height) {
            return;
        }
        if (this._mercatorTransform) {
            this._mercatorTransform.apply(this, true);
        }
        if (this._verticalPerspectiveTransform) {
            this._verticalPerspectiveTransform.apply(this, this._globeLatitudeErrorCorrectionRadians);
        }
    }

    calculateFogMatrix(_unwrappedTileID: UnwrappedTileID): mat4 {
        warnOnce('calculateFogMatrix is not supported on globe projection.');
        const m = createMat4f64();
        mat4.identity(m);
        return m;
    }

    getVisibleUnwrappedCoordinates(tileID: CanonicalTileID): UnwrappedTileID[] {
        return this.currentTransform.getVisibleUnwrappedCoordinates(tileID);
    }

    getCameraFrustum(): Frustum {
        return this.currentTransform.getCameraFrustum();
    }
    getClippingPlane(): vec4 | null {
        return this.currentTransform.getClippingPlane();
    }
    getCoveringTilesDetailsProvider(): CoveringTilesDetailsProvider {
        return this.currentTransform.getCoveringTilesDetailsProvider();
    }

    recalculateZoomAndCenter(terrain?: Terrain): void {
        this._mercatorTransform.recalculateZoomAndCenter(terrain);
        this._verticalPerspectiveTransform.recalculateZoomAndCenter(terrain);
    }

    maxPitchScaleFactor(): number {
        return this.currentTransform.maxPitchScaleFactor();
    }

    getCameraPoint(): Point {
        return this._helper.getCameraPoint();
    }

    getCameraAltitude(): number {
        return this._helper.getCameraAltitude();
    }

    getCameraLngLat(): LngLat {
        return this._helper.getCameraLngLat();
    }

    lngLatToCameraDepth(lngLat: LngLat, elevation: number): number {
        return this.currentTransform.lngLatToCameraDepth(lngLat, elevation);
    }

    precacheTiles(coords: OverscaledTileID[]): void {
        // HM TODO: this uses only mercator code... need to fix
        this._mercatorTransform.precacheTiles(coords);
    }

    getBounds(): LngLatBounds {
        return this.currentTransform.getBounds();
    }

    getConstrained(lngLat: LngLat, zoom: number): { center: LngLat; zoom: number } {
        return this.currentTransform.getConstrained(lngLat, zoom);
    }

    calculateCenterFromCameraLngLatAlt(lngLat: LngLatLike, alt: number, bearing?: number, pitch?: number): {center: LngLat; elevation: number; zoom: number} {
        return this._helper.calculateCenterFromCameraLngLatAlt(lngLat, alt, bearing, pitch);
    }

    /**
     * Note: automatically adjusts zoom to keep planet size consistent
     * (same size before and after a {@link setLocationAtPoint} call).
     */
    setLocationAtPoint(lnglat: LngLat, point: Point): void {
        if (!this.isGlobeRendering) {
            this._mercatorTransform.setLocationAtPoint(lnglat, point);
            this.apply(this._mercatorTransform);
            return;
        }
        this._verticalPerspectiveTransform.setLocationAtPoint(lnglat, point);
        this.apply(this._verticalPerspectiveTransform);
        return;
    }

    locationToScreenPoint(lnglat: LngLat, terrain?: Terrain): Point {
        return this.currentTransform.locationToScreenPoint(lnglat, terrain);
    }

    screenPointToMercatorCoordinate(p: Point, terrain?: Terrain): MercatorCoordinate {
        return this.currentTransform.screenPointToMercatorCoordinate(p, terrain);
    }

    screenPointToLocation(p: Point, terrain?: Terrain): LngLat {
        return this.currentTransform.screenPointToLocation(p, terrain);
    }

    isPointOnMapSurface(p: Point, terrain?: Terrain): boolean {
        return this.currentTransform.isPointOnMapSurface(p, terrain);
    }

    /**
     * Computes normalized direction of a ray from the camera to the given screen pixel.
     */
    getRayDirectionFromPixel(p: Point): vec3 {
        return this._verticalPerspectiveTransform.getRayDirectionFromPixel(p);
    }

    getMatrixForModel(location: LngLatLike, altitude?: number): mat4 {
        return this.currentTransform.getMatrixForModel(location, altitude);
    }

    getProjectionDataForCustomLayer(applyGlobeMatrix: boolean = true): ProjectionData {
        const projectionData = this.getProjectionData({overscaledTileID: new OverscaledTileID(0, 0, 0, 0, 0), applyGlobeMatrix});
        projectionData.tileMercatorCoords = [0, 0, 1, 1];

        // Even though we requested projection data for the mercator base tile which covers the entire mercator range,
        // the shader projection machinery still expects inputs to be in tile units range [0..EXTENT].
        // Since custom layers are expected to supply mercator coordinates [0..1], we need to rescale
        // the fallback projection matrix by EXTENT.
        // Note that the regular projection matrices do not need to be modified, since the rescaling happens by setting
        // the `u_projection_tile_mercator_coords` uniform correctly.
        const fallbackMatrixScaled = createMat4f32();
        mat4.scale(fallbackMatrixScaled, projectionData.fallbackMatrix, [EXTENT, EXTENT, 1]);

        projectionData.fallbackMatrix = fallbackMatrixScaled;
        return projectionData;
    }

    getFastPathSimpleProjectionMatrix(tileID: OverscaledTileID): mat4 {
        return this.currentTransform.getFastPathSimpleProjectionMatrix(tileID);
    }
}
