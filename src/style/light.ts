import styleSpec from '../style-spec/reference/latest';

import {endsWith, extend, sphericalToCartesian} from '../util/util';
import {Evented} from '../util/evented';
import {
    validateStyle,
    validateLight,
    emitValidationErrors
} from './validate_style';
import Color from '../style-spec/util/color';
import {number as interpolate} from '../style-spec/util/interpolate';

import type {StylePropertySpecification} from '../style-spec/style-spec';
import type EvaluationParameters from './evaluation_parameters';
import type {StyleSetterOptions} from '../style/style';
import {Properties, Transitionable, Transitioning, PossiblyEvaluated, DataConstantProperty} from './properties';

import type {
    Property,
    PropertyValue,
    TransitionParameters
} from './properties';

import type {LightSpecification} from '../style-spec/types';

type LightPosition = {
  x: number,
  y: number,
  z: number
};

class LightPositionProperty implements Property<[number, number, number], LightPosition> {
    specification: StylePropertySpecification;

    constructor() {
        this.specification = styleSpec.light.position as StylePropertySpecification;
    }

    possiblyEvaluate(
      value: PropertyValue<[number, number, number], LightPosition>,
      parameters: EvaluationParameters
    ): LightPosition {
        return sphericalToCartesian(value.expression.evaluate(parameters));
    }

    interpolate(a: LightPosition, b: LightPosition, t: number): LightPosition {
        return {
            x: interpolate(a.x, b.x, t),
            y: interpolate(a.y, b.y, t),
            z: interpolate(a.z, b.z, t),
        };
    }
}

type Props = {
  "anchor": DataConstantProperty<"map" | "viewport">,
  "position": LightPositionProperty,
  "color": DataConstantProperty<Color>,
  "intensity": DataConstantProperty<number>
};

type PropsPossiblyEvaluated = {
    "anchor": "map" | "viewport",
    "position": LightPosition,
    "color": Color,
    "intensity": number
};

const properties: Properties<Props> = new Properties({
    "anchor": new DataConstantProperty(styleSpec.light.anchor as StylePropertySpecification),
    "position": new LightPositionProperty(),
    "color": new DataConstantProperty(styleSpec.light.color as StylePropertySpecification),
    "intensity": new DataConstantProperty(styleSpec.light.intensity as StylePropertySpecification),
});

const TRANSITION_SUFFIX = '-transition';

/*
 * Represents the light used to light extruded features.
 */
class Light extends Evented {
    _transitionable: Transitionable<Props>;
    _transitioning: Transitioning<Props>;
    properties: PossiblyEvaluated<Props, PropsPossiblyEvaluated>;

    constructor(lightOptions?: LightSpecification) {
        super();
        this._transitionable = new Transitionable(properties);
        this.setLight(lightOptions);
        this._transitioning = this._transitionable.untransitioned();
    }

    getLight() {
        return this._transitionable.serialize();
    }

    setLight(light?: LightSpecification, options: StyleSetterOptions = {}) {
        if (this._validate(validateLight, light, options)) {
            return;
        }

        for (const name in light) {
            const value = light[name];
            if (endsWith(name, TRANSITION_SUFFIX)) {
                this._transitionable.setTransition(name.slice(0, -TRANSITION_SUFFIX.length) as keyof Props, value);
            } else {
                this._transitionable.setValue(name as keyof Props, value);
            }
        }
    }

    updateTransitions(parameters: TransitionParameters) {
        this._transitioning = this._transitionable.transitioned(parameters, this._transitioning);
    }

    hasTransition() {
        return this._transitioning.hasTransition();
    }

    recalculate(parameters: EvaluationParameters) {
        this.properties = this._transitioning.possiblyEvaluate(parameters);
    }

    _validate(validate: Function, value: unknown, options?: {
      validate?: boolean
    }) {
        if (options && options.validate === false) {
            return false;
        }

        return emitValidationErrors(this, validate.call(validateStyle, extend({
            value,
            // Workaround for https://github.com/mapbox/mapbox-gl-js/issues/2407
            style: {glyphs: true, sprite: true},
            styleSpec
        })));
    }
}

export default Light;
