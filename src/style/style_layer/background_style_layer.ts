import {StyleLayer} from '../style_layer';

import properties from './background_style_layer_properties.g';
import type {Transitionable, Transitioning, PossiblyEvaluated} from '../properties';

import type {BackgroundPaintProps,BackgroundPaintPropsPossiblyEvaluated} from './background_style_layer_properties.g';
import type {LayerSpecification} from '@maplibre/maplibre-gl-style-spec';

export const isBackgroundStyleLayer = (layer: StyleLayer): layer is BackgroundStyleLayer => layer.type === 'background';

export class BackgroundStyleLayer extends StyleLayer {
    _transitionablePaint: Transitionable<BackgroundPaintProps>;
    _transitioningPaint: Transitioning<BackgroundPaintProps>;
    paint: PossiblyEvaluated<BackgroundPaintProps, BackgroundPaintPropsPossiblyEvaluated>;

    constructor(layer: LayerSpecification) {
        super(layer, properties);
    }
}
