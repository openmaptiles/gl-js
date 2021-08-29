/* eslint-disable import/unambiguous, import/no-commonjs, no-global-assign */

import './stub_loader';
import * as querySuite from './integration/lib/query';
import suiteImplementation from './suite_implementation';
import ignores from './ignores.json';
import {fileURLToPath} from 'url';

let tests;

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename && process.argv.length > 2) {
    tests = process.argv.slice(2);
}

querySuite.run('js', {tests, ignores}, suiteImplementation);
