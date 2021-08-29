// This file was generated. Edit build/generate-style-code.js, see https://github.com/maplibre/maplibre-gl-js/issues/266.
/* eslint-disable */

import styleSpec from '../../style-spec/reference/latest';

import {
    Properties,
    DataConstantProperty,
    DataDrivenProperty,
    CrossFadedDataDrivenProperty,
    CrossFadedProperty,
    ColorRampProperty
} from '../properties';

import type Color from '../../style-spec/util/color';

import type Formatted from '../../style-spec/expression/types/formatted';

import type ResolvedImage from '../../style-spec/expression/types/resolved_image';
import { StylePropertySpecification } from '../../style-spec/style-spec';


export type PaintProps = {
  "hillshade-illumination-direction": DataConstantProperty<number>,
  "hillshade-illumination-anchor": DataConstantProperty<"map" | "viewport">,
  "hillshade-exaggeration": DataConstantProperty<number>,
  "hillshade-shadow-color": DataConstantProperty<Color>,
  "hillshade-highlight-color": DataConstantProperty<Color>,
  "hillshade-accent-color": DataConstantProperty<Color>
};

export type PaintPropsPossiblyEvaluated = {
  "hillshade-illumination-direction": number,
  "hillshade-illumination-anchor": "map" | "viewport",
  "hillshade-exaggeration": number,
  "hillshade-shadow-color": Color,
  "hillshade-highlight-color": Color,
  "hillshade-accent-color": Color
};

const paint: Properties<PaintProps> = new Properties({
    "hillshade-illumination-direction": new DataConstantProperty(styleSpec["paint_hillshade"]["hillshade-illumination-direction"] as any as StylePropertySpecification),
    "hillshade-illumination-anchor": new DataConstantProperty(styleSpec["paint_hillshade"]["hillshade-illumination-anchor"] as any as StylePropertySpecification),
    "hillshade-exaggeration": new DataConstantProperty(styleSpec["paint_hillshade"]["hillshade-exaggeration"] as any as StylePropertySpecification),
    "hillshade-shadow-color": new DataConstantProperty(styleSpec["paint_hillshade"]["hillshade-shadow-color"] as any as StylePropertySpecification),
    "hillshade-highlight-color": new DataConstantProperty(styleSpec["paint_hillshade"]["hillshade-highlight-color"] as any as StylePropertySpecification),
    "hillshade-accent-color": new DataConstantProperty(styleSpec["paint_hillshade"]["hillshade-accent-color"] as any as StylePropertySpecification),
});

// Note: without adding the explicit type annotation, Flow infers weaker types
// for these objects from their use in the constructor to StyleLayer, as
// {layout?: Properties<...>, paint: Properties<...>}
export default ({ paint } as {
  paint: Properties<PaintProps>
});
