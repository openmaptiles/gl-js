// This file is generated. Edit build/generate-style-code.js, then run `yarn run codegen`.
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

export type LayoutProps = {
  "circle-sort-key": DataDrivenProperty<number>
};

export type LayoutPropsPossiblyEvaluated = {
  "circle-sort-key": PossiblyEvaluatedPropertyValue<number>
};

const layout: Properties<LayoutProps> = new Properties({
    "circle-sort-key": new DataDrivenProperty(styleSpec["layout_circle"]["circle-sort-key"] as any as StylePropertySpecification),
});

export type PaintProps = {
  "circle-radius": DataDrivenProperty<number>,
  "circle-color": DataDrivenProperty<Color>,
  "circle-blur": DataDrivenProperty<number>,
  "circle-opacity": DataDrivenProperty<number>,
  "circle-translate": DataConstantProperty<[number, number]>,
  "circle-translate-anchor": DataConstantProperty<"map" | "viewport">,
  "circle-pitch-scale": DataConstantProperty<"map" | "viewport">,
  "circle-pitch-alignment": DataConstantProperty<"map" | "viewport">,
  "circle-stroke-width": DataDrivenProperty<number>,
  "circle-stroke-color": DataDrivenProperty<Color>,
  "circle-stroke-opacity": DataDrivenProperty<number>
};

export type PaintPropsPossiblyEvaluated = {
  "circle-radius": PossiblyEvaluatedPropertyValue<number>,
  "circle-color": PossiblyEvaluatedPropertyValue<Color>,
  "circle-blur": PossiblyEvaluatedPropertyValue<number>,
  "circle-opacity": PossiblyEvaluatedPropertyValue<number>,
  "circle-translate": [number, number],
  "circle-translate-anchor": "map" | "viewport",
  "circle-pitch-scale": "map" | "viewport",
  "circle-pitch-alignment": "map" | "viewport",
  "circle-stroke-width": PossiblyEvaluatedPropertyValue<number>,
  "circle-stroke-color": PossiblyEvaluatedPropertyValue<Color>,
  "circle-stroke-opacity": PossiblyEvaluatedPropertyValue<number>
};

const paint: Properties<PaintProps> = new Properties({
    "circle-radius": new DataDrivenProperty(styleSpec["paint_circle"]["circle-radius"] as any as StylePropertySpecification),
    "circle-color": new DataDrivenProperty(styleSpec["paint_circle"]["circle-color"] as any as StylePropertySpecification),
    "circle-blur": new DataDrivenProperty(styleSpec["paint_circle"]["circle-blur"] as any as StylePropertySpecification),
    "circle-opacity": new DataDrivenProperty(styleSpec["paint_circle"]["circle-opacity"] as any as StylePropertySpecification),
    "circle-translate": new DataConstantProperty(styleSpec["paint_circle"]["circle-translate"] as any as StylePropertySpecification),
    "circle-translate-anchor": new DataConstantProperty(styleSpec["paint_circle"]["circle-translate-anchor"] as any as StylePropertySpecification),
    "circle-pitch-scale": new DataConstantProperty(styleSpec["paint_circle"]["circle-pitch-scale"] as any as StylePropertySpecification),
    "circle-pitch-alignment": new DataConstantProperty(styleSpec["paint_circle"]["circle-pitch-alignment"] as any as StylePropertySpecification),
    "circle-stroke-width": new DataDrivenProperty(styleSpec["paint_circle"]["circle-stroke-width"] as any as StylePropertySpecification),
    "circle-stroke-color": new DataDrivenProperty(styleSpec["paint_circle"]["circle-stroke-color"] as any as StylePropertySpecification),
    "circle-stroke-opacity": new DataDrivenProperty(styleSpec["paint_circle"]["circle-stroke-opacity"] as any as StylePropertySpecification),
});

export default ({ paint, layout } as {
  paint: Properties<PaintProps>,
  layout: Properties<LayoutProps>
});
