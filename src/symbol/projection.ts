import Point from '@mapbox/point-geometry';

import {mat2, mat4, vec2, vec4} from 'gl-matrix';
import * as symbolSize from './symbol_size';
import {addDynamicAttributes} from '../data/bucket/symbol_bucket';

import type {Painter} from '../render/painter';
import type {IReadonlyTransform} from '../geo/transform_interface';
import type {SymbolBucket} from '../data/bucket/symbol_bucket';
import type {
    GlyphOffsetArray,
    SymbolLineVertexArray,
    SymbolDynamicLayoutArray
} from '../data/array_types.g';
import {WritingMode} from '../symbol/shaping';
import {findLineIntersection} from '../util/util';
import {type UnwrappedTileID} from '../source/tile_id';
import {type StructArray} from '../util/struct_array';

/**
 * The result of projecting a point to the screen, with some additional information about the projection.
 */
export type PointProjection = {
    /**
     * The projected point.
     */
    point: Point;
    /**
     * The original W component of the projection.
     */
    signedDistanceFromCamera: number;
    /**
     * For complex projections (such as globe), true if the point is occluded by the projection, such as by being on the backfacing side of the globe.
     * If the point is simply beyond the edge of the screen, this should NOT be set to false.
     */
    isOccluded: boolean;
};

/*
 * # Overview of coordinate spaces
 *
 * ## Tile coordinate spaces
 * Each label has an anchor. Some labels have corresponding line geometries.
 * The points for both anchors and lines are stored in tile units. Each tile has it's own
 * coordinate space going from (0, 0) at the top left to (EXTENT, EXTENT) at the bottom right.
 *
 * ## Clip space (GL coordinate space)
 * At the end of everything, the vertex shader needs to produce a position in clip space,
 * which is (-1, 1) at the top left and (1, -1) in the bottom right.
 * In the depth buffer, values are between 0 (near plane) to 1 (far plane).
 *
 * ## Map pixel coordinate spaces
 * Each tile has a pixel coordinate space. It's just the tile units scaled so that one unit is
 * whatever counts as 1 pixel at the current zoom.
 * This space is used for pitch-alignment=map, rotation-alignment=map
 *
 * ## Rotated map pixel coordinate spaces
 * Like the above, but rotated so axis of the space are aligned with the viewport instead of the tile.
 * This space is used for pitch-alignment=map, rotation-alignment=viewport
 *
 * ## Viewport pixel coordinate space
 * (0, 0) is at the top left of the canvas and (pixelWidth, pixelHeight) is at the bottom right corner
 * of the canvas. This space is used for pitch-alignment=viewport
 *
 *
 * # Vertex projection
 * It goes roughly like this:
 * 1. project the anchor and line from tile units into the correct label coordinate space
 *      - map pixel space           pitch-alignment=map         rotation-alignment=map
 *      - rotated map pixel space   pitch-alignment=map         rotation-alignment=viewport
 *      - viewport pixel space      pitch-alignment=viewport    rotation-alignment=*
 * 2. if the label follows a line, find the point along the line that is the correct distance from the anchor.
 * 3. add the glyph's corner offset to the point from step 3
 * 4. convert from the label coordinate space to clip space
 *
 * For horizontal labels we want to do step 1 in the shader for performance reasons (no cpu work).
 *      This is what `u_label_plane_matrix` is used for.
 * For labels aligned with lines we have to steps 1 and 2 on the cpu since we need access to the line geometry.
 *      This is what `updateLineLabels(...)` does.
 *      Since the conversion is handled on the cpu we just set `u_label_plane_matrix` to an identity matrix.
 *
 * Steps 3 and 4 are done in the shaders for all labels.
 *
 *
 * # Custom projection handling
 * Note that since MapLibre now supports more than one projection, the transformation
 * to viewport pixel space and GL clip space now *must* go through the projection's (`transform`'s)
 * `projectTileCoordinates` function, since it might do nontrivial transformations.
 *
 * Hence projecting anything to a symbol's label plane can no longer be handled by a simple matrix,
 * since, if the symbol's label plane is viewport pixel space, `projectTileCoordinates` must be used.
 * This is applies both here and in the symbol vertex shaders.
 */

export function getPitchedLabelPlaneMatrix(
    rotateWithMap: boolean,
    transform: IReadonlyTransform,
    pixelsToTileUnits: number) {
    const m = mat4.create();
    if (!rotateWithMap) {
        const {vecSouth, vecEast} = getTileSkewVectors(transform);
        const skew = mat2.create();
        skew[0] = vecEast[0];
        skew[1] = vecEast[1];
        skew[2] = vecSouth[0];
        skew[3] = vecSouth[1];
        mat2.invert(skew, skew);
        m[0] = skew[0];
        m[1] = skew[1];
        m[4] = skew[2];
        m[5] = skew[3];
    }
    mat4.scale(m, m, [1 / pixelsToTileUnits, 1 / pixelsToTileUnits, 1]);
    return m;
}

/*
 * Returns a matrix for either converting from pitched label space to tile space,
 * or for converting from screenspace pixels to clip space.
 */
export function getGlCoordMatrix(
    pitchWithMap: boolean,
    rotateWithMap: boolean,
    transform: IReadonlyTransform,
    pixelsToTileUnits: number) {
    if (pitchWithMap) {
        const m = mat4.create();
        if (!rotateWithMap) {
            const {vecSouth, vecEast} = getTileSkewVectors(transform);
            m[0] = vecEast[0];
            m[1] = vecEast[1];
            m[4] = vecSouth[0];
            m[5] = vecSouth[1];
        }
        mat4.scale(m, m, [pixelsToTileUnits, pixelsToTileUnits, 1]);
        return m;
    } else {
        return transform.pixelsToClipSpaceMatrix;
    }
}

export function getTileSkewVectors(transform: IReadonlyTransform): {vecEast: vec2; vecSouth: vec2} {
    const cosRoll = Math.cos(transform.rollInRadians);
    const sinRoll = Math.sin(transform.rollInRadians);
    const cosPitch = Math.cos(transform.pitchInRadians);
    const cosBearing = Math.cos(transform.bearingInRadians);
    const sinBearing = Math.sin(transform.bearingInRadians);
    const vecSouth = vec2.create();
    vecSouth[0] = -cosBearing * cosPitch * sinRoll - sinBearing * cosRoll;
    vecSouth[1] = -sinBearing * cosPitch * sinRoll + cosBearing * cosRoll;
    const vecSouthLen = vec2.length(vecSouth);
    if (vecSouthLen < 1.0e-9) {
        vec2.zero(vecSouth);
    } else {
        vec2.scale(vecSouth, vecSouth, 1 / vecSouthLen);
    }
    const vecEast = vec2.create();
    vecEast[0] = cosBearing * cosPitch * cosRoll - sinBearing * sinRoll;
    vecEast[1] = sinBearing * cosPitch * cosRoll + cosBearing * sinRoll;
    const vecEastLen = vec2.length(vecEast);
    if (vecEastLen < 1.0e-9) {
        vec2.zero(vecEast);
    } else {
        vec2.scale(vecEast, vecEast, 1 / vecEastLen);
    }

    return {vecEast, vecSouth};
}

/**
 * Projects a point using a specified matrix, including the perspective divide.
 * Uses a fast path if `getElevation` is undefined.
 */
export function projectWithMatrix(x: number, y: number, matrix: mat4, getElevation?: (x: number, y: number) => number): PointProjection {
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

export function getPerspectiveRatio(cameraToCenterDistance: number, signedDistanceFromCamera: number): number {
    return 0.5 + 0.5 * (cameraToCenterDistance / signedDistanceFromCamera);
}

function isVisible(p: Point,
    clippingBuffer: [number, number]) {
    const inPaddedViewport = (
        p.x >= -clippingBuffer[0] &&
        p.x <= clippingBuffer[0] &&
        p.y >= -clippingBuffer[1] &&
        p.y <= clippingBuffer[1]);
    return inPaddedViewport;
}

/*
 *  Update the `dynamicLayoutVertexBuffer` for the buffer with the correct glyph positions for the current map view.
 *  This is only run on labels that are aligned with lines. Horizontal labels are handled entirely in the shader.
 */
export function updateLineLabels(bucket: SymbolBucket,
    painter: Painter,
    isText: boolean,
    pitchedLabelPlaneMatrix: mat4,
    pitchedLabelPlaneMatrixInverse: mat4,
    pitchWithMap: boolean,
    keepUpright: boolean,
    rotateToLine: boolean,
    unwrappedTileID: UnwrappedTileID,
    viewportWidth: number,
    viewportHeight: number,
    translation: [number, number],
    getElevation: (x: number, y: number) => number) {

    const sizeData = isText ? bucket.textSizeData : bucket.iconSizeData;
    const partiallyEvaluatedSize = symbolSize.evaluateSizeForZoom(sizeData, painter.transform.zoom);

    const clippingBuffer: [number, number] = [256 / painter.width * 2 + 1, 256 / painter.height * 2 + 1];

    const dynamicLayoutVertexArray = isText ?
        bucket.text.dynamicLayoutVertexArray :
        bucket.icon.dynamicLayoutVertexArray;
    dynamicLayoutVertexArray.clear();

    const lineVertexArray = bucket.lineVertexArray;
    const placedSymbols = isText ? bucket.text.placedSymbolArray : bucket.icon.placedSymbolArray;

    const aspectRatio = painter.transform.width / painter.transform.height;

    let useVertical = false;

    for (let s = 0; s < placedSymbols.length; s++) {
        const symbol = placedSymbols.get(s);

        // Don't do calculations for vertical glyphs unless the previous symbol was horizontal
        // and we determined that vertical glyphs were necessary.
        // Also don't do calculations for symbols that are collided and fully faded out
        if (symbol.hidden || symbol.writingMode === WritingMode.vertical && !useVertical) {
            hideGlyphs(symbol.numGlyphs, dynamicLayoutVertexArray);
            continue;
        }
        // Awkward... but we're counting on the paired "vertical" symbol coming immediately after its horizontal counterpart
        useVertical = false;

        const tileAnchorPoint = new Point(symbol.anchorX, symbol.anchorY);
        const projectionCache: ProjectionCache = {projections: {}, offsets: {}, cachedAnchorPoint: undefined, anyProjectionOccluded: false};

        const projectionContext: SymbolProjectionContext = {
            getElevation,
            pitchedLabelPlaneMatrix,
            lineVertexArray,
            pitchWithMap,
            projectionCache,
            transform: painter.transform,
            tileAnchorPoint,
            unwrappedTileID,
            width: viewportWidth,
            height: viewportHeight,
            translation
        };

        const anchorPos = projectTileCoordinatesToClipSpace(symbol.anchorX, symbol.anchorY, projectionContext);

        // Don't bother calculating the correct point for invisible labels.
        if (!isVisible(anchorPos.point, clippingBuffer)) {
            hideGlyphs(symbol.numGlyphs, dynamicLayoutVertexArray);
            continue;
        }

        const cameraToAnchorDistance = anchorPos.signedDistanceFromCamera;
        const perspectiveRatio = getPerspectiveRatio(painter.transform.cameraToCenterDistance, cameraToAnchorDistance);

        const fontSize = symbolSize.evaluateSizeForFeature(sizeData, partiallyEvaluatedSize, symbol);
        const pitchScaledFontSize = pitchWithMap ? (fontSize * painter.transform.getPitchedTextCorrection(symbol.anchorX, symbol.anchorY, unwrappedTileID) / perspectiveRatio) : fontSize * perspectiveRatio;

        const placeUnflipped = placeGlyphsAlongLine({
            projectionContext,
            pitchedLabelPlaneMatrixInverse,
            symbol,
            fontSize: pitchScaledFontSize,
            flip: false,
            keepUpright,
            glyphOffsetArray: bucket.glyphOffsetArray,
            dynamicLayoutVertexArray,
            aspectRatio,
            rotateToLine,
        });

        useVertical = placeUnflipped.useVertical;

        if (placeUnflipped.notEnoughRoom || useVertical ||
            (placeUnflipped.needsFlipping &&
                placeGlyphsAlongLine({
                    projectionContext,
                    pitchedLabelPlaneMatrixInverse,
                    symbol,
                    fontSize: pitchScaledFontSize,
                    flip: true, // flipped
                    keepUpright,
                    glyphOffsetArray: bucket.glyphOffsetArray,
                    dynamicLayoutVertexArray,
                    aspectRatio,
                    rotateToLine,
                }).notEnoughRoom)) {
            hideGlyphs(symbol.numGlyphs, dynamicLayoutVertexArray);
        }
    }

    if (isText) {
        bucket.text.dynamicLayoutVertexBuffer.updateData(dynamicLayoutVertexArray);
    } else {
        bucket.icon.dynamicLayoutVertexBuffer.updateData(dynamicLayoutVertexArray);
    }
}

type FirstAndLastGlyphPlacement = {
    first: PlacedGlyph;
    last: PlacedGlyph;
} | null;

/*
 * Place the first and last glyph of a line label, projected to the label plane.
 * This function is called both during collision detection (to determine the label's size)
 * and during line label rendering (to make sure the label fits on the line geometry with
 * the current camera position, which may differ from the position used during collision detection).
 *
 * Calling this function has the effect of populating the "projectionCache" with all projected
 * vertex locations the label will need, making future calls to placeGlyphAlongLine (for all the
 * intermediate glyphs) much cheaper.
 *
 * Returns null if the label can't fit on the geometry
 */
export function placeFirstAndLastGlyph(
    fontScale: number,
    glyphOffsetArray: GlyphOffsetArray,
    lineOffsetX: number,
    lineOffsetY: number,
    flip: boolean,
    symbol: any,
    rotateToLine: boolean,
    projectionContext: SymbolProjectionContext): FirstAndLastGlyphPlacement {
    const glyphEndIndex = symbol.glyphStartIndex + symbol.numGlyphs;
    const lineStartIndex = symbol.lineStartIndex;
    const lineEndIndex = symbol.lineStartIndex + symbol.lineLength;

    const firstGlyphOffset = glyphOffsetArray.getoffsetX(symbol.glyphStartIndex);
    const lastGlyphOffset = glyphOffsetArray.getoffsetX(glyphEndIndex - 1);

    const firstPlacedGlyph = placeGlyphAlongLine(fontScale * firstGlyphOffset, lineOffsetX, lineOffsetY, flip, symbol.segment,
        lineStartIndex, lineEndIndex, projectionContext, rotateToLine);
    if (!firstPlacedGlyph)
        return null;

    const lastPlacedGlyph = placeGlyphAlongLine(fontScale * lastGlyphOffset, lineOffsetX, lineOffsetY, flip, symbol.segment,
        lineStartIndex, lineEndIndex, projectionContext, rotateToLine);
    if (!lastPlacedGlyph)
        return null;

    if (projectionContext.projectionCache.anyProjectionOccluded) {
        return null;
    }

    return {first: firstPlacedGlyph, last: lastPlacedGlyph};
}

type OrientationChangeType = {
    useVertical?: boolean;
    needsFlipping?: boolean;
};

function requiresOrientationChange(writingMode, firstPoint, lastPoint, aspectRatio): OrientationChangeType {
    if (writingMode === WritingMode.horizontal) {
        // On top of choosing whether to flip, choose whether to render this version of the glyphs or the alternate
        // vertical glyphs. We can't just filter out vertical glyphs in the horizontal range because the horizontal
        // and vertical versions can have slightly different projections which could lead to angles where both or
        // neither showed.
        const rise = Math.abs(lastPoint.y - firstPoint.y);
        const run = Math.abs(lastPoint.x - firstPoint.x) * aspectRatio;
        if (rise > run) {
            return {useVertical: true};
        }
    }

    if (writingMode === WritingMode.vertical ? firstPoint.y < lastPoint.y : firstPoint.x > lastPoint.x) {
        // Includes "horizontalOnly" case for labels without vertical glyphs
        return {needsFlipping: true};
    }

    return null;
}

type GlyphLinePlacementResult = OrientationChangeType & {
    notEnoughRoom?: boolean;
}

type GlyphLinePlacementArgs = {
    projectionContext: SymbolProjectionContext;
    pitchedLabelPlaneMatrixInverse: mat4;
    symbol: any; // PlacedSymbolStruct
    fontSize: number;
    flip: boolean;
    keepUpright: boolean;
    glyphOffsetArray: GlyphOffsetArray;
    dynamicLayoutVertexArray: StructArray;
    aspectRatio: number;
    rotateToLine: boolean;
}

/*
* Place first and last glyph along the line projected to label plane, and if they fit
* iterate through all the intermediate glyphs, calculating their label plane positions
* from the projected line.
*
* Finally, add resulting glyph position calculations to dynamicLayoutVertexArray for
* upload to the GPU
*/
function placeGlyphsAlongLine(args: GlyphLinePlacementArgs): GlyphLinePlacementResult {
    const {
        projectionContext,
        pitchedLabelPlaneMatrixInverse,
        symbol,
        fontSize,
        flip,
        keepUpright,
        glyphOffsetArray,
        dynamicLayoutVertexArray,
        aspectRatio,
        rotateToLine
    } = args;

    const fontScale = fontSize / 24;
    const lineOffsetX = symbol.lineOffsetX * fontScale;
    const lineOffsetY = symbol.lineOffsetY * fontScale;

    let placedGlyphs;
    if (symbol.numGlyphs > 1) {
        const glyphEndIndex = symbol.glyphStartIndex + symbol.numGlyphs;
        const lineStartIndex = symbol.lineStartIndex;
        const lineEndIndex = symbol.lineStartIndex + symbol.lineLength;

        // Place the first and the last glyph in the label first, so we can figure out
        // the overall orientation of the label and determine whether it needs to be flipped in keepUpright mode
        // Note: these glyphs are placed onto the label plane
        const firstAndLastGlyph = placeFirstAndLastGlyph(fontScale, glyphOffsetArray, lineOffsetX, lineOffsetY, flip, symbol, rotateToLine, projectionContext);
        if (!firstAndLastGlyph) {
            return {notEnoughRoom: true};
        }
        const firstPoint = projectFromLabelPlaneToClipSpace(firstAndLastGlyph.first.point.x, firstAndLastGlyph.first.point.y, projectionContext, pitchedLabelPlaneMatrixInverse);
        const lastPoint = projectFromLabelPlaneToClipSpace(firstAndLastGlyph.last.point.x, firstAndLastGlyph.last.point.y, projectionContext, pitchedLabelPlaneMatrixInverse);

        if (keepUpright && !flip) {
            const orientationChange = requiresOrientationChange(symbol.writingMode, firstPoint, lastPoint, aspectRatio);
            if (orientationChange) {
                return orientationChange;
            }
        }

        placedGlyphs = [firstAndLastGlyph.first];
        for (let glyphIndex = symbol.glyphStartIndex + 1; glyphIndex < glyphEndIndex - 1; glyphIndex++) {
            // Since first and last glyph fit on the line, try placing the rest of the glyphs.
            const placedGlyph = placeGlyphAlongLine(fontScale * glyphOffsetArray.getoffsetX(glyphIndex), lineOffsetX, lineOffsetY, flip, symbol.segment,
                lineStartIndex, lineEndIndex, projectionContext, rotateToLine);
            if (!placedGlyph) {
                return {notEnoughRoom: true};
            }
            placedGlyphs.push(placedGlyph);
        }
        placedGlyphs.push(firstAndLastGlyph.last);
    } else {
        // Only a single glyph to place
        // So, determine whether to flip based on projected angle of the line segment it's on
        if (keepUpright && !flip) {
            const a = projectTileCoordinatesToLabelPlane(projectionContext.tileAnchorPoint.x, projectionContext.tileAnchorPoint.y, projectionContext).point;
            const tileVertexIndex = (symbol.lineStartIndex + symbol.segment + 1);
            const tileSegmentEnd = new Point(projectionContext.lineVertexArray.getx(tileVertexIndex), projectionContext.lineVertexArray.gety(tileVertexIndex));
            const projectedVertex = projectTileCoordinatesToLabelPlane(tileSegmentEnd.x, tileSegmentEnd.y, projectionContext);
            // We know the anchor will be in the viewport, but the end of the line segment may be
            // behind the plane of the camera, in which case we can use a point at any arbitrary (closer)
            // point on the segment.
            const b = (projectedVertex.signedDistanceFromCamera > 0) ?
                projectedVertex.point :
                projectTruncatedLineSegmentToLabelPlane(projectionContext.tileAnchorPoint, tileSegmentEnd, a, 1, projectionContext);

            const clipSpaceA = projectFromLabelPlaneToClipSpace(a.x, a.y, projectionContext, pitchedLabelPlaneMatrixInverse);
            const clipSpaceB = projectFromLabelPlaneToClipSpace(b.x, b.y, projectionContext, pitchedLabelPlaneMatrixInverse);

            const orientationChange = requiresOrientationChange(symbol.writingMode, clipSpaceA, clipSpaceB, aspectRatio);
            if (orientationChange) {
                return orientationChange;
            }
        }
        const singleGlyph = placeGlyphAlongLine(fontScale * glyphOffsetArray.getoffsetX(symbol.glyphStartIndex), lineOffsetX, lineOffsetY, flip, symbol.segment,
            symbol.lineStartIndex, symbol.lineStartIndex + symbol.lineLength, projectionContext, rotateToLine);
        if (!singleGlyph || projectionContext.projectionCache.anyProjectionOccluded)
            return {notEnoughRoom: true};

        placedGlyphs = [singleGlyph];
    }

    for (const glyph of placedGlyphs) {
        addDynamicAttributes(dynamicLayoutVertexArray, glyph.point, glyph.angle);
    }
    return {};
}

/**
 * Takes a line and direction from `previousTilePoint` to `currentTilePoint`, projects it to the correct label plane,
 * and returns a projected point along this projected line that is `minimumLength` distance away from `previousProjectedPoint`.
 * Projects a "virtual" vertex along a line segment.
 * @param previousTilePoint - Line start point, in tile coordinates.
 * @param currentTilePoint - Line end point, in tile coordinates.
 * @param previousProjectedPoint - Projection of `previousTilePoint` into label plane
 * @param minimumLength - Distance in the projected space along the line for the returned point.
 * @param projectionContext - Projection context, used to get terrain's `getElevation`, and to project the points to screen pixels.
 */
function projectTruncatedLineSegmentToLabelPlane(previousTilePoint: Point, currentTilePoint: Point, previousProjectedPoint: Point, minimumLength: number, projectionContext: SymbolProjectionContext) {
    // We are assuming "previousTilePoint" won't project to a point within one unit of the camera plane
    // If it did, that would mean our label extended all the way out from within the viewport to a (very distant)
    // point near the plane of the camera. We wouldn't be able to render the label anyway once it crossed the
    // plane of the camera.
    const unitVertexToBeProjected = previousTilePoint.add(previousTilePoint.sub(currentTilePoint)._unit());
    const projectedUnitVertex = projectTileCoordinatesToLabelPlane(unitVertexToBeProjected.x, unitVertexToBeProjected.y, projectionContext).point;
    const projectedUnitSegment = previousProjectedPoint.sub(projectedUnitVertex);
    return previousProjectedPoint.add(projectedUnitSegment._mult(minimumLength / projectedUnitSegment.mag()));
}

type IndexToPointCache = { [lineIndex: number]: Point };

/**
 * @internal
 * We calculate label-plane projected points for line vertices as we place glyphs along the line
 * Since we will use the same vertices for potentially many glyphs, cache the results for this bucket
 * over the course of the render. Each vertex location also potentially has one offset equivalent
 * for us to hold onto. The vertex indices are per-symbol-bucket.
 */
type ProjectionCache = {
    /**
     * tile-unit vertices projected into label-plane units
     */
    projections: IndexToPointCache;
    /**
     * label-plane vertices which have been shifted to follow an offset line
     */
    offsets: IndexToPointCache;
    /**
     * Cached projected anchor point.
     */
    cachedAnchorPoint: Point | undefined;
    /**
     * Was any projected point occluded by the map itself (eg. occluded by the planet when using globe projection).
     *
     * Viewport-pitched line-following texts where *any* of the line points is hidden behind the planet curve becomes entirely hidden.
     * This is perhaps not the most ideal behavior, but it works, it is simple and planetary-scale texts such as this seem to be a rare edge case.
     */
    anyProjectionOccluded: boolean;
};

/**
 * @internal
 * Arguments necessary to project a vertex to the label plane
 */
export type SymbolProjectionContext = {
    /**
     * Used to cache results, save cost if projecting the same vertex multiple times
     */
    projectionCache: ProjectionCache;
    /**
     * The array of tile-unit vertices transferred from worker
     */
    lineVertexArray: SymbolLineVertexArray;
    /**
     * Matrix for transforming from pixels (symbol shaping) to potentially rotated tile units (pitched map label plane).
     */
    pitchedLabelPlaneMatrix: mat4;
    /**
     * Function to get elevation at a point
     * @param x - the x coordinate
     * @param y - the y coordinate
    */
    getElevation: (x: number, y: number) => number;
    /**
     * Only for creating synthetic vertices if vertex would otherwise project behind plane of camera,
     * but still convenient to pass it inside this type.
     */
    tileAnchorPoint: Point;
    /**
     * True when line glyphs are projected onto the map, instead of onto the viewport.
     */
    pitchWithMap: boolean;
    transform: IReadonlyTransform;
    unwrappedTileID: UnwrappedTileID;
    /**
     * Viewport width.
     */
    width: number;
    /**
     * Viewport height.
     */
    height: number;
    /**
     * Translation in tile units, computed using text-translate and text-translate-anchor paint style properties.
     */
    translation: [number, number];
};

/**
 * Only for creating synthetic vertices if vertex would otherwise project behind plane of camera
 */
export type ProjectionSyntheticVertexArgs = {
    distanceFromAnchor: number;
    previousVertex: Point;
    direction: number;
    absOffsetX: number;
};

/**
 * Transform a vertex from tile coordinates to label plane coordinates
 * @param index - index of vertex to project
 * @param projectionContext - necessary data to project a vertex
 * @returns the vertex projected to the label plane
 */
export function projectLineVertexToLabelPlane(index: number, projectionContext: SymbolProjectionContext, syntheticVertexArgs: ProjectionSyntheticVertexArgs): Point {
    const cache = projectionContext.projectionCache;

    if (cache.projections[index]) {
        return cache.projections[index];
    }
    const currentVertex = new Point(
        projectionContext.lineVertexArray.getx(index),
        projectionContext.lineVertexArray.gety(index));

    const projection = projectTileCoordinatesToLabelPlane(currentVertex.x, currentVertex.y, projectionContext);

    if (projection.signedDistanceFromCamera > 0) {
        cache.projections[index] = projection.point;
        cache.anyProjectionOccluded = cache.anyProjectionOccluded || projection.isOccluded;
        return projection.point;
    }

    // The vertex is behind the plane of the camera, so we can't project it
    // Instead, we'll create a vertex along the line that's far enough to include the glyph
    const previousLineVertexIndex = index - syntheticVertexArgs.direction;
    const previousTilePoint = syntheticVertexArgs.distanceFromAnchor === 0 ?
        projectionContext.tileAnchorPoint :
        new Point(projectionContext.lineVertexArray.getx(previousLineVertexIndex), projectionContext.lineVertexArray.gety(previousLineVertexIndex));

    // Don't cache because the new vertex might not be far enough out for future glyphs on the same segment
    const minimumLength = syntheticVertexArgs.absOffsetX - syntheticVertexArgs.distanceFromAnchor + 1;
    return projectTruncatedLineSegmentToLabelPlane(previousTilePoint, currentVertex, syntheticVertexArgs.previousVertex, minimumLength, projectionContext);
}

/**
 * Projects the given point in tile coordinates to the correct label plane.
 * If pitchWithMap is true, the (rotated) map plane in pixels is used,
 * otherwise screen pixels are used.
 */
export function projectTileCoordinatesToLabelPlane(x: number, y: number, projectionContext: SymbolProjectionContext): PointProjection {
    const translatedX = x + projectionContext.translation[0];
    const translatedY = y + projectionContext.translation[1];
    let projection;
    if (projectionContext.pitchWithMap) {
        projection = projectWithMatrix(translatedX, translatedY, projectionContext.pitchedLabelPlaneMatrix, projectionContext.getElevation);
        projection.isOccluded = false;
    } else {
        projection = projectionContext.transform.projectTileCoordinates(translatedX, translatedY, projectionContext.unwrappedTileID, projectionContext.getElevation);
        projection.point.x = (projection.point.x * 0.5 + 0.5) * projectionContext.width;
        projection.point.y = (-projection.point.y * 0.5 + 0.5) * projectionContext.height;
    }
    return projection;
}

function projectFromLabelPlaneToClipSpace(x: number, y: number, projectionContext: SymbolProjectionContext, pitchedLabelPlaneMatrixInverse: mat4): {x: number; y: number} {
    if (projectionContext.pitchWithMap) {
        const pos = [x, y, 0, 1] as vec4;
        vec4.transformMat4(pos, pos, pitchedLabelPlaneMatrixInverse);
        return projectionContext.transform.projectTileCoordinates(pos[0] / pos[3], pos[1] / pos[3], projectionContext.unwrappedTileID, projectionContext.getElevation).point;
    } else {
        return {
            x: (x / projectionContext.width) * 2.0 - 1.0,
            y: (y / projectionContext.height) * 2.0 - 1.0
        };
    }
}

/**
 * Projects the given point in tile coordinates to the GL clip space (-1..1).
 */
export function projectTileCoordinatesToClipSpace(x: number, y: number, projectionContext: SymbolProjectionContext): PointProjection {
    const projection = projectionContext.transform.projectTileCoordinates(x, y, projectionContext.unwrappedTileID, projectionContext.getElevation);
    return projection;
}

/**
 * Calculate the normal vector for a line segment
 * @param segmentVector - will be mutated as a tiny optimization
 * @param offset - magnitude of resulting vector
 * @param direction - direction of line traversal
 * @returns a normal vector from the segment, with magnitude equal to offset amount
 */
export function transformToOffsetNormal(segmentVector: Point, offset: number, direction: number): Point {
    return segmentVector._unit()._perp()._mult(offset * direction);
}

/**
 * Construct offset line segments for the current segment and the next segment, then extend/shrink
 * the segments until they intersect. If the segments are parallel, then they will touch with no modification.
 *
 * @param index - Index of the current vertex
 * @param prevToCurrentOffsetNormal - Normal vector of the line segment from the previous vertex to the current vertex
 * @param currentVertex - Current (non-offset) vertex projected to the label plane
 * @param lineStartIndex - Beginning index for the line this label is on
 * @param lineEndIndex - End index for the line this label is on
 * @param offsetPreviousVertex - The previous vertex projected to the label plane, and then offset along the previous segments normal
 * @param lineOffsetY - Magnitude of the offset
 * @param projectionContext - Necessary data for tile-to-label-plane projection
 * @returns The point at which the current and next line segments intersect, once offset and extended/shrunk to their meeting point
 */
export function findOffsetIntersectionPoint(
    index: number,
    prevToCurrentOffsetNormal: Point,
    currentVertex: Point,
    lineStartIndex: number,
    lineEndIndex: number,
    offsetPreviousVertex: Point,
    lineOffsetY: number,
    projectionContext: SymbolProjectionContext,
    syntheticVertexArgs: ProjectionSyntheticVertexArgs) {
    if (projectionContext.projectionCache.offsets[index]) {
        return projectionContext.projectionCache.offsets[index];
    }

    const offsetCurrentVertex = currentVertex.add(prevToCurrentOffsetNormal);

    if (index + syntheticVertexArgs.direction < lineStartIndex || index + syntheticVertexArgs.direction >= lineEndIndex) {
        // This is the end of the line, no intersection to calculate
        projectionContext.projectionCache.offsets[index] = offsetCurrentVertex;
        return offsetCurrentVertex;
    }
    // Offset the vertices for the next segment
    const nextVertex = projectLineVertexToLabelPlane(index + syntheticVertexArgs.direction, projectionContext, syntheticVertexArgs);
    const currentToNextOffsetNormal = transformToOffsetNormal(nextVertex.sub(currentVertex), lineOffsetY, syntheticVertexArgs.direction);
    const offsetNextSegmentBegin = currentVertex.add(currentToNextOffsetNormal);
    const offsetNextSegmentEnd = nextVertex.add(currentToNextOffsetNormal);

    // find the intersection of these two lines
    // if the lines are parallel, offsetCurrent/offsetNextBegin will touch
    projectionContext.projectionCache.offsets[index] = findLineIntersection(offsetPreviousVertex, offsetCurrentVertex, offsetNextSegmentBegin, offsetNextSegmentEnd) || offsetCurrentVertex;

    return projectionContext.projectionCache.offsets[index];
}

/**
 * Placed Glyph type
 */
type PlacedGlyph = {
    /**
     * The point at which the glyph should be placed, in label plane coordinates
     */
    point: Point;
    /**
     * The angle at which the glyph should be placed
     */
    angle: number;
    /**
     * The label-plane path used to reach this glyph: used only for collision detection
     */
    path: Array<Point>;
};

/*
 * Place a single glyph along its line, projected into the label plane, by iterating outward
 * from the anchor point until the distance traversed in the label plane equals the glyph's
 * offsetX. Returns null if the glyph can't fit on the line geometry.
 */
export function placeGlyphAlongLine(
    offsetX: number,
    lineOffsetX: number,
    lineOffsetY: number,
    flip: boolean,
    anchorSegment: number,
    lineStartIndex: number,
    lineEndIndex: number,
    projectionContext: SymbolProjectionContext,
    rotateToLine: boolean): PlacedGlyph | null {

    const combinedOffsetX = flip ?
        offsetX - lineOffsetX :
        offsetX + lineOffsetX;

    let direction = combinedOffsetX > 0 ? 1 : -1;

    let angle = 0;
    if (flip) {
        // The label needs to be flipped to keep text upright.
        // Iterate in the reverse direction.
        direction *= -1;
        angle = Math.PI;
    }

    if (direction < 0) angle += Math.PI;

    let currentIndex = direction > 0 ?
        lineStartIndex + anchorSegment :
        lineStartIndex + anchorSegment + 1;

    // Project anchor point to viewport and cache it
    let anchorPoint: Point;

    if (projectionContext.projectionCache.cachedAnchorPoint) {
        anchorPoint = projectionContext.projectionCache.cachedAnchorPoint;
    } else {
        anchorPoint = projectTileCoordinatesToLabelPlane(projectionContext.tileAnchorPoint.x, projectionContext.tileAnchorPoint.y, projectionContext).point;
        projectionContext.projectionCache.cachedAnchorPoint = anchorPoint;
    }

    let currentVertex = anchorPoint;
    let previousVertex = anchorPoint;

    // offsetPrev and intersectionPoint are analogous to previousVertex and currentVertex
    // but if there's a line offset they are calculated in parallel as projection happens
    let offsetIntersectionPoint: Point;
    let offsetPreviousVertex: Point;

    let distanceFromAnchor = 0;
    let currentSegmentDistance = 0;
    const absOffsetX = Math.abs(combinedOffsetX);
    const pathVertices: Array<Point> = [];

    let currentLineSegment: Point;
    while (distanceFromAnchor + currentSegmentDistance <= absOffsetX) {
        currentIndex += direction;

        // offset does not fit on the projected line
        if (currentIndex < lineStartIndex || currentIndex >= lineEndIndex)
            return null;

        // accumulate values from last iteration
        distanceFromAnchor += currentSegmentDistance;
        previousVertex = currentVertex;
        offsetPreviousVertex = offsetIntersectionPoint;

        const syntheticVertexArgs: ProjectionSyntheticVertexArgs = {
            absOffsetX,
            direction,
            distanceFromAnchor,
            previousVertex
        };

        // find next vertex in viewport space
        currentVertex = projectLineVertexToLabelPlane(currentIndex, projectionContext, syntheticVertexArgs);
        if (lineOffsetY === 0) {
            // Store vertices for collision detection and update current segment geometry
            pathVertices.push(previousVertex);
            currentLineSegment = currentVertex.sub(previousVertex);
        } else {
            // Calculate the offset for this section
            let prevToCurrentOffsetNormal;
            const prevToCurrent = currentVertex.sub(previousVertex);
            if (prevToCurrent.mag() === 0) {
                // We are starting with our anchor point directly on the vertex, so look one vertex ahead
                // to calculate a normal
                const nextVertex = projectLineVertexToLabelPlane(currentIndex + direction, projectionContext, syntheticVertexArgs);
                prevToCurrentOffsetNormal = transformToOffsetNormal(nextVertex.sub(currentVertex), lineOffsetY, direction);
            } else {
                prevToCurrentOffsetNormal = transformToOffsetNormal(prevToCurrent, lineOffsetY, direction);
            }
            // Initialize offsetPrev on our first iteration, after that it will be pre-calculated
            if (!offsetPreviousVertex)
                offsetPreviousVertex = previousVertex.add(prevToCurrentOffsetNormal);

            offsetIntersectionPoint = findOffsetIntersectionPoint(currentIndex, prevToCurrentOffsetNormal, currentVertex, lineStartIndex, lineEndIndex, offsetPreviousVertex, lineOffsetY, projectionContext, syntheticVertexArgs);

            pathVertices.push(offsetPreviousVertex);
            currentLineSegment = offsetIntersectionPoint.sub(offsetPreviousVertex);
        }
        currentSegmentDistance = currentLineSegment.mag();
    }

    // The point is on the current segment. Interpolate to find it.
    const segmentInterpolationT = (absOffsetX - distanceFromAnchor) / currentSegmentDistance;
    const p = currentLineSegment._mult(segmentInterpolationT)._add(offsetPreviousVertex || previousVertex);

    const segmentAngle = angle + Math.atan2(currentVertex.y - previousVertex.y, currentVertex.x - previousVertex.x);

    pathVertices.push(p);

    return {
        point: p,
        angle: rotateToLine ? segmentAngle : 0.0,
        path: pathVertices
    };
}

const hiddenGlyphAttributes = new Float32Array([-Infinity, -Infinity, 0, -Infinity, -Infinity, 0, -Infinity, -Infinity, 0, -Infinity, -Infinity, 0]);

// Hide them by moving them offscreen. We still need to add them to the buffer
// because the dynamic buffer is paired with a static buffer that doesn't get updated.
export function hideGlyphs(num: number, dynamicLayoutVertexArray: SymbolDynamicLayoutArray) {
    for (let i = 0; i < num; i++) {
        const offset = dynamicLayoutVertexArray.length;
        dynamicLayoutVertexArray.resize(offset + 4);
        // Since all hidden glyphs have the same attributes, we can build up the array faster with a single call to Float32Array.set
        // for each set of four vertices, instead of calling addDynamicAttributes for each vertex.
        dynamicLayoutVertexArray.float32.set(hiddenGlyphAttributes, offset * 3);
    }
}

// For line label layout, we're not using z output and our w input is always 1
// This custom matrix transformation ignores those components to make projection faster
export function xyTransformMat4(out: vec4, a: vec4, m: mat4) {
    const x = a[0], y = a[1];
    out[0] = m[0] * x + m[4] * y + m[12];
    out[1] = m[1] * x + m[5] * y + m[13];
    out[3] = m[3] * x + m[7] * y + m[15];
    return out;
}

/**
 * Takes a path of points that was previously projected using the `pitchedLabelPlaneMatrix`
 * and projects it using the map projection's (mercator/globe...) `projectTileCoordinates` function.
 * Returns a new array of the projected points.
 * Does not modify the input array.
 */
export function projectPathSpecialProjection(projectedPath: Array<Point>, projectionContext: SymbolProjectionContext): Array<PointProjection> {
    const inverseLabelPlaneMatrix = mat4.create();
    mat4.invert(inverseLabelPlaneMatrix, projectionContext.pitchedLabelPlaneMatrix);
    return projectedPath.map(p => {
        const backProjected = projectWithMatrix(p.x, p.y, inverseLabelPlaneMatrix, projectionContext.getElevation);
        const projected = projectionContext.transform.projectTileCoordinates(
            backProjected.point.x,
            backProjected.point.y,
            projectionContext.unwrappedTileID,
            projectionContext.getElevation
        );
        projected.point.x = (projected.point.x * 0.5 + 0.5) * projectionContext.width;
        projected.point.y = (-projected.point.y * 0.5 + 0.5) * projectionContext.height;
        return projected;
    });
}

/**
 * Takes a path of points projected to screenspace, finds the longest continuous unoccluded segment of that path
 * and returns it.
 * Does not modify the input array.
 */
export function pathSlicedToLongestUnoccluded(path: Array<PointProjection>): Array<PointProjection> {
    let longestUnoccludedStart = 0;
    let longestUnoccludedLength = 0;
    let currentUnoccludedStart = 0;
    let currentUnoccludedLength = 0;
    for (let i = 0; i < path.length; i++) {
        if (path[i].isOccluded) {
            currentUnoccludedStart = i + 1;
            currentUnoccludedLength = 0;
        } else {
            currentUnoccludedLength++;
            if (currentUnoccludedLength > longestUnoccludedLength) {
                longestUnoccludedLength = currentUnoccludedLength;
                longestUnoccludedStart = currentUnoccludedStart;
            }
        }
    }
    return path.slice(longestUnoccludedStart, longestUnoccludedStart + longestUnoccludedLength);
}
