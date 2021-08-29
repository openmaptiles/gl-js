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
    PossiblyEvaluatedPropertyValue,
    CrossFaded
} from '../properties';

import type Color from '../../style-spec/util/color';

import type Formatted from '../../style-spec/expression/types/formatted';

import type ResolvedImage from '../../style-spec/expression/types/resolved_image';
import { StylePropertySpecification } from '../../style-spec/style-spec';

export type LayoutProps = {
  "line-cap": DataConstantProperty<"butt" | "round" | "square">,
  "line-join": DataDrivenProperty<"bevel" | "round" | "miter">,
  "line-miter-limit": DataConstantProperty<number>,
  "line-round-limit": DataConstantProperty<number>,
  "line-sort-key": DataDrivenProperty<number>
};

export type LayoutPropsPossiblyEvaluated = {
  "line-cap": "butt" | "round" | "square",
  "line-join": PossiblyEvaluatedPropertyValue<"bevel" | "round" | "miter">,
  "line-miter-limit": number,
  "line-round-limit": number,
  "line-sort-key": PossiblyEvaluatedPropertyValue<number>
};

const layout: Properties<LayoutProps> = new Properties({
    "line-cap": new DataConstantProperty(styleSpec["layout_line"]["line-cap"] as any as StylePropertySpecification),
    "line-join": new DataDrivenProperty(styleSpec["layout_line"]["line-join"] as any as StylePropertySpecification),
    "line-miter-limit": new DataConstantProperty(styleSpec["layout_line"]["line-miter-limit"] as any as StylePropertySpecification),
    "line-round-limit": new DataConstantProperty(styleSpec["layout_line"]["line-round-limit"] as any as StylePropertySpecification),
    "line-sort-key": new DataDrivenProperty(styleSpec["layout_line"]["line-sort-key"] as any as StylePropertySpecification),
});

export type PaintProps = {
  "line-opacity": DataDrivenProperty<number>,
  "line-color": DataDrivenProperty<Color>,
  "line-translate": DataConstantProperty<[number, number]>,
  "line-translate-anchor": DataConstantProperty<"map" | "viewport">,
  "line-width": DataDrivenProperty<number>,
  "line-gap-width": DataDrivenProperty<number>,
  "line-offset": DataDrivenProperty<number>,
  "line-blur": DataDrivenProperty<number>,
  "line-dasharray": CrossFadedProperty<Array<number>>,
  "line-pattern": CrossFadedDataDrivenProperty<ResolvedImage>,
  "line-gradient": ColorRampProperty
};

export type PaintPropsPossiblyEvaluated = {
  "line-opacity": PossiblyEvaluatedPropertyValue<number>,
  "line-color": PossiblyEvaluatedPropertyValue<Color>,
  "line-translate": [number, number],
  "line-translate-anchor": "map" | "viewport",
  "line-width": PossiblyEvaluatedPropertyValue<number>,
  "line-gap-width": PossiblyEvaluatedPropertyValue<number>,
  "line-offset": PossiblyEvaluatedPropertyValue<number>,
  "line-blur": PossiblyEvaluatedPropertyValue<number>,
  "line-dasharray": CrossFaded<Array<number>>,
  "line-pattern": PossiblyEvaluatedPropertyValue<CrossFaded<ResolvedImage>>,
  "line-gradient": ColorRampProperty
};

const paint: Properties<PaintProps> = new Properties({
    "line-opacity": new DataDrivenProperty(styleSpec["paint_line"]["line-opacity"] as any as StylePropertySpecification),
    "line-color": new DataDrivenProperty(styleSpec["paint_line"]["line-color"] as any as StylePropertySpecification),
    "line-translate": new DataConstantProperty(styleSpec["paint_line"]["line-translate"] as any as StylePropertySpecification),
    "line-translate-anchor": new DataConstantProperty(styleSpec["paint_line"]["line-translate-anchor"] as any as StylePropertySpecification),
    "line-width": new DataDrivenProperty(styleSpec["paint_line"]["line-width"] as any as StylePropertySpecification),
    "line-gap-width": new DataDrivenProperty(styleSpec["paint_line"]["line-gap-width"] as any as StylePropertySpecification),
    "line-offset": new DataDrivenProperty(styleSpec["paint_line"]["line-offset"] as any as StylePropertySpecification),
    "line-blur": new DataDrivenProperty(styleSpec["paint_line"]["line-blur"] as any as StylePropertySpecification),
    "line-dasharray": new CrossFadedProperty(styleSpec["paint_line"]["line-dasharray"] as any as StylePropertySpecification),
    "line-pattern": new CrossFadedDataDrivenProperty(styleSpec["paint_line"]["line-pattern"] as any as StylePropertySpecification),
    "line-gradient": new ColorRampProperty(styleSpec["paint_line"]["line-gradient"] as any as StylePropertySpecification),
});

export default ({ paint, layout } as {
  paint: Properties<PaintProps>,
  layout: Properties<LayoutProps>
});
