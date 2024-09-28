import {LngLat} from './lng_lat';
import {LngLatBounds} from './lng_lat_bounds';
import {MercatorCoordinate, mercatorXfromLng, mercatorYfromLat, mercatorZfromAltitude} from './mercator_coordinate';
import Point from '@mapbox/point-geometry';
import {wrap, clamp} from '../util/util';
import {interpolates} from '@maplibre/maplibre-gl-style-spec';
import {EXTENT} from '../data/extent';
import {vec3, vec4, mat4, mat2, vec2} from 'gl-matrix';
import {Aabb, Frustum} from '../util/primitives';
import {EdgeInsets} from './edge_insets';

import {UnwrappedTileID, OverscaledTileID, CanonicalTileID} from '../source/tile_id';
import type {PaddingOptions} from './edge_insets';
import {Terrain} from '../render/terrain';

export const MAX_VALID_LATITUDE = 85.051129;

/**
 * @internal
 * A single transform, generally used for a single tile to be
 * scaled, rotated, and zoomed.
 */
export class Transform {
    tileSize: number;
    tileZoom: number;
    lngRange: [number, number];
    latRange: [number, number];
    scale: number;
    width: number;
    height: number;
    angle: number;
    rotationMatrix: mat2;
    pixelsToGLUnits: [number, number];
    cameraToCenterDistance: number;
    mercatorMatrix: mat4;
    projectionMatrix: mat4;
    modelViewProjectionMatrix: mat4;
    invModelViewProjectionMatrix: mat4;
    alignedModelViewProjectionMatrix: mat4;
    fogMatrix: mat4;
    pixelMatrix: mat4;
    pixelMatrix3D: mat4;
    pixelMatrixInverse: mat4;
    glCoordMatrix: mat4;
    labelPlaneMatrix: mat4;
    minElevationForCurrentTile: number;
    _fov: number;
    _pitch: number;
    _zoom: number;
    _unmodified: boolean;
    _renderWorldCopies: boolean;
    _allowUnderzoom: boolean;
    _underzoom: number;
    _overpan: number;
    _minZoom: number;
    _maxZoom: number;
    _minPitch: number;
    _maxPitch: number;
    _center: LngLat;
    _elevation: number;
    _pixelPerMeter: number;
    _edgeInsets: EdgeInsets;
    _constraining: boolean;
    _posMatrixCache: {[_: string]: mat4};
    _alignedPosMatrixCache: {[_: string]: mat4};
    _fogMatrixCache: {[_: string]: mat4};
    /**
     * This value represents the distance from the camera to the far clipping plane.
     * It is used in the calculation of the projection matrix to determine which objects are visible.
     * farZ should be larger than nearZ.
     */
    farZ: number;
    /**
     * This value represents the distance from the camera to the near clipping plane.
     * It is used in the calculation of the projection matrix to determine which objects are visible.
     * nearZ should be smaller than farZ.
     */
    nearZ: number;

    constructor(minZoom?: number, maxZoom?: number, minPitch?: number, maxPitch?: number, renderWorldCopies?: boolean, allowUnderzoom?: boolean, underzoom?: number, overpan?: number) {
        this.tileSize = 512; // constant

        this._renderWorldCopies = renderWorldCopies === undefined ? true : !!renderWorldCopies;
        this._minZoom = minZoom || 0;
        this._maxZoom = maxZoom || 22;
        this._allowUnderzoom = allowUnderzoom === undefined ? false : !!allowUnderzoom;
        this._underzoom = underzoom || 100;
        this._overpan = overpan || 0;

        this._minPitch = (minPitch === undefined || minPitch === null) ? 0 : minPitch;
        this._maxPitch = (maxPitch === undefined || maxPitch === null) ? 60 : maxPitch;

        this.setMaxBounds();

        this.width = 0;
        this.height = 0;
        this._center = new LngLat(0, 0);
        this._elevation = 0;
        this.zoom = 0;
        this.angle = 0;
        this._fov = 0.6435011087932844;
        this._pitch = 0;
        this._unmodified = true;
        this._edgeInsets = new EdgeInsets();
        this._posMatrixCache = {};
        this._alignedPosMatrixCache = {};
        this._fogMatrixCache = {};
        this.minElevationForCurrentTile = 0;
    }

    clone(): Transform {
        const clone = new Transform(this._minZoom, this._maxZoom, this._minPitch, this.maxPitch, this._renderWorldCopies, this._allowUnderzoom, this._underzoom, this._overpan);
        clone.apply(this);
        return clone;
    }

    apply(that: Transform) {
        this.tileSize = that.tileSize;
        this.latRange = that.latRange;
        this.lngRange = that.lngRange;
        this.width = that.width;
        this.height = that.height;
        this._center = that._center;
        this._elevation = that._elevation;
        this.minElevationForCurrentTile = that.minElevationForCurrentTile;
        this.zoom = that.zoom;
        this.angle = that.angle;
        this._fov = that._fov;
        this._pitch = that._pitch;
        this._unmodified = that._unmodified;
        this._edgeInsets = that._edgeInsets.clone();
        this._calcMatrices();
    }

    get minZoom(): number { return this._minZoom; }
    set minZoom(zoom: number) {
        if (this._minZoom === zoom) return;
        this._minZoom = zoom;
        this.zoom = Math.max(this.zoom, zoom);
    }

    get maxZoom(): number { return this._maxZoom; }
    set maxZoom(zoom: number) {
        if (this._maxZoom === zoom) return;
        this._maxZoom = zoom;
        this.zoom = Math.min(this.zoom, zoom);
    }

    get minPitch(): number { return this._minPitch; }
    set minPitch(pitch: number) {
        if (this._minPitch === pitch) return;
        this._minPitch = pitch;
        this.pitch = Math.max(this.pitch, pitch);
    }

    get maxPitch(): number { return this._maxPitch; }
    set maxPitch(pitch: number) {
        if (this._maxPitch === pitch) return;
        this._maxPitch = pitch;
        this.pitch = Math.min(this.pitch, pitch);
    }

    get renderWorldCopies(): boolean { return this._renderWorldCopies; }
    set renderWorldCopies(renderWorldCopies: boolean) {
        if (renderWorldCopies === undefined) {
            renderWorldCopies = true;
        } else if (renderWorldCopies === null) {
            renderWorldCopies = false;
        }

        this._renderWorldCopies = renderWorldCopies;

        this._constrain();
        this._calcMatrices();
    }

    get allowUnderzoom(): boolean { return this._allowUnderzoom; }
    set allowUnderzoom(allowUnderzoom: boolean) {
        if (allowUnderzoom === undefined) {
            allowUnderzoom = false;
        } else if (allowUnderzoom === null) {
            allowUnderzoom = false;
        }

        this._allowUnderzoom = allowUnderzoom;

        this._constrain();
        this._calcMatrices();
    }

    get underzoom(): number { return this._underzoom; }
    set underzoom(underzoom: number) {
        if (this._underzoom === underzoom) return;
        this._underzoom = underzoom;

        this._constrain();
        this._calcMatrices();
    }

    get overpan(): number { return this._overpan; }
    set overpan(overpan: number) {
        if (this._overpan === overpan) return;
        this._overpan = overpan;

        this._constrain();
        this._calcMatrices();
    }

    get worldSize(): number {
        return this.tileSize * this.scale;
    }

    get centerOffset(): Point {
        return this.centerPoint._sub(this.size._div(2));
    }

    get size(): Point {
        return new Point(this.width, this.height);
    }

    get bearing(): number {
        return -this.angle / Math.PI * 180;
    }
    set bearing(bearing: number) {
        const b = -wrap(bearing, -180, 180) * Math.PI / 180;
        if (this.angle === b) return;
        this._unmodified = false;
        this.angle = b;
        this._calcMatrices();

        // 2x2 matrix for rotating points
        this.rotationMatrix = mat2.create();
        mat2.rotate(this.rotationMatrix, this.rotationMatrix, this.angle);
    }

    get pitch(): number {
        return this._pitch / Math.PI * 180;
    }
    set pitch(pitch: number) {
        const p = clamp(pitch, this.minPitch, this.maxPitch) / 180 * Math.PI;
        if (this._pitch === p) return;
        this._unmodified = false;
        this._pitch = p;
        this._calcMatrices();
    }

    get fov(): number {
        return this._fov / Math.PI * 180;
    }
    set fov(fov: number) {
        fov = Math.max(0.01, Math.min(60, fov));
        if (this._fov === fov) return;
        this._unmodified = false;
        this._fov = fov / 180 * Math.PI;
        this._calcMatrices();
    }

    get zoom(): number { return this._zoom; }
    set zoom(zoom: number) {
        const constrainedZoom = Math.min(Math.max(zoom, this.minZoom), this.maxZoom);
        if (this._zoom === constrainedZoom) return;
        this._unmodified = false;
        this._zoom = constrainedZoom;
        this.tileZoom = Math.max(0, Math.floor(constrainedZoom));
        this.scale = this.zoomScale(constrainedZoom);
        this._constrain();
        this._calcMatrices();
    }

    get center(): LngLat { return this._center; }
    set center(center: LngLat) {
        if (center.lat === this._center.lat && center.lng === this._center.lng) return;
        this._unmodified = false;
        this._center = center;
        this._constrain();
        this._calcMatrices();
    }

    /**
     * Elevation at current center point, meters above sea level
     */
    get elevation(): number { return this._elevation; }
    set elevation(elevation: number) {
        if (elevation === this._elevation) return;
        this._elevation = elevation;
        this._constrain();
        this._calcMatrices();
    }

    get padding(): PaddingOptions { return this._edgeInsets.toJSON(); }
    set padding(padding: PaddingOptions) {
        if (this._edgeInsets.equals(padding)) return;
        this._unmodified = false;
        //Update edge-insets in place
        this._edgeInsets.interpolate(this._edgeInsets, padding, 1);
        this._calcMatrices();
    }

    /**
     * The center of the screen in pixels with the top-left corner being (0,0)
     * and +y axis pointing downwards. This accounts for padding.
     */
    get centerPoint(): Point {
        return this._edgeInsets.getCenter(this.width, this.height);
    }

    /**
     * Returns if the padding params match
     *
     * @param padding - the padding to check against
     * @returns true if they are equal, false otherwise
     */
    isPaddingEqual(padding: PaddingOptions): boolean {
        return this._edgeInsets.equals(padding);
    }

    /**
     * Helper method to update edge-insets in place
     *
     * @param start - the starting padding
     * @param target - the target padding
     * @param t - the step/weight
     */
    interpolatePadding(start: PaddingOptions, target: PaddingOptions, t: number) {
        this._unmodified = false;
        this._edgeInsets.interpolate(start, target, t);
        this._constrain();
        this._calcMatrices();
    }

    /**
     * Return a zoom level that will cover all tiles the transform
     * @param options - the options
     * @returns zoom level An integer zoom level at which all tiles will be visible.
     */
    coveringZoomLevel(options: {
        /**
         * Target zoom level. If true, the value will be rounded to the closest integer. Otherwise the value will be floored.
         */
        roundZoom?: boolean;
        /**
         * Tile size, expressed in screen pixels.
         */
        tileSize: number;
    }): number {
        const z = (options.roundZoom ? Math.round : Math.floor)(
            this.zoom + this.scaleZoom(this.tileSize / options.tileSize)
        );
        // At negative zoom levels load tiles from z0 because negative tile zoom levels don't exist.
        return Math.max(0, z);
    }

    /**
     * Return any "wrapped" copies of a given tile coordinate that are visible
     * in the current view.
     */
    getVisibleUnwrappedCoordinates(tileID: CanonicalTileID) {
        const result = [new UnwrappedTileID(0, tileID)];
        if (this._renderWorldCopies) {
            const utl = this.pointCoordinate(new Point(0, 0));
            const utr = this.pointCoordinate(new Point(this.width, 0));
            const ubl = this.pointCoordinate(new Point(this.width, this.height));
            const ubr = this.pointCoordinate(new Point(0, this.height));
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

    /**
     * Return all coordinates that could cover this transform for a covering
     * zoom level.
     * @param options - the options
     * @returns OverscaledTileIDs
     */
    coveringTiles(
        options: {
            tileSize: number;
            minzoom?: number;
            maxzoom?: number;
            roundZoom?: boolean;
            reparseOverscaled?: boolean;
            renderWorldCopies?: boolean;
            terrain?: Terrain;
        }
    ): Array<OverscaledTileID> {
        let z = this.coveringZoomLevel(options);
        const actualZ = z;

        if (options.minzoom !== undefined && z < options.minzoom) return [];
        if (options.maxzoom !== undefined && z > options.maxzoom) z = options.maxzoom;

        const cameraCoord = this.pointCoordinate(this.getCameraPoint());
        const centerCoord = MercatorCoordinate.fromLngLat(this.center);
        const numTiles = Math.pow(2, z);
        const cameraPoint = [numTiles * cameraCoord.x, numTiles * cameraCoord.y, 0];
        const centerPoint = [numTiles * centerCoord.x, numTiles * centerCoord.y, 0];
        const cameraFrustum = Frustum.fromInvProjectionMatrix(this.invModelViewProjectionMatrix, this.worldSize, z);

        // No change of LOD behavior for pitch lower than 60 and when there is no top padding: return only tile ids from the requested zoom level
        let minZoom = options.minzoom || 0;
        // Use 0.1 as an epsilon to avoid for explicit == 0.0 floating point checks
        if (!options.terrain && this.pitch <= 60.0 && this._edgeInsets.top < 0.1)
            minZoom = z;

        // There should always be a certain number of maximum zoom level tiles surrounding the center location in 2D or in front of the camera in 3D
        const radiusOfMaxLvlLodInTiles = options.terrain ? 2 / Math.min(this.tileSize, options.tileSize) * this.tileSize : 3;

        const newRootTile = (wrap: number): any => {
            return {
                aabb: new Aabb([wrap * numTiles, 0, 0], [(wrap + 1) * numTiles, numTiles, 0]),
                zoom: 0,
                x: 0,
                y: 0,
                wrap,
                fullyVisible: false
            };
        };

        // Do a depth-first traversal to find visible tiles and proper levels of detail
        const stack = [];
        const result = [];
        const maxZoom = z;
        const overscaledZ = options.reparseOverscaled ? actualZ : z;

        if (this._renderWorldCopies) {
            // Render copy of the globe thrice on both sides
            for (let i = 1; i <= 3; i++) {
                stack.push(newRootTile(-i));
                stack.push(newRootTile(i));
            }
        }

        stack.push(newRootTile(0));

        while (stack.length > 0) {
            const it = stack.pop();
            const x = it.x;
            const y = it.y;
            let fullyVisible = it.fullyVisible;

            // Visibility of a tile is not required if any of its ancestor if fully inside the frustum
            if (!fullyVisible) {
                const intersectResult = it.aabb.intersects(cameraFrustum);

                if (intersectResult === 0)
                    continue;

                fullyVisible = intersectResult === 2;
            }

            const refPoint = options.terrain ? cameraPoint : centerPoint;
            const distanceX = it.aabb.distanceX(refPoint);
            const distanceY = it.aabb.distanceY(refPoint);
            const longestDim = Math.max(Math.abs(distanceX), Math.abs(distanceY));

            // We're using distance based heuristics to determine if a tile should be split into quadrants or not.
            // radiusOfMaxLvlLodInTiles defines that there's always a certain number of maxLevel tiles next to the map center.
            // Using the fact that a parent node in quadtree is twice the size of its children (per dimension)
            // we can define distance thresholds for each relative level:
            // f(k) = offset + 2 + 4 + 8 + 16 + ... + 2^k. This is the same as "offset+2^(k+1)-2"
            const distToSplit = radiusOfMaxLvlLodInTiles + (1 << (maxZoom - it.zoom)) - 2;

            // Have we reached the target depth or is the tile too far away to be any split further?
            if (it.zoom === maxZoom || (longestDim > distToSplit && it.zoom >= minZoom)) {
                const dz = maxZoom - it.zoom, dx = cameraPoint[0] - 0.5 - (x << dz), dy = cameraPoint[1] - 0.5 - (y << dz);
                result.push({
                    tileID: new OverscaledTileID(it.zoom === maxZoom ? overscaledZ : it.zoom, it.wrap, it.zoom, x, y),
                    distanceSq: vec2.sqrLen([centerPoint[0] - 0.5 - x, centerPoint[1] - 0.5 - y]),
                    // this variable is currently not used, but may be important to reduce the amount of loaded tiles
                    tileDistanceToCamera: Math.sqrt(dx * dx + dy * dy)
                });
                continue;
            }

            for (let i = 0; i < 4; i++) {
                const childX = (x << 1) + (i % 2);
                const childY = (y << 1) + (i >> 1);
                const childZ = it.zoom + 1;
                let quadrant = it.aabb.quadrant(i);
                if (options.terrain) {
                    const tileID = new OverscaledTileID(childZ, it.wrap, childZ, childX, childY);
                    const minMax = options.terrain.getMinMaxElevation(tileID);
                    const minElevation = minMax.minElevation ?? this.elevation;
                    const maxElevation = minMax.maxElevation ?? this.elevation;
                    quadrant = new Aabb(
                        [quadrant.min[0], quadrant.min[1], minElevation] as vec3,
                        [quadrant.max[0], quadrant.max[1], maxElevation] as vec3
                    );
                }
                stack.push({aabb: quadrant, zoom: childZ, x: childX, y: childY, wrap: it.wrap, fullyVisible});
            }
        }

        return result.sort((a, b) => a.distanceSq - b.distanceSq).map(a => a.tileID);
    }

    resize(width: number, height: number) {
        this.width = width;
        this.height = height;

        this.pixelsToGLUnits = [2 / width, -2 / height];
        this._constrain();
        this._calcMatrices();
    }

    get unmodified(): boolean { return this._unmodified; }

    zoomScale(zoom: number) { return Math.pow(2, zoom); }
    scaleZoom(scale: number) { return Math.log(scale) / Math.LN2; }

    /**
     * Convert from LngLat to world coordinates (Mercator coordinates scaled by 512)
     * @param lnglat - the lngLat
     * @returns Point
     */
    project(lnglat: LngLat) {
        const lat = clamp(lnglat.lat, -MAX_VALID_LATITUDE, MAX_VALID_LATITUDE);
        return new Point(
            mercatorXfromLng(lnglat.lng) * this.worldSize,
            mercatorYfromLat(lat) * this.worldSize);
    }

    /**
     * Convert from world coordinates ([0, 512],[0, 512]) to LngLat ([-180, 180], [-90, 90])
     * @param point - world coordinate
     * @returns LngLat
     */
    unproject(point: Point): LngLat {
        return new MercatorCoordinate(point.x / this.worldSize, point.y / this.worldSize).toLngLat();
    }

    get point(): Point { return this.project(this.center); }

    /**
     * get the camera position in LngLat and altitudes in meter
     * @returns An object with lngLat & altitude.
     */
    getCameraPosition(): {
        lngLat: LngLat;
        altitude: number;
    } {
        const lngLat = this.pointLocation(this.getCameraPoint());
        const altitude = Math.cos(this._pitch) * this.cameraToCenterDistance / this._pixelPerMeter;
        return {lngLat, altitude: altitude + this.elevation};
    }

    /**
     * This method works in combination with freezeElevation activated.
     * freezeElevation is enabled during map-panning because during this the camera should sit in constant height.
     * After panning finished, call this method to recalculate the zoomlevel for the current camera-height in current terrain.
     * @param terrain - the terrain
     */
    recalculateZoom(terrain: Terrain) {
        const origElevation = this.elevation;
        const origAltitude = Math.cos(this._pitch) * this.cameraToCenterDistance / this._pixelPerMeter;

        // find position the camera is looking on
        const center = this.pointLocation(this.centerPoint, terrain);
        const elevation = terrain.getElevationForLngLatZoom(center, this.tileZoom);
        const deltaElevation = this.elevation - elevation;
        if (!deltaElevation) return;

        // The camera's altitude off the ground + the ground's elevation = a constant:
        // this means the camera stays at the same total height.
        const requiredAltitude = origAltitude + origElevation - elevation;
        // Since altitude = Math.cos(this._pitch) * this.cameraToCenterDistance / pixelPerMeter:
        const requiredPixelPerMeter = Math.cos(this._pitch) * this.cameraToCenterDistance / requiredAltitude;
        // Since pixelPerMeter = mercatorZfromAltitude(1, center.lat) * worldSize:
        const requiredWorldSize = requiredPixelPerMeter / mercatorZfromAltitude(1, center.lat);
        // Since worldSize = this.tileSize * scale:
        const requiredScale = requiredWorldSize / this.tileSize;
        const zoom = this.scaleZoom(requiredScale);

        // update matrices
        this._elevation = elevation;
        this._center = center;
        this.zoom = zoom;
    }

    setLocationAtPoint(lnglat: LngLat, point: Point) {
        const a = this.pointCoordinate(point);
        const b = this.pointCoordinate(this.centerPoint);
        const loc = this.locationCoordinate(lnglat);
        const newCenter = new MercatorCoordinate(
            loc.x - (a.x - b.x),
            loc.y - (a.y - b.y));
        this.center = this.coordinateLocation(newCenter);
        if (this._renderWorldCopies) {
            this.center = this.center.wrap();
        }
    }

    /**
     * Given a LngLat location, return the screen point that corresponds to it
     * @param lnglat - location
     * @param terrain - optional terrain
     * @returns screen point
     */
    locationPoint(lnglat: LngLat, terrain?: Terrain): Point {
        return terrain ?
            this.coordinatePoint(this.locationCoordinate(lnglat), terrain.getElevationForLngLatZoom(lnglat, this.tileZoom), this.pixelMatrix3D) :
            this.coordinatePoint(this.locationCoordinate(lnglat));
    }

    /**
     * Given a point on screen, return its lnglat
     * @param p - screen point
     * @param terrain - optional terrain
     * @returns lnglat location
     */
    pointLocation(p: Point, terrain?: Terrain): LngLat {
        return this.coordinateLocation(this.pointCoordinate(p, terrain));
    }

    /**
     * Given a geographical lnglat, return an unrounded
     * coordinate that represents it at low zoom level.
     * @param lnglat - the location
     * @returns The mercator coordinate
     */
    locationCoordinate(lnglat: LngLat): MercatorCoordinate {
        return MercatorCoordinate.fromLngLat(lnglat);
    }

    /**
     * Given a Coordinate, return its geographical position.
     * @param coord - mercator coordinates
     * @returns lng and lat
     */
    coordinateLocation(coord: MercatorCoordinate): LngLat {
        return coord && coord.toLngLat();
    }

    /**
     * Given a Point, return its mercator coordinate.
     * @param p - the point
     * @param terrain - optional terrain
     * @returns lnglat
     */
    pointCoordinate(p: Point, terrain?: Terrain): MercatorCoordinate {
        // get point-coordinate from terrain coordinates framebuffer
        if (terrain) {
            const coordinate = terrain.pointCoordinate(p);
            if (coordinate != null) {
                return coordinate;
            }
        }

        // calculate point-coordinate on flat earth
        const targetZ = 0;
        // since we don't know the correct projected z value for the point,
        // unproject two points to get a line and then find the point on that
        // line with z=0

        const coord0 = [p.x, p.y, 0, 1] as vec4;
        const coord1 = [p.x, p.y, 1, 1] as vec4;

        vec4.transformMat4(coord0, coord0, this.pixelMatrixInverse);
        vec4.transformMat4(coord1, coord1, this.pixelMatrixInverse);

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
            interpolates.number(y0, y1, t) / this.worldSize);
    }

    /**
     * Given a coordinate, return the screen point that corresponds to it
     * @param coord - the coordinates
     * @param elevation - the elevation
     * @param pixelMatrix - the pixel matrix
     * @returns screen point
     */
    coordinatePoint(coord: MercatorCoordinate, elevation: number = 0, pixelMatrix = this.pixelMatrix): Point {
        const p = [coord.x * this.worldSize, coord.y * this.worldSize, elevation, 1] as vec4;
        vec4.transformMat4(p, p, pixelMatrix);
        return new Point(p[0] / p[3], p[1] / p[3]);
    }

    /**
     * Returns the map's geographical bounds. When the bearing or pitch is non-zero, the visible region is not
     * an axis-aligned rectangle, and the result is the smallest bounds that encompasses the visible region.
     * @returns Returns a {@link LngLatBounds} object describing the map's geographical bounds.
     */
    getBounds(): LngLatBounds {
        const top = Math.max(0, this.height / 2 - this.getHorizon());
        return new LngLatBounds()
            .extend(this.pointLocation(new Point(0, top)))
            .extend(this.pointLocation(new Point(this.width, top)))
            .extend(this.pointLocation(new Point(this.width, this.height)))
            .extend(this.pointLocation(new Point(0, this.height)));
    }

    /**
     * Returns the maximum geographical bounds the map is constrained to, or `null` if none set.
     * @returns max bounds
     */
    getMaxBounds(): LngLatBounds | null {
        if (!this.latRange || this.latRange.length !== 2 ||
            !this.lngRange || this.lngRange.length !== 2) return null;

        return new LngLatBounds([this.lngRange[0], this.latRange[0]], [this.lngRange[1], this.latRange[1]]);
    }

    /**
     * Calculate pixel height of the visible horizon in relation to map-center (e.g. height/2),
     * multiplied by a static factor to simulate the earth-radius.
     * The calculated value is the horizontal line from the camera-height to sea-level.
     * @returns Horizon above center in pixels.
     */
    getHorizon(): number {
        return Math.tan(Math.PI / 2 - this._pitch) * this.cameraToCenterDistance * 0.85;
    }

    /**
     * Sets or clears the map's geographical constraints.
     * @param bounds - A {@link LngLatBounds} object describing the new geographic boundaries of the map.
     */
    setMaxBounds(bounds?: LngLatBounds | null) {
        if (bounds) {
            this.lngRange = [bounds.getWest(), bounds.getEast()];
            this.latRange = [bounds.getSouth(), bounds.getNorth()];
            this._constrain();
        } else {
            this.lngRange = null;
            this.latRange = [-MAX_VALID_LATITUDE, MAX_VALID_LATITUDE];
        }
    }

    calculateTileMatrix(unwrappedTileID: UnwrappedTileID): mat4 {
        const canonical = unwrappedTileID.canonical;
        const scale = this.worldSize / this.zoomScale(canonical.z);
        const unwrappedX = canonical.x + Math.pow(2, canonical.z) * unwrappedTileID.wrap;

        const worldMatrix = mat4.identity(new Float64Array(16) as any);
        mat4.translate(worldMatrix, worldMatrix, [unwrappedX * scale, canonical.y * scale, 0]);
        mat4.scale(worldMatrix, worldMatrix, [scale / EXTENT, scale / EXTENT, 1]);
        return worldMatrix;
    }

    /**
     * Calculate the posMatrix that, given a tile coordinate, would be used to display the tile on a map.
     * @param unwrappedTileID - the tile ID
     */
    calculatePosMatrix(unwrappedTileID: UnwrappedTileID, aligned: boolean = false): mat4 {
        const posMatrixKey = unwrappedTileID.key;
        const cache = aligned ? this._alignedPosMatrixCache : this._posMatrixCache;
        if (cache[posMatrixKey]) {
            return cache[posMatrixKey];
        }

        const posMatrix = this.calculateTileMatrix(unwrappedTileID);
        mat4.multiply(posMatrix, aligned ? this.alignedModelViewProjectionMatrix : this.modelViewProjectionMatrix, posMatrix);

        cache[posMatrixKey] = new Float32Array(posMatrix);
        return cache[posMatrixKey];
    }

    /**
     * Calculate the fogMatrix that, given a tile coordinate, would be used to calculate fog on the map.
     * @param unwrappedTileID - the tile ID
     * @private
     */
    calculateFogMatrix(unwrappedTileID: UnwrappedTileID): mat4 {
        const posMatrixKey = unwrappedTileID.key;
        const cache = this._fogMatrixCache;
        if (cache[posMatrixKey]) {
            return cache[posMatrixKey];
        }

        const fogMatrix = this.calculateTileMatrix(unwrappedTileID);
        mat4.multiply(fogMatrix, this.fogMatrix, fogMatrix);

        cache[posMatrixKey] = new Float32Array(fogMatrix);
        return cache[posMatrixKey];
    }

    customLayerMatrix(): mat4 {
        return this.mercatorMatrix.slice() as any;
    }

    /**
     * Get center lngLat and zoom to ensure that
     * 1) everything beyond the bounds is excluded
     * 2) a given lngLat is as near the center as possible
     * Bounds are those set by maxBounds or North & South "Poles" and, if only 1 globe is displayed, antimeridian.
     * Underzooming and overpanning beyond the bounds is done if 1 globe is displayed and allowUnderzoom=true.
     */
    getConstrained(lngLat: LngLat, zoom: number): {center: LngLat; zoom: number} {
        zoom = clamp(+zoom, this.minZoom, this.maxZoom);
        const result = {
            center: new LngLat(lngLat.lng, lngLat.lat),
            zoom
        };

        let lngRange = this.lngRange;

        if (!this._renderWorldCopies && lngRange === null) {
            const almost180 = 180 - 1e-10;
            lngRange = [-almost180, almost180];
        }

        const worldSize = this.tileSize * this.zoomScale(result.zoom); // A world size for the requested zoom level, not the current world size
        let minY = 0;
        let maxY = worldSize;
        let minX = 0;
        let maxX = worldSize;
        let scaleY = 0;
        let scaleX = 0;
        const {x: screenWidth, y: screenHeight} = this.size;

        // For a single-world map, a user can underzoom the world to see it
        // entirely in the viewport. This works by reducing the viewport's
        // apparent size to a square with a side length equal to the smallest
        // viewport dimension scaled by the `underzoom` percentage.
        // The user can also overpan the world bounds up to 50% the viewport
        // dimensions, limited by the `overpan` percentage.
        // _________________________
        // |viewport               |
        // |                       |
        // |                       |
        // |     -———————————-     |
        // |     |map bounds |     |
        // |     |           |     |
        // |·····|···········|<--->| overpan
        // |     |           |     |
        // |     -———————————-     |
        // |·····<----------->·····| underzoom
        // |                       |
        // |                       |
        // |_______________________|

        const underzoom =  // 0-1 (percent as normalized factor of viewport minimum dimension)
            (!this._renderWorldCopies && this._allowUnderzoom) ?
                clamp(this._underzoom, 0, 100) / 100 :
                1.0;

        if (this.latRange) {
            const latRange = this.latRange;
            minY = mercatorYfromLat(latRange[1]) * worldSize;
            maxY = mercatorYfromLat(latRange[0]) * worldSize;
            const shouldZoomIn = maxY - minY < (underzoom * screenHeight);
            if (shouldZoomIn) scaleY = underzoom * screenHeight / (maxY - minY);
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

            const shouldZoomIn = maxX - minX < (underzoom * screenWidth);
            if (shouldZoomIn) scaleX = underzoom * screenWidth / (maxX - minX);
        }

        const {x: originalX, y: originalY} = this.project.call({worldSize}, lngLat);
        let modifiedX, modifiedY;

        const scale =
            (!this._renderWorldCopies && this._allowUnderzoom) ?
                Math.min(scaleX || 0, scaleY || 0) :
                Math.max(scaleX || 0, scaleY || 0);

        if (scale) {
            // zoom in to exclude all beyond the given lng/lat ranges
            const newPoint = new Point(
                scaleX ? (maxX + minX) / 2 : originalX,
                scaleY ? (maxY + minY) / 2 : originalY);
            if (this._renderWorldCopies) result.center = this.unproject.call({worldSize}, newPoint).wrap();
            result.zoom += this.scaleZoom(scale);
            return result;
        }

        // Panning up and down in latitude is externally limited by project() with MAX_VALID_LATITUDE.
        // This limit prevents panning the top and bottom bounds farther than the center of the viewport.
        // Due to the complexity and consequence of altering project() or MAX_VALID_LATITUDE, we'll simply limit
        // the overpan to 50% the bounds to match that external limit.
        let lngOverpan = 0.0;
        let latOverpan = 0.0;
        if (!this._renderWorldCopies && this._allowUnderzoom) {
            const overpan = 2 * clamp(this._overpan, 0, 50) / 100;  // 0-1 (percent as a normalized factor from viewport edge to center)
            const latUnderzoomMinimumPan = 1.0 - ((maxY - minY) / screenHeight);
            const lngUnderzoomMinimumPan = 1.0 - ((maxX - minX) / screenWidth);
            lngOverpan = Math.max(lngUnderzoomMinimumPan, overpan);
            latOverpan = Math.max(latUnderzoomMinimumPan, overpan);
        }
        const lngPanScale = 1.0 - lngOverpan;
        const latPanScale = 1.0 - latOverpan;

        if (this.latRange) {
            const h2 = latPanScale * screenHeight / 2;
            if (originalY - h2 < minY) modifiedY = minY + h2;
            if (originalY + h2 > maxY) modifiedY = maxY - h2;
        }

        if (lngRange) {
            const centerX = (minX + maxX) / 2;
            let wrappedX = originalX;
            if (this._renderWorldCopies) {
                wrappedX = wrap(originalX, centerX - worldSize / 2, centerX + worldSize / 2);
            }
            const w2 = lngPanScale * screenWidth / 2;

            if (wrappedX - w2 < minX) modifiedX = minX + w2;
            if (wrappedX + w2 > maxX) modifiedX = maxX - w2;
        }

        // pan the map if the screen goes off the range
        if (modifiedX !== undefined || modifiedY !== undefined) {
            const newPoint = new Point(modifiedX ?? originalX, modifiedY ?? originalY);
            result.center = this.unproject.call({worldSize}, newPoint);
            if (this._renderWorldCopies) result.center = result.center.wrap();
        }

        return result;
    }

    _constrain() {
        if (!this.center || !this.width || !this.height || this._constraining) return;
        this._constraining = true;
        const unmodified = this._unmodified;
        const {center, zoom} = this.getConstrained(this.center, this.zoom);
        this.center = center;
        this.zoom = zoom;
        this._unmodified = unmodified;
        this._constraining = false;
    }

    _calcMatrices() {
        if (!this.height) return;

        const halfFov = this._fov / 2;
        const offset = this.centerOffset;
        const x = this.point.x, y = this.point.y;
        this.cameraToCenterDistance = 0.5 / Math.tan(halfFov) * this.height;
        this._pixelPerMeter = mercatorZfromAltitude(1, this.center.lat) * this.worldSize;

        let m = mat4.identity(new Float64Array(16) as any);
        mat4.scale(m, m, [this.width / 2, -this.height / 2, 1]);
        mat4.translate(m, m, [1, -1, 0]);
        this.labelPlaneMatrix = m;

        m = mat4.identity(new Float64Array(16) as any);
        mat4.scale(m, m, [1, -1, 1]);
        mat4.translate(m, m, [-1, -1, 0]);
        mat4.scale(m, m, [2 / this.width, 2 / this.height, 1]);
        this.glCoordMatrix = m;

        // Calculate the camera to sea-level distance in pixel in respect of terrain
        const cameraToSeaLevelDistance = this.cameraToCenterDistance + this._elevation * this._pixelPerMeter / Math.cos(this._pitch);
        // In case of negative minimum elevation (e.g. the dead see, under the sea maps) use a lower plane for calculation
        const minElevation = Math.min(this.elevation, this.minElevationForCurrentTile);
        const cameraToLowestPointDistance = cameraToSeaLevelDistance - minElevation * this._pixelPerMeter / Math.cos(this._pitch);
        const lowestPlane = minElevation < 0 ? cameraToLowestPointDistance : cameraToSeaLevelDistance;

        // Find the distance from the center point [width/2 + offset.x, height/2 + offset.y] to the
        // center top point [width/2 + offset.x, 0] in Z units, using the law of sines.
        // 1 Z unit is equivalent to 1 horizontal px at the center of the map
        // (the distance between[width/2, height/2] and [width/2 + 1, height/2])
        const groundAngle = Math.PI / 2 + this._pitch;
        const fovAboveCenter = this._fov * (0.5 + offset.y / this.height);
        const topHalfSurfaceDistance = Math.sin(fovAboveCenter) * lowestPlane / Math.sin(clamp(Math.PI - groundAngle - fovAboveCenter, 0.01, Math.PI - 0.01));

        // Find the distance from the center point to the horizon
        const horizon = this.getHorizon();
        const horizonAngle = Math.atan(horizon / this.cameraToCenterDistance);
        const fovCenterToHorizon = 2 * horizonAngle * (0.5 + offset.y / (horizon * 2));
        const topHalfSurfaceDistanceHorizon = Math.sin(fovCenterToHorizon) * lowestPlane / Math.sin(clamp(Math.PI - groundAngle - fovCenterToHorizon, 0.01, Math.PI - 0.01));

        // Calculate z distance of the farthest fragment that should be rendered.
        // Add a bit extra to avoid precision problems when a fragment's distance is exactly `furthestDistance`
        const topHalfMinDistance = Math.min(topHalfSurfaceDistance, topHalfSurfaceDistanceHorizon);
        this.farZ = (Math.cos(Math.PI / 2 - this._pitch) * topHalfMinDistance + lowestPlane) * 1.01;

        // The larger the value of nearZ is
        // - the more depth precision is available for features (good)
        // - clipping starts appearing sooner when the camera is close to 3d features (bad)
        //
        // Other values work for mapbox-gl-js but deck.gl was encountering precision issues
        // when rendering custom layers. This value was experimentally chosen and
        // seems to solve z-fighting issues in deck.gl while not clipping buildings too close to the camera.
        this.nearZ = this.height / 50;

        // matrix for conversion from location to clip space(-1 .. 1)
        m = new Float64Array(16) as any;
        mat4.perspective(m, this._fov, this.width / this.height, this.nearZ, this.farZ);

        // Apply center of perspective offset
        m[8] = -offset.x * 2 / this.width;
        m[9] = offset.y * 2 / this.height;
        this.projectionMatrix = mat4.clone(m);

        mat4.scale(m, m, [1, -1, 1]);
        mat4.translate(m, m, [0, 0, -this.cameraToCenterDistance]);
        mat4.rotateX(m, m, this._pitch);
        mat4.rotateZ(m, m, this.angle);
        mat4.translate(m, m, [-x, -y, 0]);

        // The mercatorMatrix can be used to transform points from mercator coordinates
        // ([0, 0] nw, [1, 1] se) to clip space.
        this.mercatorMatrix = mat4.scale([] as any, m, [this.worldSize, this.worldSize, this.worldSize]);

        // scale vertically to meters per pixel (inverse of ground resolution):
        mat4.scale(m, m, [1, 1, this._pixelPerMeter]);

        // matrix for conversion from world space to screen coordinates in 2D
        this.pixelMatrix = mat4.multiply(new Float64Array(16) as any, this.labelPlaneMatrix, m);

        // matrix for conversion from world space to clip space (-1 .. 1)
        mat4.translate(m, m, [0, 0, -this.elevation]); // elevate camera over terrain
        this.modelViewProjectionMatrix = m;
        this.invModelViewProjectionMatrix = mat4.invert([] as any, m);

        // create a fog matrix, same es proj-matrix but with near clipping-plane in mapcenter
        // needed to calculate a correct z-value for fog calculation, because projMatrix z value is not
        this.fogMatrix = new Float64Array(16) as any;
        mat4.perspective(this.fogMatrix, this._fov, this.width / this.height, cameraToSeaLevelDistance, this.farZ);
        this.fogMatrix[8] = -offset.x * 2 / this.width;
        this.fogMatrix[9] = offset.y * 2 / this.height;
        mat4.scale(this.fogMatrix, this.fogMatrix, [1, -1, 1]);
        mat4.translate(this.fogMatrix, this.fogMatrix, [0, 0, -this.cameraToCenterDistance]);
        mat4.rotateX(this.fogMatrix, this.fogMatrix, this._pitch);
        mat4.rotateZ(this.fogMatrix, this.fogMatrix, this.angle);
        mat4.translate(this.fogMatrix, this.fogMatrix, [-x, -y, 0]);
        mat4.scale(this.fogMatrix, this.fogMatrix, [1, 1, this._pixelPerMeter]);
        mat4.translate(this.fogMatrix, this.fogMatrix, [0, 0, -this.elevation]); // elevate camera over terrain

        // matrix for conversion from world space to screen coordinates in 3D
        this.pixelMatrix3D = mat4.multiply(new Float64Array(16) as any, this.labelPlaneMatrix, m);

        // Make a second projection matrix that is aligned to a pixel grid for rendering raster tiles.
        // We're rounding the (floating point) x/y values to achieve to avoid rendering raster images to fractional
        // coordinates. Additionally, we adjust by half a pixel in either direction in case that viewport dimension
        // is an odd integer to preserve rendering to the pixel grid. We're rotating this shift based on the angle
        // of the transformation so that 0°, 90°, 180°, and 270° rasters are crisp, and adjust the shift so that
        // it is always <= 0.5 pixels.
        const xShift = (this.width % 2) / 2, yShift = (this.height % 2) / 2,
            angleCos = Math.cos(this.angle), angleSin = Math.sin(this.angle),
            dx = x - Math.round(x) + angleCos * xShift + angleSin * yShift,
            dy = y - Math.round(y) + angleCos * yShift + angleSin * xShift;
        const alignedM = new Float64Array(m) as any as mat4;
        mat4.translate(alignedM, alignedM, [dx > 0.5 ? dx - 1 : dx, dy > 0.5 ? dy - 1 : dy, 0]);
        this.alignedModelViewProjectionMatrix = alignedM;

        // inverse matrix for conversion from screen coordinates to location
        m = mat4.invert(new Float64Array(16) as any, this.pixelMatrix);
        if (!m) throw new Error('failed to invert matrix');
        this.pixelMatrixInverse = m;

        this._posMatrixCache = {};
        this._alignedPosMatrixCache = {};
        this._fogMatrixCache = {};
    }

    maxPitchScaleFactor() {
        // calcMatrices hasn't run yet
        if (!this.pixelMatrixInverse) return 1;

        const coord = this.pointCoordinate(new Point(0, 0));
        const p = [coord.x * this.worldSize, coord.y * this.worldSize, 0, 1] as vec4;
        const topPoint = vec4.transformMat4(p, p, this.pixelMatrix);
        return topPoint[3] / this.cameraToCenterDistance;
    }

    /**
     * The camera looks at the map from a 3D (lng, lat, altitude) location. Let's use `cameraLocation`
     * as the name for the location under the camera and on the surface of the earth (lng, lat, 0).
     * `cameraPoint` is the projected position of the `cameraLocation`.
     *
     * This point is useful to us because only fill-extrusions that are between `cameraPoint` and
     * the query point on the surface of the earth can extend and intersect the query.
     *
     * When the map is not pitched the `cameraPoint` is equivalent to the center of the map because
     * the camera is right above the center of the map.
     */
    getCameraPoint() {
        const pitch = this._pitch;
        const yOffset = Math.tan(pitch) * (this.cameraToCenterDistance || 1);
        return this.centerPoint.add(new Point(0, yOffset));
    }

    /**
     * When the map is pitched, some of the 3D features that intersect a query will not intersect
     * the query at the surface of the earth. Instead the feature may be closer and only intersect
     * the query because it extrudes into the air.
     * @param queryGeometry - For point queries, the line from the query point to the "camera point",
     * for other geometries, the envelope of the query geometry and the "camera point"
     * @returns a geometry that includes all of the original query as well as all possible ares of the
     * screen where the *base* of a visible extrusion could be.
     *
     */
    getCameraQueryGeometry(queryGeometry: Array<Point>): Array<Point> {
        const c = this.getCameraPoint();

        if (queryGeometry.length === 1) {
            return [queryGeometry[0], c];
        } else {
            let minX = c.x;
            let minY = c.y;
            let maxX = c.x;
            let maxY = c.y;
            for (const p of queryGeometry) {
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x);
                maxY = Math.max(maxY, p.y);
            }
            return [
                new Point(minX, minY),
                new Point(maxX, minY),
                new Point(maxX, maxY),
                new Point(minX, maxY),
                new Point(minX, minY)
            ];
        }
    }
    /**
     * Return the distance to the camera in clip space from a LngLat.
     * This can be compared to the value from the depth buffer (terrain.depthAtPoint)
     * to determine whether a point is occluded.
     * @param lngLat - the point
     * @param elevation - the point's elevation
     * @returns depth value in clip space (between 0 and 1)
     */
    lngLatToCameraDepth(lngLat: LngLat, elevation: number) {
        const coord = this.locationCoordinate(lngLat);
        const p = [coord.x * this.worldSize, coord.y * this.worldSize, elevation, 1] as vec4;
        vec4.transformMat4(p, p, this.modelViewProjectionMatrix);
        return (p[2] / p[3]);
    }
}
