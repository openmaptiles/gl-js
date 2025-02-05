import Point from '@mapbox/point-geometry';
import UnitBezier from '@mapbox/unitbezier';
import {isOffscreenCanvasDistorted} from './offscreen_canvas_distorted';
import type {Size} from './image';
import type {WorkerGlobalScopeInterface} from './web_worker';
import {mat3, mat4, quat, vec2, type vec3, type vec4} from 'gl-matrix';
import {pixelsToTileUnits} from '../source/pixels_to_tile_units';
import {type OverscaledTileID} from '../source/tile_id';
import type {Event} from './evented';

/**
 * Returns a new 64 bit float vec4 of zeroes.
 */
export function createVec4f64(): vec4 { return new Float64Array(4) as any; }
/**
 * Returns a new 64 bit float vec3 of zeroes.
 */
export function createVec3f64(): vec3 { return new Float64Array(3) as any; }
/**
 * Returns a new 64 bit float mat4 of zeroes.
 */
export function createMat4f64(): mat4 { return new Float64Array(16) as any; }
/**
 * Returns a new 32 bit float mat4 of zeroes.
 */
export function createMat4f32(): mat4 { return new Float32Array(16) as any; }
/**
 * Returns a new 64 bit float mat4 set to identity.
 */
export function createIdentityMat4f64(): mat4 {
    const m = new Float64Array(16) as any;
    mat4.identity(m);
    return m;
}
/**
 * Returns a new 32 bit float mat4 set to identity.
 */
export function createIdentityMat4f32(): mat4 {
    const m = new Float32Array(16) as any;
    mat4.identity(m);
    return m;
}

/**
 * Returns a translation in tile units that correctly incorporates the view angle and the *-translate and *-translate-anchor properties.
 * @param inViewportPixelUnitsUnits - True when the units accepted by the matrix are in viewport pixels instead of tile units.
 */
export function translatePosition(
    transform: { bearingInRadians: number; zoom: number },
    tile: { tileID: OverscaledTileID; tileSize: number },
    translate: [number, number],
    translateAnchor: 'map' | 'viewport',
    inViewportPixelUnitsUnits: boolean = false
): [number, number] {
    if (!translate[0] && !translate[1]) return [0, 0];

    const angle = inViewportPixelUnitsUnits ?
        (translateAnchor === 'map' ? -transform.bearingInRadians : 0) :
        (translateAnchor === 'viewport' ? transform.bearingInRadians : 0);

    if (angle) {
        const sinA = Math.sin(angle);
        const cosA = Math.cos(angle);
        translate = [
            translate[0] * cosA - translate[1] * sinA,
            translate[0] * sinA + translate[1] * cosA
        ];
    }

    return [
        inViewportPixelUnitsUnits ? translate[0] : pixelsToTileUnits(tile, translate[0], transform.zoom),
        inViewportPixelUnitsUnits ? translate[1] : pixelsToTileUnits(tile, translate[1], transform.zoom)];
}

/**
 * Returns the signed distance between a point and a plane.
 * @param plane - The plane equation, in the form where the first three components are the normal and the fourth component is the plane's distance from origin along normal.
 * @param point - The point whose distance from plane is returned.
 * @returns Signed distance of the point from the plane. Positive distances are in the half space where the plane normal points to, negative otherwise.
 */
export function pointPlaneSignedDistance(
    plane: vec4 | [number, number, number, number],
    point: vec3 | [number, number, number]
): number {
    return plane[0] * point[0] + plane[1] * point[1] + plane[2] * point[2] + plane[3];
}

/**
 * Solves a quadratic equation in the form ax^2 + bx + c = 0 and returns its roots in no particular order.
 * Returns null if the equation has no roots or if it has infinitely many roots.
 */
export function solveQuadratic(a: number, b: number, c: number): {
    t0: number;
    t1: number;
} {
    const d = b * b - 4 * a * c;
    if (d < 0 || (a === 0 && b === 0)) {
        return null;
    }

    // Uses a more precise solution from the book Ray Tracing Gems, chapter 7.
    // https://www.realtimerendering.com/raytracinggems/rtg/index.html
    const q = -0.5 * (b + Math.sign(b) * Math.sqrt(d));
    if (Math.abs(q) > 1e-12) {
        return {
            t0: c / q,
            t1: q / a
        };
    } else {
        // Use the schoolbook way if q is too small
        return {
            t0: (-b + Math.sqrt(d)) * 0.5 / a,
            t1: (-b + Math.sqrt(d)) * 0.5 / a
        };
    }
}

/**
 * Returns the angle in radians between two 2D vectors.
 * The angle is signed and describes how much the first vector would need to be be rotated clockwise
 * (assuming X is right and Y is down) so that it points in the same direction as the second vector.
 * @param vec1x - The X component of the first vector.
 * @param vec1y - The Y component of the first vector.
 * @param vec2x - The X component of the second vector.
 * @param vec2y - The Y component of the second vector.
 * @returns The signed angle between the two vectors, in range -PI..PI.
 */
export function angleToRotateBetweenVectors2D(vec1x: number, vec1y: number, vec2x: number, vec2y: number): number {
    // Normalize both vectors
    const length1 = Math.sqrt(vec1x * vec1x + vec1y * vec1y);
    const length2 = Math.sqrt(vec2x * vec2x + vec2y * vec2y);
    vec1x /= length1;
    vec1y /= length1;
    vec2x /= length2;
    vec2y /= length2;
    const dot = vec1x * vec2x + vec1y * vec2y;
    const angle = Math.acos(dot);
    // dot second vector with vector to the right of first (-vec1y, vec1x)
    const isVec2RightOfVec1 = (-vec1y * vec2x + vec1x * vec2y) > 0;
    if (isVec2RightOfVec1) {
        return angle;
    } else {
        return -angle;
    }
}

/**
 * For two angles in degrees, returns how many degrees to add to the first angle in order to obtain the second angle.
 * The returned difference value is always the shorted of the two - its absolute value is never greater than 180°.
 */
export function differenceOfAnglesDegrees(degreesA: number, degreesB: number): number {
    const a = mod(degreesA, 360);
    const b = mod(degreesB, 360);
    const diff1 = b - a;
    const diff2 = (b > a) ? (diff1 - 360) : (diff1 + 360);
    if (Math.abs(diff1) < Math.abs(diff2)) {
        return diff1;
    } else {
        return diff2;
    }
}

/**
 * For two angles in radians, returns how many radians to add to the first angle in order to obtain the second angle.
 * The returned difference value is always the shorted of the two - its absolute value is never greater than PI.
 */
export function differenceOfAnglesRadians(degreesA: number, degreesB: number): number {
    const a = mod(degreesA, Math.PI * 2);
    const b = mod(degreesB, Math.PI * 2);
    const diff1 = b - a;
    const diff2 = (b > a) ? (diff1 - Math.PI * 2) : (diff1 + Math.PI * 2);
    if (Math.abs(diff1) < Math.abs(diff2)) {
        return diff1;
    } else {
        return diff2;
    }
}

/**
 * When given two angles in degrees, returns the angular distance between them - the shorter one of the two possible arcs.
 */
export function distanceOfAnglesDegrees(degreesA: number, degreesB: number): number {
    const a = mod(degreesA, 360);
    const b = mod(degreesB, 360);
    return Math.min(
        Math.abs(a - b),
        Math.abs(a - b + 360),
        Math.abs(a - b - 360)
    );
}

/**
 * When given two angles in radians, returns the angular distance between them - the shorter one of the two possible arcs.
 */
export function distanceOfAnglesRadians(radiansA: number, radiansB: number): number {
    const a = mod(radiansA, Math.PI * 2);
    const b = mod(radiansB, Math.PI * 2);
    return Math.min(
        Math.abs(a - b),
        Math.abs(a - b + Math.PI * 2),
        Math.abs(a - b - Math.PI * 2)
    );
}

/**
 * Modulo function, as opposed to javascript's `%`, which is a remainder.
 * This functions will return positive values, even if the first operand is negative.
 */
export function mod(n, m) {
    return ((n % m) + m) % m;
}

/**
 * Takes a value in *old range*, linearly maps that range to *new range*, and returns the value in that new range.
 * Additionally, if the value is outside *old range*, it is clamped inside it.
 * Also works if one of the ranges is flipped (its `min` being larger than `max`).
 */
export function remapSaturate(value: number, oldRangeMin: number, oldRangeMax: number, newRangeMin: number, newRangeMax: number): number {
    const inOldRange = clamp((value - oldRangeMin) / (oldRangeMax - oldRangeMin), 0.0, 1.0);
    return lerp(newRangeMin, newRangeMax, inOldRange);
}

/**
 * Linearly interpolate between two values, similar to `mix` function from GLSL. No clamping is done.
 * @param a - The first value to interpolate. This value is returned when mix=0.
 * @param b - The second value to interpolate. This value is returned when mix=1.
 * @param mix - The interpolation factor. Range 0..1 interpolates between `a` and `b`, but values outside this range are also accepted.
 */
export function lerp(a: number, b: number, mix: number): number {
    return a * (1.0 - mix) + b * mix;
}

/**
 * For a given collection of 2D points, returns their axis-aligned bounding box,
 * in the format [minX, minY, maxX, maxY].
 */
export function getAABB(points: Array<Point>): [number, number, number, number] {
    let tlX = Infinity;
    let tlY = Infinity;
    let brX = -Infinity;
    let brY = -Infinity;

    for (const p of points) {
        tlX = Math.min(tlX, p.x);
        tlY = Math.min(tlY, p.y);
        brX = Math.max(brX, p.x);
        brY = Math.max(brY, p.y);
    }

    return [tlX, tlY, brX, brY];
}

/**
 * Given a value `t` that varies between 0 and 1, return
 * an interpolation function that eases between 0 and 1 in a pleasing
 * cubic in-out fashion.
 */
export function easeCubicInOut(t: number): number {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const t2 = t * t,
        t3 = t2 * t;
    return 4 * (t < 0.5 ? t3 : 3 * (t - t2) + t3 - 0.75);
}

/**
 * Given given (x, y), (x1, y1) control points for a bezier curve,
 * return a function that interpolates along that curve.
 *
 * @param p1x - control point 1 x coordinate
 * @param p1y - control point 1 y coordinate
 * @param p2x - control point 2 x coordinate
 * @param p2y - control point 2 y coordinate
 */
export function bezier(p1x: number, p1y: number, p2x: number, p2y: number): (t: number) => number {
    const bezier = new UnitBezier(p1x, p1y, p2x, p2y);
    return (t: number) => {
        return bezier.solve(t);
    };
}

/**
 * A default bezier-curve powered easing function with
 * control points (0.25, 0.1) and (0.25, 1)
 */
export const defaultEasing = bezier(0.25, 0.1, 0.25, 1);

/**
 * constrain n to the given range via min + max
 *
 * @param n - value
 * @param min - the minimum value to be returned
 * @param max - the maximum value to be returned
 * @returns the clamped value
 */
export function clamp(n: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, n));
}

/**
 * constrain n to the given range, excluding the minimum, via modular arithmetic
 *
 * @param n - value
 * @param min - the minimum value to be returned, exclusive
 * @param max - the maximum value to be returned, inclusive
 * @returns constrained number
 */
export function wrap(n: number, min: number, max: number): number {
    const d = max - min;
    const w = ((n - min) % d + d) % d + min;
    return (w === min) ? max : w;
}

/**
 * Compute the difference between the keys in one object and the keys
 * in another object.
 *
 * @returns keys difference
 */
export function keysDifference<S, T>(
    obj: {[key: string]: S},
    other: {[key: string]: T}
): Array<string> {
    const difference = [];
    for (const i in obj) {
        if (!(i in other)) {
            difference.push(i);
        }
    }
    return difference;
}

/**
 * Given a destination object and optionally many source objects,
 * copy all properties from the source objects into the destination.
 * The last source object given overrides properties from previous
 * source objects.
 *
 * @param dest - destination object
 * @param sources - sources from which properties are pulled
 */
export function extend<T extends {}, U>(dest: T, source: U): T & U;
export function extend<T extends {}, U, V>(dest: T, source1: U, source2: V): T & U & V;
export function extend<T extends {}, U, V, W>(dest: T, source1: U, source2: V, source3: W): T & U & V & W;
export function extend(dest: object, ...sources: Array<any>): any;
export function extend(dest: object, ...sources: Array<any>): any {
    for (const src of sources) {
        for (const k in src) {
            dest[k] = src[k];
        }
    }
    return dest;
}

// See https://stackoverflow.com/questions/49401866/all-possible-keys-of-an-union-type
type KeysOfUnion<T> = T extends T ? keyof T: never;

/**
 * Given an object and a number of properties as strings, return version
 * of that object with only those properties.
 *
 * @param src - the object
 * @param properties - an array of property names chosen
 * to appear on the resulting object.
 * @returns object with limited properties.
 * @example
 * ```ts
 * let foo = { name: 'Charlie', age: 10 };
 * let justName = pick(foo, ['name']); // justName = { name: 'Charlie' }
 * ```
 */
export function pick<T extends object>(src: T, properties: Array<KeysOfUnion<T>>): Partial<T> {
    const result: Partial<T> = {};
    for (let i = 0; i < properties.length; i++) {
        const k = properties[i];
        if (k in src) {
            result[k] = src[k];
        }
    }
    return result;
}

let id = 1;

/**
 * Return a unique numeric id, starting at 1 and incrementing with
 * each call.
 *
 * @returns unique numeric id.
 */
export function uniqueId(): number {
    return id++;
}

/**
 * Return whether a given value is a power of two
 */
export function isPowerOfTwo(value: number): boolean {
    return (Math.log(value) / Math.LN2) % 1 === 0;
}

/**
 * Return the next power of two, or the input value if already a power of two
 */
export function nextPowerOfTwo(value: number): number {
    if (value <= 1) return 1;
    return Math.pow(2, Math.ceil(Math.log(value) / Math.LN2));
}

/**
 * Computes scaling from zoom level.
 */
export function zoomScale(zoom: number) { return Math.pow(2, zoom); }

/**
 * Computes zoom level from scaling.
 */
export function scaleZoom(scale: number) { return Math.log(scale) / Math.LN2; }

/**
 * Create an object by mapping all the values of an existing object while
 * preserving their keys.
 */
export function mapObject(input: any, iterator: Function, context?: any): any {
    const output = {};
    for (const key in input) {
        output[key] = iterator.call(context || this, input[key], key, input);
    }
    return output;
}

/**
 * Create an object by filtering out values of an existing object.
 */
export function filterObject(input: any, iterator: Function, context?: any): any {
    const output = {};
    for (const key in input) {
        if (iterator.call(context || this, input[key], key, input)) {
            output[key] = input[key];
        }
    }
    return output;
}

/**
 * Deeply compares two object literals.
 * @param a - first object literal to be compared
 * @param b - second object literal to be compared
 * @returns true if the two object literals are deeply equal, false otherwise
 */
export function deepEqual(a?: unknown | null, b?: unknown | null): boolean {
    if (Array.isArray(a)) {
        if (!Array.isArray(b) || a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (!deepEqual(a[i], b[i])) return false;
        }
        return true;
    }
    if (typeof a === 'object' && a !== null && b !== null) {
        if (!(typeof b === 'object')) return false;
        const keys = Object.keys(a);
        if (keys.length !== Object.keys(b).length) return false;
        for (const key in a) {
            if (!deepEqual(a[key], b[key])) return false;
        }
        return true;
    }
    return a === b;
}

/**
 * Deeply clones two objects.
 */
export function clone<T>(input: T): T {
    if (Array.isArray(input)) {
        return input.map(clone) as any as T;
    } else if (typeof input === 'object' && input) {
        return mapObject(input, clone) as any as T;
    } else {
        return input;
    }
}

/**
 * Check if two arrays have at least one common element.
 */
export function arraysIntersect<T>(a: Array<T>, b: Array<T>): boolean {
    for (let l = 0; l < a.length; l++) {
        if (b.indexOf(a[l]) >= 0) return true;
    }
    return false;
}

/**
 * Print a warning message to the console and ensure duplicate warning messages
 * are not printed.
 */
const warnOnceHistory: {[key: string]: boolean} = {};

export function warnOnce(message: string): void {
    if (!warnOnceHistory[message]) {
        // console isn't defined in some WebWorkers, see #2558
        if (typeof console !== 'undefined') console.warn(message);
        warnOnceHistory[message] = true;
    }
}

/**
 * Indicates if the provided Points are in a counter clockwise (true) or clockwise (false) order
 *
 * @returns true for a counter clockwise set of points
 */
// https://bryceboe.com/2006/10/23/line-segment-intersection-algorithm/
export function isCounterClockwise(a: Point, b: Point, c: Point): boolean {
    return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
}

/**
 * For two lines a and b in 2d space, defined by any two points along the lines,
 * find the intersection point, or return null if the lines are parallel
 *
 * @param a1 - First point on line a
 * @param a2 - Second point on line a
 * @param b1 - First point on line b
 * @param b2 - Second point on line b
 *
 * @returns the intersection point of the two lines or null if they are parallel
 */
export function findLineIntersection(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
    const aDeltaY = a2.y - a1.y;
    const aDeltaX = a2.x - a1.x;
    const bDeltaY = b2.y - b1.y;
    const bDeltaX = b2.x - b1.x;

    const denominator = (bDeltaY * aDeltaX) - (bDeltaX * aDeltaY);

    if (denominator === 0) {
        // Lines are parallel
        return null;
    }

    const originDeltaY = a1.y - b1.y;
    const originDeltaX = a1.x - b1.x;
    const aInterpolation = (bDeltaX * originDeltaY - bDeltaY * originDeltaX) / denominator;

    // Find intersection by projecting out from origin of first segment
    return new Point(a1.x + (aInterpolation * aDeltaX), a1.y + (aInterpolation * aDeltaY));
}

/**
 * Converts spherical coordinates to cartesian coordinates.
 *
 * @param spherical - Spherical coordinates, in [radial, azimuthal, polar]
 * @returns cartesian coordinates in [x, y, z]
 */

export function sphericalToCartesian([r, azimuthal, polar]: [number, number, number]): {
    x: number;
    y: number;
    z: number;
} {
    // We abstract "north"/"up" (compass-wise) to be 0° when really this is 90° (π/2):
    // correct for that here
    azimuthal += 90;

    // Convert azimuthal and polar angles to radians
    azimuthal *= Math.PI / 180;
    polar *= Math.PI / 180;

    return {
        x: r * Math.cos(azimuthal) * Math.sin(polar),
        y: r * Math.sin(azimuthal) * Math.sin(polar),
        z: r * Math.cos(polar)
    };
}

/**
 *  Returns true if the when run in the web-worker context.
 *
 * @returns `true` if the when run in the web-worker context.
 */
export function isWorker(self: any): self is WorkerGlobalScopeInterface {
    // @ts-ignore
    return typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope;
}

/**
 * Parses data from 'Cache-Control' headers.
 *
 * @param cacheControl - Value of 'Cache-Control' header
 * @returns object containing parsed header info.
 */

export function parseCacheControl(cacheControl: string): any {
    // Taken from [Wreck](https://github.com/hapijs/wreck)
    const re = /(?:^|(?:\s*\,\s*))([^\x00-\x20\(\)<>@\,;\:\\"\/\[\]\?\=\{\}\x7F]+)(?:\=(?:([^\x00-\x20\(\)<>@\,;\:\\"\/\[\]\?\=\{\}\x7F]+)|(?:\"((?:[^"\\]|\\.)*)\")))?/g;

    const header = {};
    cacheControl.replace(re, ($0, $1, $2, $3) => {
        const value = $2 || $3;
        header[$1] = value ? value.toLowerCase() : true;
        return '';
    });

    if (header['max-age']) {
        const maxAge = parseInt(header['max-age'], 10);
        if (isNaN(maxAge)) delete header['max-age'];
        else header['max-age'] = maxAge;
    }

    return header;
}

let _isSafari = null;

/**
 * Returns true when run in WebKit derived browsers.
 * This is used as a workaround for a memory leak in Safari caused by using Transferable objects to
 * transfer data between WebWorkers and the main thread.
 * https://github.com/mapbox/mapbox-gl-js/issues/8771
 *
 * This should be removed once the underlying Safari issue is fixed.
 *
 * @param scope - Since this function is used both on the main thread and WebWorker context,
 *      let the calling scope pass in the global scope object.
 * @returns `true` when run in WebKit derived browsers.
 */
export function isSafari(scope: any): boolean {
    if (_isSafari == null) {
        const userAgent = scope.navigator ? scope.navigator.userAgent : null;
        _isSafari = !!scope.safari ||
        !!(userAgent && (/\b(iPad|iPhone|iPod)\b/.test(userAgent) || (!!userAgent.match('Safari') && !userAgent.match('Chrome'))));
    }
    return _isSafari;
}

export function storageAvailable(type: string): boolean {
    try {
        const storage = window[type];
        storage.setItem('_mapbox_test_', 1);
        storage.removeItem('_mapbox_test_');
        return true;
    } catch {
        return false;
    }
}

// The following methods are from https://developer.mozilla.org/en-US/docs/Web/API/WindowBase64/Base64_encoding_and_decoding#The_Unicode_Problem
//Unicode compliant base64 encoder for strings
export function b64EncodeUnicode(str: string) {
    return btoa(
        encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
            (match, p1) => {
                return String.fromCharCode(Number('0x' + p1)); //eslint-disable-line
            }
        )
    );
}

// Unicode compliant decoder for base64-encoded strings
export function b64DecodeUnicode(str: string) {
    return decodeURIComponent(atob(str).split('').map((c) => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2); //eslint-disable-line
    }).join(''));
}

export function isImageBitmap(image: any): image is ImageBitmap {
    return typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap;
}

/**
 * Converts an ArrayBuffer to an ImageBitmap.
 *
 * Used mostly for testing purposes only, because mocking libs don't know how to work with ArrayBuffers, but work
 * perfectly fine with ImageBitmaps. Might also be used for environments (other than testing) not supporting
 * ArrayBuffers.
 *
 * @param data - Data to convert
 * @returns - A  promise resolved when the conversion is finished
 */
export const arrayBufferToImageBitmap = async (data: ArrayBuffer): Promise<ImageBitmap> => {
    if (data.byteLength === 0) {
        return createImageBitmap(new ImageData(1, 1));
    }
    const blob: Blob = new Blob([new Uint8Array(data)], {type: 'image/png'});
    try {
        return createImageBitmap(blob);
    } catch (e) {
        throw new Error(`Could not load image because of ${e.message}. Please make sure to use a supported image type such as PNG or JPEG. Note that SVGs are not supported.`);
    }
};

const transparentPngUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQYV2NgAAIAAAUAAarVyFEAAAAASUVORK5CYII=';

/**
 * Converts an ArrayBuffer to an HTMLImageElement.
 *
 * Used mostly for testing purposes only, because mocking libs don't know how to work with ArrayBuffers, but work
 * perfectly fine with ImageBitmaps. Might also be used for environments (other than testing) not supporting
 * ArrayBuffers.
 *
 * @param data - Data to convert
 * @returns - A promise resolved when the conversion is finished
 */
export const arrayBufferToImage = (data: ArrayBuffer): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img: HTMLImageElement = new Image();
        img.onload = () => {
            resolve(img);
            URL.revokeObjectURL(img.src);
            // prevent image dataURI memory leak in Safari;
            // but don't free the image immediately because it might be uploaded in the next frame
            // https://github.com/mapbox/mapbox-gl-js/issues/10226
            img.onload = null;
            window.requestAnimationFrame(() => { img.src = transparentPngUrl; });
        };
        img.onerror = () => reject(new Error('Could not load image. Please make sure to use a supported image type such as PNG or JPEG. Note that SVGs are not supported.'));
        const blob: Blob = new Blob([new Uint8Array(data)], {type: 'image/png'});
        img.src = data.byteLength ? URL.createObjectURL(blob) : transparentPngUrl;
    });
};

/**
 * Computes the webcodecs VideoFrame API options to select a rectangle out of
 * an image and write it into the destination rectangle.
 *
 * Rect (x/y/width/height) select the overlapping rectangle from the source image
 * and layout (offset/stride) write that overlapping rectangle to the correct place
 * in the destination image.
 *
 * Offset is the byte offset in the dest image that the first pixel appears at
 * and stride is the number of bytes to the start of the next row:
 * ┌───────────┐
 * │  dest     │
 * │       ┌───┼───────┐
 * │offset→│▓▓▓│ source│
 * │       │▓▓▓│       │
 * │       └───┼───────┘
 * │stride ⇠╌╌╌│
 * │╌╌╌╌╌╌→    │
 * └───────────┘
 *
 * @param image - source image containing a width and height attribute
 * @param x - top-left x coordinate to read from the image
 * @param y - top-left y coordinate to read from the image
 * @param width - width of the rectangle to read from the image
 * @param height - height of the rectangle to read from the image
 * @returns the layout and rect options to pass into VideoFrame API
 */
function computeVideoFrameParameters(image: Size, x: number, y: number, width: number, height: number): VideoFrameCopyToOptions {
    const destRowOffset = Math.max(-x, 0) * 4;
    const firstSourceRow = Math.max(0, y);
    const firstDestRow = firstSourceRow - y;
    const offset = firstDestRow * width * 4 + destRowOffset;
    const stride = width * 4;

    const sourceLeft = Math.max(0, x);
    const sourceTop = Math.max(0, y);
    const sourceRight = Math.min(image.width, x + width);
    const sourceBottom = Math.min(image.height, y + height);
    return {
        rect: {
            x: sourceLeft,
            y: sourceTop,
            width: sourceRight - sourceLeft,
            height: sourceBottom - sourceTop
        },
        layout: [{offset, stride}]
    };
}

/**
 * Reads pixels from an ImageBitmap/Image/canvas using webcodec VideoFrame API.
 *
 * @param data - image, imagebitmap, or canvas to parse
 * @param x - top-left x coordinate to read from the image
 * @param y - top-left y coordinate to read from the image
 * @param width - width of the rectangle to read from the image
 * @param height - height of the rectangle to read from the image
 * @returns a promise containing the parsed RGBA pixel values of the image, or the error if an error occurred
 */
export async function readImageUsingVideoFrame(
    image: HTMLImageElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas,
    x: number, y: number, width: number, height: number
): Promise<Uint8ClampedArray> {
    if (typeof VideoFrame === 'undefined') {
        throw new Error('VideoFrame not supported');
    }
    const frame = new VideoFrame(image, {timestamp: 0});
    try {
        const format = frame?.format;
        if (!format || !(format.startsWith('BGR') || format.startsWith('RGB'))) {
            throw new Error(`Unrecognized format ${format}`);
        }
        const swapBR = format.startsWith('BGR');
        const result = new Uint8ClampedArray(width * height * 4);
        await frame.copyTo(result, computeVideoFrameParameters(image, x, y, width, height));
        if (swapBR) {
            for (let i = 0; i < result.length; i += 4) {
                const tmp = result[i];
                result[i] = result[i + 2];
                result[i + 2] = tmp;
            }
        }
        return result;
    } finally {
        frame.close();
    }
}

let offscreenCanvas: OffscreenCanvas;
let offscreenCanvasContext: OffscreenCanvasRenderingContext2D;

/**
 * Reads pixels from an ImageBitmap/Image/canvas using OffscreenCanvas
 *
 * @param data - image, imagebitmap, or canvas to parse
 * @param x - top-left x coordinate to read from the image
 * @param y - top-left y coordinate to read from the image
 * @param width - width of the rectangle to read from the image
 * @param height - height of the rectangle to read from the image
 * @returns a promise containing the parsed RGBA pixel values of the image, or the error if an error occurred
 */
export function readImageDataUsingOffscreenCanvas(
    imgBitmap: HTMLImageElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas,
    x: number, y: number, width: number, height: number
): Uint8ClampedArray {
    const origWidth = imgBitmap.width;
    const origHeight = imgBitmap.height;
    // Lazily initialize OffscreenCanvas
    if (!offscreenCanvas || !offscreenCanvasContext) {
        // Dem tiles are typically 256x256
        offscreenCanvas = new OffscreenCanvas(origWidth, origHeight);
        offscreenCanvasContext = offscreenCanvas.getContext('2d', {willReadFrequently: true});
    }

    offscreenCanvas.width = origWidth;
    offscreenCanvas.height = origHeight;

    offscreenCanvasContext.drawImage(imgBitmap, 0, 0, origWidth, origHeight);
    const imgData = offscreenCanvasContext.getImageData(x, y, width, height);
    offscreenCanvasContext.clearRect(0, 0, origWidth, origHeight);
    return imgData.data;
}

/**
 * Reads RGBA pixels from an preferring OffscreenCanvas, but falling back to VideoFrame if supported and
 * the browser is mangling OffscreenCanvas getImageData results.
 *
 * @param data - image, imagebitmap, or canvas to parse
 * @param x - top-left x coordinate to read from the image
 * @param y - top-left y coordinate to read from the image
 * @param width - width of the rectangle to read from the image
 * @param height - height of the rectangle to read from the image
 * @returns a promise containing the parsed RGBA pixel values of the image
 */
export async function getImageData(
    image: HTMLImageElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas,
    x: number, y: number, width: number, height: number
): Promise<Uint8ClampedArray> {
    if (isOffscreenCanvasDistorted()) {
        try {
            return await readImageUsingVideoFrame(image, x, y, width, height);
        } catch {
            // fall back to OffscreenCanvas
        }
    }
    return readImageDataUsingOffscreenCanvas(image, x, y, width, height);
}

/**
 * Allows to unsubscribe from events without the need to store the method reference.
 */
export interface Subscription {
    /**
     * Unsubscribes from the event.
     */
    unsubscribe(): void;
}

export interface Subscriber {
    addEventListener: typeof window.addEventListener;
    removeEventListener: typeof window.removeEventListener;
}

/**
 * This method is used in order to register an event listener using a lambda function.
 * The return value will allow unsubscribing from the event, without the need to store the method reference.
 * @param target - The target
 * @param message - The message
 * @param listener - The listener
 * @param options - The options
 * @returns a subscription object that can be used to unsubscribe from the event
 */
export function subscribe(target: Subscriber, message: keyof WindowEventMap, listener: (...args: any) => void, options: boolean | AddEventListenerOptions): Subscription {
    target.addEventListener(message, listener, options);
    return {
        unsubscribe: () => {
            target.removeEventListener(message, listener, options);
        }
    };
}

/**
 * This method converts degrees to radians.
 * The return value is the radian value.
 * @param degrees - The number of degrees
 * @returns radians
 */
export function degreesToRadians(degrees: number): number {
    return degrees * Math.PI / 180;
}

/**
 * This method converts radians to degrees.
 * The return value is the degrees value.
 * @param degrees - The number of radians
 * @returns degrees
 */
export function radiansToDegrees(degrees: number): number {
    return degrees / Math.PI * 180;
}

export type RollPitchBearing = {
    roll: number;
    pitch: number;
    bearing: number;
};

export function rollPitchBearingEqual(a: RollPitchBearing, b: RollPitchBearing): boolean {
    return a.roll == b.roll && a.pitch == b.pitch && a.bearing == b.bearing;
}

/**
 * This method converts a rotation quaternion to roll, pitch, and bearing angles in degrees.
 * @param rotation - The rotation quaternion
 * @returns roll, pitch, and bearing angles in degrees
 */
export function getRollPitchBearing(rotation: quat): RollPitchBearing {
    const m: mat3 = new Float64Array(9) as any;
    mat3.fromQuat(m, rotation);

    const xAngle = radiansToDegrees(-Math.asin(clamp(m[2], -1, 1)));
    let roll: number;
    let bearing: number;
    if (Math.hypot(m[5], m[8]) < 1.0e-3) {
        roll = 0.0;
        bearing = -radiansToDegrees(Math.atan2(m[3], m[4]));
    } else {
        roll = radiansToDegrees((m[5] === 0.0 && m[8] === 0.0) ? 0.0 :  Math.atan2(m[5], m[8]));
        bearing = radiansToDegrees((m[1] === 0.0 && m[0] === 0.0) ? 0.0 : Math.atan2(m[1], m[0]));
    }

    return {roll, pitch: xAngle + 90.0, bearing};
}

export function getAngleDelta(lastPoint: Point, currentPoint: Point, center: Point): number {
    const pointVect = vec2.fromValues(currentPoint.x - center.x, currentPoint.y - center.y);
    const lastPointVec = vec2.fromValues(lastPoint.x - center.x, lastPoint.y - center.y);

    const crossProduct = pointVect[0] * lastPointVec[1] - pointVect[1] * lastPointVec[0];
    const angleRadians = Math.atan2(crossProduct, vec2.dot(pointVect, lastPointVec));
    return radiansToDegrees(angleRadians);
}

/**
 * This method converts roll, pitch, and bearing angles in degrees to a rotation quaternion.
 * @param roll - Roll angle in degrees
 * @param pitch - Pitch angle in degrees
 * @param bearing - Bearing angle in degrees
 * @returns The rotation quaternion
 */
export function rollPitchBearingToQuat(roll: number, pitch: number, bearing: number): quat {
    const rotation: quat = new Float64Array(4) as any;
    quat.fromEuler(rotation, roll, pitch - 90.0, bearing);
    return rotation;
}

/**
 * Makes optional keys required and add the the undefined type.
 *
 * ```
 * interface Test {
 *  foo: number;
 *  bar?: number;
 *  baz: number | undefined;
 * }
 *
 * Complete<Test> {
 *  foo: number;
 *  bar: number | undefined;
 *  baz: number | undefined;
 * }
 *
 * ```
 *
 * See https://medium.com/terria/typescript-transforming-optional-properties-to-required-properties-that-may-be-undefined-7482cb4e1585
 */

export type Complete<T> = {
    [P in keyof Required<T>]: Pick<T, P> extends Required<Pick<T, P>> ? T[P] : (T[P] | undefined);
};

/**
 * A helper to allow require of at least one property
 */
export type RequireAtLeastOne<T> = { [K in keyof T]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<keyof T, K>>>; }[keyof T];

export type TileJSON = {
    tilejson: '2.2.0' | '2.1.0' | '2.0.1' | '2.0.0' | '1.0.0';
    name?: string;
    description?: string;
    version?: string;
    attribution?: string;
    template?: string;
    tiles: Array<string>;
    grids?: Array<string>;
    data?: Array<string>;
    minzoom?: number;
    maxzoom?: number;
    bounds?: [number, number, number, number];
    center?: [number, number, number];
    vector_layers: [{id: string}]; // this is partial but enough for what we need
};

/**
 * The maximum world tile zoom (Z).
 * In other words, the upper bound supported for tile zoom.
 */
export const MAX_TILE_ZOOM = 25;

/**
 * The minimum world tile zoom (Z).
 * In other words, the lower bound supported for tile zoom.
 */
export const MIN_TILE_ZOOM = 0;

export const MAX_VALID_LATITUDE = 85.051129;

const touchableEvents = {
    touchstart: true,
    touchmove: true,
    touchmoveWindow: true,
    touchend: true,
    touchcancel: true
};

const pointableEvents = {
    dblclick: true,
    click: true,
    mouseover: true,
    mouseout: true,
    mousedown: true,
    mousemove: true,
    mousemoveWindow: true,
    mouseup: true,
    mouseupWindow: true,
    contextmenu: true,
    wheel: true
};

export function isTouchableEvent(event: Event, eventType: string): boolean {
    return touchableEvents[eventType] && 'touches' in event;
}

export function isPointableEvent(event: Event, eventType: string): event is MouseEvent {
    return pointableEvents[eventType] && (event instanceof MouseEvent || event instanceof WheelEvent);
}

export function isTouchableOrPointableType(eventType: string): boolean {
    return touchableEvents[eventType] || pointableEvents[eventType];
}
