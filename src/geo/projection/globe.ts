import type {Context} from '../../gl/context';
import type {CanonicalTileID} from '../../source/tile_id';
import {Mesh} from '../../render/mesh';
import {browser} from '../../util/browser';
import {easeCubicInOut, lerp} from '../../util/util';
import {mercatorYfromLat} from '../mercator_coordinate';
import {SubdivisionGranularityExpression, SubdivisionGranularitySetting} from '../../render/subdivision_granularity_settings';
import type {Projection, ProjectionGPUContext, TileMeshUsage} from './projection';
import {PreparedShader, shaders} from '../../shaders/shaders';
import {MercatorProjection} from './mercator';
import {ProjectionErrorMeasurement} from './globe_projection_error_measurement';
import {createTileMeshWithBuffers, CreateTileMeshOptions} from '../../util/create_tile_mesh';

export const globeConstants = {
    globeTransitionTimeSeconds: 0.5,
    maxGlobeZoom: 12.0,
    errorTransitionTimeSeconds: 0.5
};

const granularitySettingsGlobe: SubdivisionGranularitySetting = new SubdivisionGranularitySetting({
    fill: new SubdivisionGranularityExpression(128, 2),
    line: new SubdivisionGranularityExpression(512, 0),
    // Always keep at least some subdivision on raster tiles, etc,
    // otherwise they will be visibly warped at high zooms (before mercator transition).
    // This si not needed on fill, because fill geometry tends to already be
    // highly tessellated and granular at high zooms.
    tile: new SubdivisionGranularityExpression(128, 32),
    // Stencil granularity must never be higher than fill granularity,
    // otherwise we would get seams in the oceans at zoom levels where
    // stencil has higher granularity than fill.
    stencil: new SubdivisionGranularityExpression(128, 1),
    circle: 3
});

export class GlobeProjection implements Projection {
    private _mercator: MercatorProjection;

    private _tileMeshCache: {[_: string]: Mesh} = {};

    /**
     * Stores whether globe rendering should be used.
     * The value is injected from GlobeTransform.
     */
    private _useGlobeRendering: boolean = true;

    // GPU atan() error correction
    private _errorMeasurement: ProjectionErrorMeasurement;
    private _errorQueryLatitudeDegrees: number;
    private _errorCorrectionUsable: number = 0.0;
    private _errorMeasurementLastValue: number = 0.0;
    private _errorCorrectionPreviousValue: number = 0.0;
    private _errorMeasurementLastChangeTime: number = -1000.0;

    get name(): 'globe' {
        return 'globe';
    }

    /**
     * This property is true when globe rendering and globe shader variants should be in use.
     * This is false when globe is disabled, or when globe is enabled, but mercator rendering is used due to zoom level (and no transition is happening).
     */
    get useGlobeRendering(): boolean {
        return this._useGlobeRendering;
    }

    /**
     * @internal
     * Intended for internal use, only called from GlobeTransform.
     */
    set useGlobeRendering(value: boolean) {
        this._useGlobeRendering = value;
    }

    get useSubdivision(): boolean {
        return this.useGlobeRendering;
    }

    get shaderVariantName(): string {
        return this.useGlobeRendering ? 'globe' : this._mercator.shaderVariantName;
    }

    get shaderDefine(): string {
        return this.useGlobeRendering ? '#define GLOBE' : this._mercator.shaderDefine;
    }

    get shaderPreludeCode(): PreparedShader {
        return this.useGlobeRendering ? shaders.projectionGlobe : this._mercator.shaderPreludeCode;
    }

    get vertexShaderPreludeCode(): string {
        return shaders.projectionMercator.vertexSource;
    }

    get subdivisionGranularity(): SubdivisionGranularitySetting {
        return granularitySettingsGlobe;
    }

    get useGlobeControls(): boolean {
        return this._useGlobeRendering;
    }

    get errorQueryLatitudeDegrees(): number { return this._errorQueryLatitudeDegrees; }

    /**
     * @internal
     * Intended for internal use, only called from GlobeTransform.
     */
    set errorQueryLatitudeDegrees(value: number) {
        this._errorQueryLatitudeDegrees = value;
    }

    /**
     * @internal
     * Globe projection periodically measures the error of the GPU's
     * projection from mercator to globe and computes how much to correct
     * the globe's latitude alignment.
     * This stores the correction that should be applied to the projection matrix.
     */
    get latitudeErrorCorrectionRadians(): number { return this._errorCorrectionUsable; }

    constructor() {
        this._mercator = new MercatorProjection();
    }

    public destroy() {
        if (this._errorMeasurement) {
            this._errorMeasurement.destroy();
        }
    }

    public isRenderingDirty(): boolean {
        const now = browser.now();
        let dirty = false;
        // Error correction transition
        dirty = dirty || (now - this._errorMeasurementLastChangeTime) / 1000.0 < (globeConstants.errorTransitionTimeSeconds + 0.2);
        // Error correction query in flight
        dirty = dirty || (this._errorMeasurement && this._errorMeasurement.awaitingQuery);
        return dirty;
    }

    public updateGPUdependent(renderContext: ProjectionGPUContext): void {
        this._mercator.updateGPUdependent(renderContext);
        if (!this._errorMeasurement) {
            this._errorMeasurement = new ProjectionErrorMeasurement(renderContext);
        }
        const mercatorY = mercatorYfromLat(this._errorQueryLatitudeDegrees);
        const expectedResult = 2.0 * Math.atan(Math.exp(Math.PI - (mercatorY * Math.PI * 2.0))) - Math.PI * 0.5;
        const newValue = this._errorMeasurement.updateErrorLoop(mercatorY, expectedResult);

        const now = browser.now();

        if (newValue !== this._errorMeasurementLastValue) {
            this._errorCorrectionPreviousValue = this._errorCorrectionUsable; // store the interpolated value
            this._errorMeasurementLastValue = newValue;
            this._errorMeasurementLastChangeTime = now;
        }

        const sinceUpdateSeconds = (now - this._errorMeasurementLastChangeTime) / 1000.0;
        const mix = Math.min(Math.max(sinceUpdateSeconds / globeConstants.errorTransitionTimeSeconds, 0.0), 1.0);
        const newCorrection = -this._errorMeasurementLastValue; // Note the negation
        this._errorCorrectionUsable = lerp(this._errorCorrectionPreviousValue, newCorrection, easeCubicInOut(mix));
    }

    private _getMeshKey(options: CreateTileMeshOptions): string {
        return `${options.granularity.toString(36)}_${options.generateBorders ? 'b' : ''}${options.extendToNorthPole ? 'n' : ''}${options.extendToSouthPole ? 's' : ''}`;
    }

    public getMeshFromTileID(context: Context, canonical: CanonicalTileID, hasBorder: boolean, allowPoles: boolean, usage: TileMeshUsage): Mesh {
        // Stencil granularity must match fill granularity
        const granularityConfig = usage === 'stencil' ? granularitySettingsGlobe.stencil : granularitySettingsGlobe.tile;
        const granularity = granularityConfig.getGranularityForZoomLevel(canonical.z);
        const north = (canonical.y === 0) && allowPoles;
        const south = (canonical.y === (1 << canonical.z) - 1) && allowPoles;
        return this._getMesh(context, {
            granularity,
            generateBorders: hasBorder,
            extendToNorthPole: north,
            extendToSouthPole: south,
        });
    }

    private _getMesh(context: Context, options: CreateTileMeshOptions): Mesh {
        const key = this._getMeshKey(options);

        if (key in this._tileMeshCache) {
            return this._tileMeshCache[key];
        }

        const mesh = createTileMeshWithBuffers(context, options);
        this._tileMeshCache[key] = mesh;
        return mesh;
    }
}
