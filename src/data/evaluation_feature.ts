import loadGeometry from './load_geometry';
import type Point from '../symbol/point';

type EvaluationFeature = {
  readonly type: 1 | 2 | 3 | "Unknown" | "Point" | "MultiPoint" | "LineString" | "MultiLineString" | "Polygon" | "MultiPolygon",
  readonly id?: any,
  readonly properties: {[_: string]: any},
  readonly patterns?: {
    [_: string]: {
      "min": string,
      "mid": string,
      "max": string
    }
  },
  geometry: Array<Array<Point>>
};

/**
 * Construct a new feature based on a VectorTileFeature for expression evaluation, the geometry of which
 * will be loaded based on necessity.
 * @param {VectorTileFeature} feature
 * @param {boolean} needGeometry
 * @private
 */
export default function toEvaluationFeature(feature: VectorTileFeature, needGeometry: boolean): EvaluationFeature {
    return {type: feature.type,
        id: feature.id,
        properties:feature.properties,
        geometry: needGeometry ? loadGeometry(feature) : []};
}
