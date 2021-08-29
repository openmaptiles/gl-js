import gl from 'gl';
import {JSDOM, VirtualConsole} from "jsdom";
import {PNG} from 'pngjs';
import sinon from 'sinon';

let lastDataFromUrl = null;

// The following is the mocking of what's needed in window and global for the tests to run.
const {window} = new JSDOM('', {
    // Send jsdom console output to the node console object.
    virtualConsole: new VirtualConsole().sendTo(console)
});

global.ImageData = window.ImageData || function () { return false; };
global.ImageBitmap = window.ImageBitmap || function () { return false; };
global.WebGLFramebuffer = window.WebGLFramebuffer || Object;
global.HTMLElement = window.HTMLElement;
global.HTMLImageElement = window.HTMLImageElement;
global.HTMLVideoElement = window.HTMLVideoElement;
global.HTMLCanvasElement = window.HTMLCanvasElement;
global.OffscreenCanvas = window.OffscreenCanvas;
global.Image = window.Image;
global.navigator = window.navigator;
global.performance = window.performance;
global.devicePixelRatio = window.devicePixelRatio;
global.addEventListener = window.addEventListener;
global.removeEventListener = window.removeEventListener;
global.matchMedia = window.matchMedia;
global.caches = window.caches;
global.WheelEvent = window.WheelEvent;
global.Blob = window.Blob;
global.URL = window.URL;
global.fetch = window.fetch;
global.document = window.document;
global.window = window;
// stubbing image load as it is not implemented in jsdom
// eslint-disable-next-line accessor-pairs
Object.defineProperty(global.Image.prototype, 'src', {
    set(src) {
        if (!this.onload) {
            return;
        }
        if (src.startsWith('data:image/png')) {
            const base64 = src.replace(/data:.*;base64,/, '');
            const buff = Buffer.from(base64, 'base64');
            new PNG().parse(buff, (err, png) => {
                if (err) throw new Error("Couldn't parse PNG");
                this.data = png.data;
                this.height = png.height;
                this.width = png.width;
                this.onload();
            });
            return;
        }
        if (src && typeof src === 'string' && !src.startsWith('blob')) {
            this.onload();
            return;
        }
        if (!lastDataFromUrl) {
            return;
        }
        if (lastDataFromUrl.size < 10) {
            // if this is not a valid image load it anyway but don't set the data for later use
            // this is the case in the unit tests
            this.onload();
            return;
        }
        const reader = new window.FileReader();
        reader.onload = (_) => {
            const dataUrl = reader.result;
            new PNG().parse(dataUrl, (err, png) => {
                if (err) throw new Error("Couldn't parse PNG");
                this.data = png.data;
                this.height = png.height;
                this.width = png.width;
                this.onload();
            });
        };
        reader.readAsArrayBuffer(lastDataFromUrl);
    }
});

// Delete local and session storage from JSDOM and stub them out with a warning log
// Accessing these properties during extend() produces an error in Node environments
// See https://github.com/mapbox/mapbox-gl-js/pull/7455 for discussion
delete window.localStorage;
delete window.sessionStorage;
window.localStorage = window.sessionStorage = () => console.log('Local and session storage not available in Node. Use a stub implementation if needed for testing.');

window.devicePixelRatio = 1;

global.requestAnimationFrame = window.requestAnimationFrame = (callback) => {
    return setImmediate(callback, 0);
};
global.cancelAnimationFrame = clearImmediate;

// Add webgl context with the supplied GL
const originalGetContext = global.HTMLCanvasElement.prototype.getContext;

function imitateWebGlGetContext(type, attributes) {
    if (type === 'webgl') {
        if (!this._webGLContext) {
            this._webGLContext = gl(this.width, this.height, attributes);
        }
        return this._webGLContext;
    }
    // Fallback to existing HTMLCanvasElement getContext behaviour
    return originalGetContext.call(this, type, attributes);
}
global.HTMLCanvasElement.prototype.getContext = imitateWebGlGetContext;

window.useFakeXMLHttpRequest = () => {
    sinon.xhr.supportsCORS = true;
    window.server = sinon.fakeServer.create();
    global.XMLHttpRequest = window.server.xhr;
};

window.clearFakeXMLHttpRequest = () => {
    window.server = null;
    global.XMLHttpRequest = null;
};

global.URL.createObjectURL = (blob) => {
    lastDataFromUrl = blob;
    return 'blob:';
};

global.URL.revokeObjectURL = () => {
    lastDataFromUrl = null;
};

window.useFakeWorkerPresence = () => {
    global.WorkerGlobalScope = function () { };
    global.self = new global.WorkerGlobalScope();
};
window.clearFakeWorkerPresence = () => {
    global.WorkerGlobalScope = undefined;
    global.self = undefined;
};

window.performance.getEntriesByName = () => { };
window.performance.mark = () => { };
window.performance.measure = () => { };
window.performance.clearMarks = () => { };
window.performance.clearMeasures = () => { };

