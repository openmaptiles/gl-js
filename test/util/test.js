/* @flow */

import tap from 'tap';
import sinon from 'sinon';

export const test = tap.test;
export const only = tap.only;

const consoleError = console.error;
const consoleWarn = console.warn;

tap.beforeEach(function (done) {
    this.sandbox = sinon.createSandbox({
        injectInto: this,
        properties: ['spy', 'stub', 'mock']
    });

    // $FlowFixMe the assignment is intentional
    console.error = (msg) => this.fail(`console.error called -- please adjust your test (maybe stub console.error?)\n${msg}`);
    // $FlowFixMe the assignment is intentional
    console.warn = () => this.fail(`console.warn called -- please adjust your test (maybe stub console.warn?)`);

    done();
});

tap.afterEach(function (done) {
    // $FlowFixMe the assignment is intentional
    console.error = consoleError;
    // $FlowFixMe the assignment is intentional
    console.warn = consoleWarn;

    this.sandbox.restore();

    done();
});
