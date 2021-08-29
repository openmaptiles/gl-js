import {plugins} from '../../build/rollup_plugins.js';

export default {
    input: 'test/integration/lib/query-browser.js',
    output: {
        name: 'queryTests',
        format: 'iife',
        sourcemap: 'inline',
        indent: false,
        file: 'test/integration/dist/query-test.js'
    },
    plugins: plugins(false, false),
    external: [ 'tape', 'maplibregl' ]
};
