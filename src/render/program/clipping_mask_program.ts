import {UniformMatrix4f} from '../uniform_binding';

import type Context from '../../gl/context';
import type {UniformValues, UniformLocations} from '../uniform_binding';
import {mat4} from 'gl-matrix';

export type ClippingMaskUniformsType = {
  'u_matrix': UniformMatrix4f
};

const clippingMaskUniforms = (context: Context, locations: UniformLocations): ClippingMaskUniformsType => ({
    'u_matrix': new UniformMatrix4f(context, locations.u_matrix)
});

const clippingMaskUniformValues = (matrix: mat4): UniformValues<ClippingMaskUniformsType> => ({
    'u_matrix': matrix
});

export {clippingMaskUniforms, clippingMaskUniformValues};
