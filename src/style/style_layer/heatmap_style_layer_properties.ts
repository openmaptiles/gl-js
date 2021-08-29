// This file was generated. Edit build/generate-style-code.js, see https://github.com/maplibre/maplibre-gl-js/issues/266.
/* eslint-disable */

import styleSpec from '../../style-spec/reference/latest';

import {
    Properties,
    DataConstantProperty,
    DataDrivenProperty,
    CrossFadedDataDrivenProperty,
    CrossFadedProperty,
    ColorRampProperty,
    PossiblyEvaluatedPropertyValue
} from '../properties';

import type Color from '../../style-spec/util/color';

import type Formatted from '../../style-spec/expression/types/formatted';

import type ResolvedImage from '../../style-spec/expression/types/resolved_image';
import { StylePropertySpecification } from '../../style-spec/style-spec';


export type PaintProps = {
  "heatmap-radius": DataDrivenProperty<number>,
  "heatmap-weight": DataDrivenProperty<number>,
  "heatmap-intensity": DataConstantProperty<number>,
  "heatmap-color": ColorRampProperty,
  "heatmap-opacity": DataConstantProperty<number>
};

export type PaintPropsPossiblyEvaluated = {
  "heatmap-radius": PossiblyEvaluatedPropertyValue<number>,
  "heatmap-weight": PossiblyEvaluatedPropertyValue<number>,
  "heatmap-intensity": number,
  "heatmap-color": ColorRampProperty,
  "heatmap-opacity": number
};

const paint: Properties<PaintProps> = new Properties({
    "heatmap-radius": new DataDrivenProperty(styleSpec["paint_heatmap"]["heatmap-radius"] as any as StylePropertySpecification),
    "heatmap-weight": new DataDrivenProperty(styleSpec["paint_heatmap"]["heatmap-weight"] as any as StylePropertySpecification),
    "heatmap-intensity": new DataConstantProperty(styleSpec["paint_heatmap"]["heatmap-intensity"] as any as StylePropertySpecification),
    "heatmap-color": new ColorRampProperty(styleSpec["paint_heatmap"]["heatmap-color"] as any as StylePropertySpecification),
    "heatmap-opacity": new DataConstantProperty(styleSpec["paint_heatmap"]["heatmap-opacity"] as any as StylePropertySpecification),
});

// Note: without adding the explicit type annotation, Flow infers weaker types
// for these objects from their use in the constructor to StyleLayer, as
// {layout?: Properties<...>, paint: Properties<...>}
export default ({ paint } as {
  paint: Properties<PaintProps>
});
