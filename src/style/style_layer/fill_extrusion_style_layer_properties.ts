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
  "fill-extrusion-opacity": DataConstantProperty<number>,
  "fill-extrusion-color": DataDrivenProperty<Color>,
  "fill-extrusion-translate": DataConstantProperty<[number, number]>,
  "fill-extrusion-translate-anchor": DataConstantProperty<"map" | "viewport">,
  "fill-extrusion-pattern": CrossFadedDataDrivenProperty<ResolvedImage>,
  "fill-extrusion-height": DataDrivenProperty<number>,
  "fill-extrusion-base": DataDrivenProperty<number>,
  "fill-extrusion-vertical-gradient": DataConstantProperty<boolean>
};

export type PaintPropsPossiblyEvaluated = {
  "fill-extrusion-opacity": number,
  "fill-extrusion-color": PossiblyEvaluatedPropertyValue<Color>,
  "fill-extrusion-translate": [number, number],
  "fill-extrusion-translate-anchor": "map" | "viewport",
  "fill-extrusion-pattern": PossiblyEvaluatedPropertyValue<ResolvedImage>,
  "fill-extrusion-height": PossiblyEvaluatedPropertyValue<number>,
  "fill-extrusion-base": PossiblyEvaluatedPropertyValue<number>,
  "fill-extrusion-vertical-gradient": boolean
};

const paint: Properties<PaintProps> = new Properties({
    "fill-extrusion-opacity": new DataConstantProperty(styleSpec["paint_fill-extrusion"]["fill-extrusion-opacity"] as any as StylePropertySpecification),
    "fill-extrusion-color": new DataDrivenProperty(styleSpec["paint_fill-extrusion"]["fill-extrusion-color"] as any as StylePropertySpecification),
    "fill-extrusion-translate": new DataConstantProperty(styleSpec["paint_fill-extrusion"]["fill-extrusion-translate"] as any as StylePropertySpecification),
    "fill-extrusion-translate-anchor": new DataConstantProperty(styleSpec["paint_fill-extrusion"]["fill-extrusion-translate-anchor"] as any as StylePropertySpecification),
    "fill-extrusion-pattern": new CrossFadedDataDrivenProperty(styleSpec["paint_fill-extrusion"]["fill-extrusion-pattern"] as any as StylePropertySpecification),
    "fill-extrusion-height": new DataDrivenProperty(styleSpec["paint_fill-extrusion"]["fill-extrusion-height"] as any as StylePropertySpecification),
    "fill-extrusion-base": new DataDrivenProperty(styleSpec["paint_fill-extrusion"]["fill-extrusion-base"] as any as StylePropertySpecification),
    "fill-extrusion-vertical-gradient": new DataConstantProperty(styleSpec["paint_fill-extrusion"]["fill-extrusion-vertical-gradient"] as any as StylePropertySpecification),
});

export default ({ paint } as {
  paint: Properties<PaintProps>
});
