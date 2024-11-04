import {FeatureIndex} from './feature_index';
import {OverscaledTileID} from '../source/tile_id';
import type {VectorTileFeature} from '@mapbox/vector-tile';
import {log} from 'console';

describe('FeatureIndex', () => {
    describe('getId', () => {
        const tileID = new OverscaledTileID(0, 0, 0, 0, 0);
        
        test('converts boolean ids to numbers', () => {
            const featureIndex = new FeatureIndex(tileID, 'someProperty');
            const feature = {
                id: 1,
                properties: {
                    someProperty: true
                },
                geometry: {
                    type: 'Point',
                    coordinates: [0, 0]
                },
                extent: 4096,
                type: 1,
                loadGeometry: () => [],
                toGeoJSON: () => ({})
            } as unknown as VectorTileFeature;
            expect(featureIndex.getId(feature, 'sourceLayer')).toBe(1);
        });

        test('uses cluster_id when cluster is true and id is undefined', () => {
            const featureIndex = new FeatureIndex(tileID, 'someProperty');
            const feature = {
                properties: {
                    cluster: true,
                    cluster_id: '123',
                    promoteId: 'someProperty',
                    someProperty: undefined
                },
                geometry: {
                    type: 'Point',
                    coordinates: [0, 0]
                },
                extent: 4096,
                type: 1,
                loadGeometry: () => [],
                toGeoJSON: () => ({})
            } as unknown as VectorTileFeature;
            
            expect(featureIndex.getId(feature, 'sourceLayer')).toBe(123); // cluster_id converted to number
        });
    });
});