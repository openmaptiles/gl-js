import path, {dirname} from 'path';
import replace from '@rollup/plugin-replace';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import unassert from 'rollup-plugin-unassert';
import json from '@rollup/plugin-json';
import {fileURLToPath} from 'url';

const esm = 'esm' in process.env;

const config = [{
    input: 'rollup/build/tsc/style-spec/style-spec.js',
    output: {
        name: 'maplibreGlStyleSpecification',
        file: `dist/style-spec/${esm ? 'index.es.js' : 'index.js'}`,
        format: esm ? 'esm' : 'umd',
        sourcemap: true
    },
    plugins: [
        {
            name: 'dep-checker',
            resolveId(source, importer) {
                // Some users reference modules within style-spec package directly, instead of the bundle
                // This means that files within the style-spec package should NOT import files from the parent maplibre-gl-js tree.
                // This check will cause the build to fail on CI allowing these issues to be caught.
                if (importer && !importer.includes('node_modules')) {
                    const resolvedPath = path.join(importer, source);
                    const fromRoot = path.relative(dirname(fileURLToPath(import.meta.url)), resolvedPath);
                    if (fromRoot.length > 2 && fromRoot.slice(0, 2) === '..') {
                        throw new Error(`Module ${importer} imports ${source} from outside the style-spec package root directory.`);
                    }
                }

                return null;
            }
        },
        // https://github.com/zaach/jison/issues/351
        replace({
            include: /\/jsonlint-lines-primitives\/lib\/jsonlint.js/,
            delimiters: ['', ''],
            values: {
                '_token_stack:': ''
            }
        }),
        json(),
        unassert(),
        resolve({
            browser: true,
            preferBuiltins: false
        }),
        commonjs()
    ]
}];
export default config;
