import {type ProjectionSpecification} from '@maplibre/maplibre-gl-style-spec';
import {warnOnce} from '../../util/util';
import {MercatorProjection} from './mercator_projection';
import {MercatorTransform} from './mercator_transform';
import {MercatorCameraHelper} from './mercator_camera_helper';
import {GlobeProjection} from './globe_projection';
import {GlobeTransform} from './globe_transform';
import {GlobeCameraHelper} from './globe_camera_helper';
import {VerticalPerspectiveTransform} from './vertical_perspective_transform';
import type {Projection} from './projection';
import type {ITransform} from '../transform_interface';
import type {ICameraHelper} from './camera_helper';

export function createProjectionFromName(name: ProjectionSpecification['type']): {
    projection: Projection;
    transform: ITransform;
    cameraHelper: ICameraHelper;
} {
    switch (name) {
        case 'mercator':
        {
            return {
                projection: new MercatorProjection(),
                transform: new MercatorTransform(),
                cameraHelper: new MercatorCameraHelper(),
            };
        }
        case 'globe':
        {
            const proj = new GlobeProjection();
            return {
                projection: proj,
                transform: new GlobeTransform(proj),
                cameraHelper: new GlobeCameraHelper(proj),
            };
        }
        case 'vertical-perspective':
        {
            const proj = new GlobeProjection();
            return {
                projection: proj,
                transform: new VerticalPerspectiveTransform(),
                cameraHelper: new GlobeCameraHelper(proj),
            };
        }
        default:
        {
            warnOnce(`Unknown projection name: ${name}. Falling back to mercator projection.`);
            return {
                projection: new MercatorProjection(),
                transform: new MercatorTransform(),
                cameraHelper: new MercatorCameraHelper(),
            };
        }
    }
}
