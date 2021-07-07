import maplibregl from '../../src/index.js';
import accessToken from '../lib/access_token.js';
import locationsWithTileID from '../lib/locations_with_tile_id.js';
import styleBenchmarkLocations from '@mapbox/gazetteer/benchmark/style-benchmark-locations.json';
import StyleLayerCreate from '../benchmarks/style_layer_create.js';
import Validate from '../benchmarks/style_validate.js';
import Layout from '../benchmarks/layout.js';
import Paint from '../benchmarks/paint.js';
import QueryPoint from '../benchmarks/query_point.js';
import QueryBox from '../benchmarks/query_box.js';

import getWorkerPool from '../../src/util/global_worker_pool.js';

const locations = locationsWithTileID(styleBenchmarkLocations.features);

maplibregl.accessToken = accessToken;

const benchmarks = window.benchmarks = [];

function register(name, Benchmark, locations, location) {
    const versions = [];

    for (const style of process.env.MAPBOX_STYLES) {
        versions.push({
            name: style.name || style.replace('mapbox://styles/', ''),
            bench: new Benchmark(style, locations)
        });
    }
    benchmarks.push({name, versions, location});
}

register('StyleLayerCreate', StyleLayerCreate);
register('Validate', Validate);
locations.forEach(location => register('Layout', Layout, location.tileID, location));
locations.forEach(location => register('Paint', Paint, [location], location));
register('QueryPoint', QueryPoint, locations);
register('QueryBox', QueryBox, locations);

Promise.resolve().then(() => {
    // Ensure the global worker pool is never drained. Browsers have resource limits
    // on the max number of workers that can be created per page.
    // We do this async to avoid creating workers before the worker bundle blob
    // URL has been set up, which happens after this module is executed.
    getWorkerPool().acquire(-1);
});

export default maplibregl;
