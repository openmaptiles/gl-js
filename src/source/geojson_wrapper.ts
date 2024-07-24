import Point from '@mapbox/point-geometry';

import {VectorTileFeature, type VectorTileLayer, type VectorTile} from '@mapbox/vector-tile';
import {EXTENT} from '../data/extent';
import type {TileFeature, AnyProps} from 'supercluster';
import type {Feature as GeoJSONVTFeature} from 'geojson-vt';
import type Pbf from 'pbf';

export type Feature = TileFeature<AnyProps, AnyProps> | GeoJSONVTFeature;

class FeatureWrapper implements VectorTileFeature {
    _feature: Feature;

    extent: number;
    type: Feature['type'];
    id: number;
    properties: {[_: string]: string | number | boolean};

    // to support implementation of VectorTileFeature
    _pbf: Pbf;
    _geometry: number;
    _keys: Array<string>;
    _values: Array<unknown>;

    constructor(feature: Feature) {
        this._feature = feature;

        this.extent = EXTENT;
        this.type = feature.type;
        this.properties = feature.tags;

        // If the feature has a top-level `id` property, copy it over, but only
        // if it can be coerced to an integer, because this wrapper is used for
        // serializing geojson feature data into vector tile PBF data, and the
        // vector tile spec only supports integer values for feature ids --
        // allowing non-integer values here results in a non-compliant PBF
        // that causes an exception when it is parsed with vector-tile-js
        if ('id' in feature && !isNaN(feature.id as any)) {
            this.id = parseInt(feature.id, 10);
        }
    }

    loadGeometry() {
        if (this._feature.type === 1) {
            const geometry = [];
            for (const point of this._feature.geometry) {
                geometry.push([new Point(point[0], point[1])]);
            }
            return geometry;
        } else {
            const geometry = [];
            for (const ring of this._feature.geometry) {
                const newRing = [];
                for (const point of ring) {
                    newRing.push(new Point(point[0], point[1]));
                }
                geometry.push(newRing);
            }
            return geometry;
        }
    }

    toGeoJSON(x: number, y: number, z: number) {
        return VectorTileFeature.prototype.toGeoJSON.call(this, x, y, z);
    }

    bbox(): number[] {
        return VectorTileFeature.prototype.bbox.call(this);
    }
}

export class GeoJSONWrapper implements VectorTile, VectorTileLayer {
    layers: {[_: string]: VectorTileLayer};
    name: string;
    extent: number;
    length: number;
    _featuresCache: Array<Feature>;
    // to support implementation of VectorTileLayer
    version: number;
    _features: number[];
    _pbf: Pbf;
    _keys: string[];
    _values: unknown[];

    constructor(features: Array<Feature>) {
        this.layers = {'_geojsonTileLayer': this};
        this.name = '_geojsonTileLayer';
        this.extent = EXTENT;
        this.length = features.length;
        this._featuresCache = features;
    }

    feature(i: number): VectorTileFeature {
        return new FeatureWrapper(this._featuresCache[i]);
    }
}
