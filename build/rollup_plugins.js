
import resolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import commonjs from '@rollup/plugin-commonjs';
import unassert from 'rollup-plugin-unassert';
import json from '@rollup/plugin-json';
import {terser} from 'rollup-plugin-terser';
import minifyStyleSpec from './rollup_plugin_minify_style_spec.js';
import strip from '@rollup/plugin-strip';

// Common set of plugins/transformations shared across different rollup
// builds (main maplibre bundle, style-spec package, benchmarks bundle)

export const plugins = (minified, production) => [
    minifyStyleSpec(),
    json(),
    // https://github.com/zaach/jison/issues/351
    replace({
        include: /\/jsonlint-lines-primitives\/lib\/jsonlint.js/,
        delimiters: ['', ''],
        values: {
            '_token_stack:': ''
        }
    }),
    production ? strip({
        sourceMap: true,
        functions: ['PerformanceUtils.*', 'Debug.*']
    }) : false,
    minified ? terser({
        compress: {
            pure_getters: true,
            passes: 3
        }
    }) : false,
    production ? unassert() : false,
    resolve({
        browser: true,
        preferBuiltins: false
    }),
    commonjs({
        // global keyword handling causes Webpack compatibility issues, so we disabled it:
        // https://github.com/mapbox/mapbox-gl-js/pull/6956
        ignoreGlobal: true
    })
].filter(Boolean);
