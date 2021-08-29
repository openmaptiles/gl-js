import '../../stub_loader';
import {test} from '../../util/test';
import {
    queryRenderedFeatures,
    querySourceFeatures
} from '../../../rollup/build/tsc/source/query_features.js';
import SourceCache from '../../../rollup/build/tsc/source/source_cache.js';
import Transform from '../../../rollup/build/tsc/geo/transform.js';

test('QueryFeatures#rendered', (t) => {
    t.test('returns empty object if source returns no tiles', (t) => {
        const mockSourceCache = {tilesIn () { return []; }};
        const transform = new Transform();
        const result = queryRenderedFeatures(mockSourceCache, {}, undefined, {}, undefined, transform);
        t.deepEqual(result, []);
        t.end();
    });

    t.end();
});

test('QueryFeatures#source', (t) => {
    t.test('returns empty result when source has no features', (t) => {
        const sourceCache = new SourceCache('test', {
            type: 'geojson',
            data: {type: 'FeatureCollection', features: []}
        }, {
            getActor() {
                return {
                    send(type, params, callback) { return callback(); }
                };
            }
        });
        const result = querySourceFeatures(sourceCache, {});
        t.deepEqual(result, []);
        t.end();
    });

    t.end();
});
