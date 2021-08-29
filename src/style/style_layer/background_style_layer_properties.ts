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


export type PaintProps = {
  "background-color": DataConstantProperty<Color>,
  "background-pattern": CrossFadedProperty<ResolvedImage>,
  "background-opacity": DataConstantProperty<number>
};

export type PaintPropsPossiblyEvaluated = {
  "background-color": Color,
  "background-pattern": CrossFaded<ResolvedImage>,
  "background-opacity": number
};

const paint: Properties<PaintProps> = new Properties({
    "background-color": new DataConstantProperty(styleSpec["paint_background"]["background-color"] as any as StylePropertySpecification),
    "background-pattern": new CrossFadedProperty(styleSpec["paint_background"]["background-pattern"] as any as StylePropertySpecification),
    "background-opacity": new DataConstantProperty(styleSpec["paint_background"]["background-opacity"] as any as StylePropertySpecification),
});

// Note: without adding the explicit type annotation, Flow infers weaker types
// for these objects from their use in the constructor to StyleLayer, as
// {layout?: Properties<...>, paint: Properties<...>}
export default ({ paint } as {
  paint: Properties<PaintProps>
});
