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

import {
    ColorType
} from '../../style-spec/expression/types';
import { StylePropertySpecification } from '../../style-spec/style-spec';

export type LayoutProps = {
  "symbol-placement": DataConstantProperty<"point" | "line" | "line-center">,
  "symbol-spacing": DataConstantProperty<number>,
  "symbol-avoid-edges": DataConstantProperty<boolean>,
  "symbol-sort-key": DataDrivenProperty<number>,
  "symbol-z-order": DataConstantProperty<"auto" | "viewport-y" | "source">,
  "icon-allow-overlap": DataConstantProperty<boolean>,
  "icon-ignore-placement": DataConstantProperty<boolean>,
  "icon-optional": DataConstantProperty<boolean>,
  "icon-rotation-alignment": DataConstantProperty<"map" | "viewport" | "auto">,
  "icon-size": DataDrivenProperty<number>,
  "icon-text-fit": DataConstantProperty<"none" | "width" | "height" | "both">,
  "icon-text-fit-padding": DataConstantProperty<[number, number, number, number]>,
  "icon-image": DataDrivenProperty<ResolvedImage>,
  "icon-rotate": DataDrivenProperty<number>,
  "icon-padding": DataConstantProperty<number>,
  "icon-keep-upright": DataConstantProperty<boolean>,
  "icon-offset": DataDrivenProperty<[number, number]>,
  "icon-anchor": DataDrivenProperty<"center" | "left" | "right" | "top" | "bottom" | "top-left" | "top-right" | "bottom-left" | "bottom-right">,
  "icon-pitch-alignment": DataConstantProperty<"map" | "viewport" | "auto">,
  "text-pitch-alignment": DataConstantProperty<"map" | "viewport" | "auto">,
  "text-rotation-alignment": DataConstantProperty<"map" | "viewport" | "auto">,
  "text-field": DataDrivenProperty<Formatted>,
  "text-font": DataDrivenProperty<Array<string>>,
  "text-size": DataDrivenProperty<number>,
  "text-max-width": DataDrivenProperty<number>,
  "text-line-height": DataConstantProperty<number>,
  "text-letter-spacing": DataDrivenProperty<number>,
  "text-justify": DataDrivenProperty<"auto" | "left" | "center" | "right">,
  "text-radial-offset": DataDrivenProperty<number>,
  "text-variable-anchor": DataConstantProperty<Array<"center" | "left" | "right" | "top" | "bottom" | "top-left" | "top-right" | "bottom-left" | "bottom-right">>,
  "text-anchor": DataDrivenProperty<"center" | "left" | "right" | "top" | "bottom" | "top-left" | "top-right" | "bottom-left" | "bottom-right">,
  "text-max-angle": DataConstantProperty<number>,
  "text-writing-mode": DataConstantProperty<Array<"horizontal" | "vertical">>,
  "text-rotate": DataDrivenProperty<number>,
  "text-padding": DataConstantProperty<number>,
  "text-keep-upright": DataConstantProperty<boolean>,
  "text-transform": DataDrivenProperty<"none" | "uppercase" | "lowercase">,
  "text-offset": DataDrivenProperty<[number, number]>,
  "text-allow-overlap": DataConstantProperty<boolean>,
  "text-ignore-placement": DataConstantProperty<boolean>,
  "text-optional": DataConstantProperty<boolean>
};

export type LayoutPropsPossiblyEvaluated = {
  "symbol-placement": "point" | "line" | "line-center",
  "symbol-spacing": number,
  "symbol-avoid-edges": boolean,
  "symbol-sort-key": PossiblyEvaluatedPropertyValue<number>,
  "symbol-z-order": "auto" | "viewport-y" | "source",
  "icon-allow-overlap": boolean,
  "icon-ignore-placement": boolean,
  "icon-optional": boolean,
  "icon-rotation-alignment": "map" | "viewport" | "auto",
  "icon-size": PossiblyEvaluatedPropertyValue<number>,
  "icon-text-fit": "none" | "width" | "height" | "both",
  "icon-text-fit-padding": [number, number, number, number],
  "icon-image": PossiblyEvaluatedPropertyValue<ResolvedImage>,
  "icon-rotate": PossiblyEvaluatedPropertyValue<number>,
  "icon-padding": number,
  "icon-keep-upright": boolean,
  "icon-offset": PossiblyEvaluatedPropertyValue<[number, number]>,
  "icon-anchor": PossiblyEvaluatedPropertyValue<"center" | "left" | "right" | "top" | "bottom" | "top-left" | "top-right" | "bottom-left" | "bottom-right">,
  "icon-pitch-alignment": "map" | "viewport" | "auto",
  "text-pitch-alignment": "map" | "viewport" | "auto",
  "text-rotation-alignment": "map" | "viewport" | "auto",
  "text-field": PossiblyEvaluatedPropertyValue<Formatted>,
  "text-font": PossiblyEvaluatedPropertyValue<Array<string>>,
  "text-size": PossiblyEvaluatedPropertyValue<number>,
  "text-max-width": PossiblyEvaluatedPropertyValue<number>,
  "text-line-height": number,
  "text-letter-spacing": PossiblyEvaluatedPropertyValue<number>,
  "text-justify": PossiblyEvaluatedPropertyValue<"auto" | "left" | "center" | "right">,
  "text-radial-offset": PossiblyEvaluatedPropertyValue<number>,
  "text-variable-anchor": Array<"center" | "left" | "right" | "top" | "bottom" | "top-left" | "top-right" | "bottom-left" | "bottom-right">,
  "text-anchor": PossiblyEvaluatedPropertyValue<"center" | "left" | "right" | "top" | "bottom" | "top-left" | "top-right" | "bottom-left" | "bottom-right">,
  "text-max-angle": number,
  "text-writing-mode": Array<"horizontal" | "vertical">,
  "text-rotate": PossiblyEvaluatedPropertyValue<number>,
  "text-padding": number,
  "text-keep-upright": boolean,
  "text-transform": PossiblyEvaluatedPropertyValue<"none" | "uppercase" | "lowercase">,
  "text-offset": PossiblyEvaluatedPropertyValue<[number, number]>,
  "text-allow-overlap": boolean,
  "text-ignore-placement": boolean,
  "text-optional": boolean
};

const layout: Properties<LayoutProps> = new Properties({
    "symbol-placement": new DataConstantProperty(styleSpec["layout_symbol"]["symbol-placement"] as any as StylePropertySpecification),
    "symbol-spacing": new DataConstantProperty(styleSpec["layout_symbol"]["symbol-spacing"] as any as StylePropertySpecification),
    "symbol-avoid-edges": new DataConstantProperty(styleSpec["layout_symbol"]["symbol-avoid-edges"] as any as StylePropertySpecification),
    "symbol-sort-key": new DataDrivenProperty(styleSpec["layout_symbol"]["symbol-sort-key"] as any as StylePropertySpecification),
    "symbol-z-order": new DataConstantProperty(styleSpec["layout_symbol"]["symbol-z-order"] as any as StylePropertySpecification),
    "icon-allow-overlap": new DataConstantProperty(styleSpec["layout_symbol"]["icon-allow-overlap"] as any as StylePropertySpecification),
    "icon-ignore-placement": new DataConstantProperty(styleSpec["layout_symbol"]["icon-ignore-placement"] as any as StylePropertySpecification),
    "icon-optional": new DataConstantProperty(styleSpec["layout_symbol"]["icon-optional"] as any as StylePropertySpecification),
    "icon-rotation-alignment": new DataConstantProperty(styleSpec["layout_symbol"]["icon-rotation-alignment"] as any as StylePropertySpecification),
    "icon-size": new DataDrivenProperty(styleSpec["layout_symbol"]["icon-size"] as any as StylePropertySpecification),
    "icon-text-fit": new DataConstantProperty(styleSpec["layout_symbol"]["icon-text-fit"] as any as StylePropertySpecification),
    "icon-text-fit-padding": new DataConstantProperty(styleSpec["layout_symbol"]["icon-text-fit-padding"] as any as StylePropertySpecification),
    "icon-image": new DataDrivenProperty(styleSpec["layout_symbol"]["icon-image"] as any as StylePropertySpecification),
    "icon-rotate": new DataDrivenProperty(styleSpec["layout_symbol"]["icon-rotate"] as any as StylePropertySpecification),
    "icon-padding": new DataConstantProperty(styleSpec["layout_symbol"]["icon-padding"] as any as StylePropertySpecification),
    "icon-keep-upright": new DataConstantProperty(styleSpec["layout_symbol"]["icon-keep-upright"] as any as StylePropertySpecification),
    "icon-offset": new DataDrivenProperty(styleSpec["layout_symbol"]["icon-offset"] as any as StylePropertySpecification),
    "icon-anchor": new DataDrivenProperty(styleSpec["layout_symbol"]["icon-anchor"] as any as StylePropertySpecification),
    "icon-pitch-alignment": new DataConstantProperty(styleSpec["layout_symbol"]["icon-pitch-alignment"] as any as StylePropertySpecification),
    "text-pitch-alignment": new DataConstantProperty(styleSpec["layout_symbol"]["text-pitch-alignment"] as any as StylePropertySpecification),
    "text-rotation-alignment": new DataConstantProperty(styleSpec["layout_symbol"]["text-rotation-alignment"] as any as StylePropertySpecification),
    "text-field": new DataDrivenProperty(styleSpec["layout_symbol"]["text-field"] as any as StylePropertySpecification),
    "text-font": new DataDrivenProperty(styleSpec["layout_symbol"]["text-font"] as any as StylePropertySpecification),
    "text-size": new DataDrivenProperty(styleSpec["layout_symbol"]["text-size"] as any as StylePropertySpecification),
    "text-max-width": new DataDrivenProperty(styleSpec["layout_symbol"]["text-max-width"] as any as StylePropertySpecification),
    "text-line-height": new DataConstantProperty(styleSpec["layout_symbol"]["text-line-height"] as any as StylePropertySpecification),
    "text-letter-spacing": new DataDrivenProperty(styleSpec["layout_symbol"]["text-letter-spacing"] as any as StylePropertySpecification),
    "text-justify": new DataDrivenProperty(styleSpec["layout_symbol"]["text-justify"] as any as StylePropertySpecification),
    "text-radial-offset": new DataDrivenProperty(styleSpec["layout_symbol"]["text-radial-offset"] as any as StylePropertySpecification),
    "text-variable-anchor": new DataConstantProperty(styleSpec["layout_symbol"]["text-variable-anchor"] as any as StylePropertySpecification),
    "text-anchor": new DataDrivenProperty(styleSpec["layout_symbol"]["text-anchor"] as any as StylePropertySpecification),
    "text-max-angle": new DataConstantProperty(styleSpec["layout_symbol"]["text-max-angle"] as any as StylePropertySpecification),
    "text-writing-mode": new DataConstantProperty(styleSpec["layout_symbol"]["text-writing-mode"] as any as StylePropertySpecification),
    "text-rotate": new DataDrivenProperty(styleSpec["layout_symbol"]["text-rotate"] as any as StylePropertySpecification),
    "text-padding": new DataConstantProperty(styleSpec["layout_symbol"]["text-padding"] as any as StylePropertySpecification),
    "text-keep-upright": new DataConstantProperty(styleSpec["layout_symbol"]["text-keep-upright"] as any as StylePropertySpecification),
    "text-transform": new DataDrivenProperty(styleSpec["layout_symbol"]["text-transform"] as any as StylePropertySpecification),
    "text-offset": new DataDrivenProperty(styleSpec["layout_symbol"]["text-offset"] as any as StylePropertySpecification),
    "text-allow-overlap": new DataConstantProperty(styleSpec["layout_symbol"]["text-allow-overlap"] as any as StylePropertySpecification),
    "text-ignore-placement": new DataConstantProperty(styleSpec["layout_symbol"]["text-ignore-placement"] as any as StylePropertySpecification),
    "text-optional": new DataConstantProperty(styleSpec["layout_symbol"]["text-optional"] as any as StylePropertySpecification)
});

export type PaintProps = {
  "icon-opacity": DataDrivenProperty<number>,
  "icon-color": DataDrivenProperty<Color>,
  "icon-halo-color": DataDrivenProperty<Color>,
  "icon-halo-width": DataDrivenProperty<number>,
  "icon-halo-blur": DataDrivenProperty<number>,
  "icon-translate": DataConstantProperty<[number, number]>,
  "icon-translate-anchor": DataConstantProperty<"map" | "viewport">,
  "text-opacity": DataDrivenProperty<number>,
  "text-color": DataDrivenProperty<Color>,
  "text-halo-color": DataDrivenProperty<Color>,
  "text-halo-width": DataDrivenProperty<number>,
  "text-halo-blur": DataDrivenProperty<number>,
  "text-translate": DataConstantProperty<[number, number]>,
  "text-translate-anchor": DataConstantProperty<"map" | "viewport">
};

export type PaintPropsPossiblyEvaluated = {
  "icon-opacity": PossiblyEvaluatedPropertyValue<number>,
  "icon-color": PossiblyEvaluatedPropertyValue<Color>,
  "icon-halo-color": PossiblyEvaluatedPropertyValue<Color>,
  "icon-halo-width": PossiblyEvaluatedPropertyValue<number>,
  "icon-halo-blur": PossiblyEvaluatedPropertyValue<number>,
  "icon-translate": [number, number],
  "icon-translate-anchor": "map" | "viewport",
  "text-opacity": PossiblyEvaluatedPropertyValue<number>,
  "text-color": PossiblyEvaluatedPropertyValue<Color>,
  "text-halo-color": PossiblyEvaluatedPropertyValue<Color>,
  "text-halo-width": PossiblyEvaluatedPropertyValue<number>,
  "text-halo-blur": PossiblyEvaluatedPropertyValue<number>,
  "text-translate": [number, number],
  "text-translate-anchor": "map" | "viewport"
};


const paint: Properties<PaintProps> = new Properties({
    "icon-opacity": new DataDrivenProperty(styleSpec["paint_symbol"]["icon-opacity"] as any as StylePropertySpecification),
    "icon-color": new DataDrivenProperty(styleSpec["paint_symbol"]["icon-color"] as any as StylePropertySpecification),
    "icon-halo-color": new DataDrivenProperty(styleSpec["paint_symbol"]["icon-halo-color"] as any as StylePropertySpecification),
    "icon-halo-width": new DataDrivenProperty(styleSpec["paint_symbol"]["icon-halo-width"] as any as StylePropertySpecification),
    "icon-halo-blur": new DataDrivenProperty(styleSpec["paint_symbol"]["icon-halo-blur"] as any as StylePropertySpecification),
    "icon-translate": new DataConstantProperty(styleSpec["paint_symbol"]["icon-translate"] as any as StylePropertySpecification),
    "icon-translate-anchor": new DataConstantProperty(styleSpec["paint_symbol"]["icon-translate-anchor"] as any as StylePropertySpecification),
    "text-opacity": new DataDrivenProperty(styleSpec["paint_symbol"]["text-opacity"] as any as StylePropertySpecification),
    "text-color": new DataDrivenProperty(styleSpec["paint_symbol"]["text-color"] as any as StylePropertySpecification, { runtimeType: ColorType, getOverride: (o) => o.textColor, hasOverride: (o) => !!o.textColor }),
    "text-halo-color": new DataDrivenProperty(styleSpec["paint_symbol"]["text-halo-color"] as any as StylePropertySpecification),
    "text-halo-width": new DataDrivenProperty(styleSpec["paint_symbol"]["text-halo-width"] as any as StylePropertySpecification),
    "text-halo-blur": new DataDrivenProperty(styleSpec["paint_symbol"]["text-halo-blur"] as any as StylePropertySpecification),
    "text-translate": new DataConstantProperty(styleSpec["paint_symbol"]["text-translate"] as any as StylePropertySpecification),
    "text-translate-anchor": new DataConstantProperty(styleSpec["paint_symbol"]["text-translate-anchor"] as any as StylePropertySpecification),
});

export default ({ paint, layout } as {
  paint: Properties<PaintProps>,
  layout: Properties<LayoutProps>
});
