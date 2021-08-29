import isBuiltin from 'is-builtin-module';
import * as rollup from 'rollup';
import {test} from '../util/test';
import rollupConfig from '../../rollup.config.style-spec';
import styleSpecPackage from '../../src/style-spec/package.json';
/* eslint-disable import/namespace */
import * as spec from '../../dist/style-spec/index.es.js';

test('@mapbox/mapbox-gl-style-spec npm package', (t) => {
    t.test('build plain ES5 bundle in prepublish', (t) => {
        t.stub(console, 'warn');
        rollup.rollup({
            input: `./rollup/build/tsc/style-spec/style-spec.js`,
            plugins: [{
                resolveId: (id, importer) => {
                    if (
                        /^[\/\.]/.test(id) ||
                        isBuiltin(id) ||
                        /node_modules/.test(importer)
                    ) {
                        return null;
                    }

                    t.ok(styleSpecPackage.dependencies[id], `External dependency ${id} (imported from ${importer}) declared in style-spec's package.json`);
                    return false;
                }
            }].concat(rollupConfig[0].plugins)
        }).then(() => {
            t.end();
        }).catch(e => {
            t.error(e);
        });
    });

    t.test('exports components directly, not behind `default` - https://github.com/mapbox/mapbox-gl-js/issues/6601', (t) => {
        t.notOk(spec.default && spec.default.validate);
        t.ok(spec.validate);
        t.end();
    });

    t.end();
});
