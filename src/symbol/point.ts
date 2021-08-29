// based on '@mapbox/point-geometry';

/*
Copyright (c) 2015, Mapbox <>

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
*/

import {register} from '../util/web_worker_transfer';

/**
 * A standalone point geometry with useful accessor, comparison, and
 * modification methods.
 *
 * @class Point
 * @param {Number} x the x-coordinate. this could be longitude or screen
 * pixels, or any other sort of unit.
 * @param {Number} y the y-coordinate. this could be latitude or screen
 * pixels, or any other sort of unit.
 * @example
 * var point = new Point(-77, 38);
 */

export type PointLike = Point | [number, number];

class Point {
    x: number;
    y: number;

    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    /**
     * Clone this point, returning a new point that can be modified
     * without affecting the old one.
     * @returns {Point} the clone
     */
    clone() { return new Point(this.x, this.y); }

    /**
     * Add this point's x & y coordinates to another point,
     * yielding a new point.
     * @param {Point} p the other point
     * @returns {Point} output point
     */
    add(p) { return this.clone()._add(p); }

    /**
     * Subtract this point's x & y coordinates to from point,
     * yielding a new point.
     * @param {Point} p the other point
     * @returns {Point} output point
     */
    sub(p) { return this.clone()._sub(p); }

    /**
     * Multiply this point's x & y coordinates by point,
     * yielding a new point.
     * @param {Point} p the other point
     * @returns {Point} output point
     */
    multByPoint(p) { return this.clone()._multByPoint(p); }

    /**
     * Divide this point's x & y coordinates by point,
     * yielding a new point.
     * @param {Point} p the other point
     * @returns {Point} output point
     */
    divByPoint(p) { return this.clone()._divByPoint(p); }

    /**
     * Multiply this point's x & y coordinates by a factor,
     * yielding a new point.
     * @param {Point} k factor
     * @returns {Point} output point
     */
    mult(k) { return this.clone()._mult(k); }

    /**
     * Divide this point's x & y coordinates by a factor,
     * yielding a new point.
     * @param {Point} k factor
     * @returns {Point} output point
     */
    div(k) { return this.clone()._div(k); }

    /**
     * Rotate this point around the 0, 0 origin by an angle a,
     * given in radians
     * @param {Number} a angle to rotate around, in radians
     * @returns {Point} output point
     */
    rotate(a) { return this.clone()._rotate(a); }

    /**
     * Rotate this point around p point by an angle a,
     * given in radians
     * @param {Number} a angle to rotate around, in radians
     * @param {Point} p Point to rotate around
     * @returns {Point} output point
     */
    rotateAround(a, p) { return this.clone()._rotateAround(a, p); }

    /**
     * Multiply this point by a 4x1 transformation matrix
     * @param {Array<Number>} m transformation matrix
     * @returns {Point} output point
     */
    matMult(m) { return this.clone()._matMult(m); }

    /**
     * Calculate this point but as a unit vector from 0, 0, meaning
     * that the distance from the resulting point to the 0, 0
     * coordinate will be equal to 1 and the angle from the resulting
     * point to the 0, 0 coordinate will be the same as before.
     * @returns {Point} unit vector point
     */
    unit() { return this.clone()._unit(); }

    /**
     * Compute a perpendicular point, where the new y coordinate
     * is the old x coordinate and the new x coordinate is the old y
     * coordinate multiplied by -1
     * @returns {Point} perpendicular point
     */
    perp() { return this.clone()._perp(); }

    /**
     * Return a version of this point with the x & y coordinates
     * rounded to integers.
     * @returns {Point} rounded point
     */
    round() { return this.clone()._round(); }

    /**
     * Return the magitude of this point: this is the Euclidean
     * distance from the 0, 0 coordinate to this point's x and y
     * coordinates.
     * @returns {Number} magnitude
     */
    mag() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    /**
     * Judge whether this point is equal to another point, returning
     * true or false.
     * @param {Point} other the other point
     * @returns {boolean} whether the points are equal
     */
    equals(other) {
        return this.x === other.x &&
               this.y === other.y;
    }

    /**
     * Calculate the distance from this point to another point
     * @param {Point} p the other point
     * @returns {Number} distance
     */
    dist(p) {
        return Math.sqrt(this.distSqr(p));
    }

    /**
     * Calculate the distance from this point to another point,
     * without the square root step. Useful if you're comparing
     * relative distances.
     * @param {Point} p the other point
     * @returns {Number} distance
     */
    distSqr(p) {
        const dx = p.x - this.x;
        const dy = p.y - this.y;
        return dx * dx + dy * dy;
    }

    /**
     * Get the angle from the 0, 0 coordinate to this point, in radians
     * coordinates.
     * @returns {Number} angle
     */
    angle() {
        return Math.atan2(this.y, this.x);
    }

    /**
     * Get the angle from this point to another point, in radians
     * @param {Point} b the other point
     * @returns {Number} angle
     */
    angleTo(b) {
        return Math.atan2(this.y - b.y, this.x - b.x);
    }

    /**
     * Get the angle between this point and another point, in radians
     * @param {Point} b the other point
     * @returns {Number} angle
     */
    angleWith(b) {
        return this.angleWithSep(b.x, b.y);
    }

    /*
     * Find the angle of the two vectors, solving the formula for
     * the cross product a x b = |a||b|sin(θ) for θ.
     * @param {Number} x the x-coordinate
     * @param {Number} y the y-coordinate
     * @returns {Number} the angle in radians
     */
    angleWithSep(x, y) {
        return Math.atan2(
            this.x * y - this.y * x,
            this.x * x + this.y * y);
    }

    _matMult(m) {
        const x = m[0] * this.x + m[1] * this.y;
        const y = m[2] * this.x + m[3] * this.y;
        this.x = x;
        this.y = y;
        return this;
    }

    _add(p) {
        this.x += p.x;
        this.y += p.y;
        return this;
    }

    _sub(p) {
        this.x -= p.x;
        this.y -= p.y;
        return this;
    }

    _mult(k) {
        this.x *= k;
        this.y *= k;
        return this;
    }

    _div(k) {
        this.x /= k;
        this.y /= k;
        return this;
    }

    _multByPoint(p) {
        this.x *= p.x;
        this.y *= p.y;
        return this;
    }

    _divByPoint(p) {
        this.x /= p.x;
        this.y /= p.y;
        return this;
    }

    _unit() {
        this._div(this.mag());
        return this;
    }

    _perp() {
        const y = this.y;
        this.y = this.x;
        this.x = -y;
        return this;
    }

    _rotate(angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const x = cos * this.x - sin * this.y;
        const y = sin * this.x + cos * this.y;

        this.x = x;
        this.y = y;
        return this;
    }

    _rotateAround(angle, p) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const x = p.x + cos * (this.x - p.x) - sin * (this.y - p.y);
        const y = p.y + sin * (this.x - p.x) + cos * (this.y - p.y);

        this.x = x;
        this.y = y;
        return this;
    }

    _round() {
        this.x = Math.round(this.x);
        this.y = Math.round(this.y);
        return this;
    }

    /**
     * Construct a point from an array if necessary, otherwise if the input
     * is already a Point, or an unknown type, return it unchanged
     * @param {Array<Number>|Point|*} a any kind of input value
     * @returns {Point} constructed point, or passed-through value.
     * @example
     * // this
     * var point = Point.convert([0, 1]);
     * // is equivalent to
     * var point = new Point(0, 1);
     */
    static convert(a: PointLike | {x: number, y: number}): Point {
        if (a instanceof Point) {
            return a;
        }
        if (Array.isArray(a)) {
            return new Point(a[0], a[1]);
        }
        if (typeof a.x === 'number') {
            return new Point(a.x, a.y);
        }
        throw new Error(`Unable to convert to point: ${JSON.stringify(a)}`);
    }
}

register('Point', Point);

export default Point;
