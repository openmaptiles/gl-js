import {extend, warnOnce, isWorker} from './util';
import config from './config';
import {cacheGet, cachePut} from './tile_request_cache';
import webpSupported from './webp_supported';

import type {Callback} from '../types/callback';
import type {Cancelable} from '../types/cancelable';

export interface IResourceType {
    Unknown: keyof this;
    Style: keyof this;
    Source: keyof this;
    Tile: keyof this;
    Glyphs: keyof this;
    SpriteImage: keyof this;
    SpriteJSON: keyof this;
    Image: keyof this;
}

/**
 * The type of a resource.
 * @private
 * @readonly
 * @enum {string}
 */
const ResourceType = {
    Unknown: 'Unknown',
    Style: 'Style',
    Source: 'Source',
    Tile: 'Tile',
    Glyphs: 'Glyphs',
    SpriteImage: 'SpriteImage',
    SpriteJSON: 'SpriteJSON',
    Image: 'Image'
} as IResourceType;
export {ResourceType};

if (typeof Object.freeze == 'function') {
    Object.freeze(ResourceType);
}

/**
 * A `RequestParameters` object to be returned from Map.options.transformRequest callbacks.
 * @typedef {Object} RequestParameters
 * @property {string} url The URL to be requested.
 * @property {Object} headers The headers to be sent with the request.
 * @property {string} method Request method `'GET' | 'POST' | 'PUT'`.
 * @property {string} body Request body.
 * @property {string} type Response body type to be returned `'string' | 'json' | 'arrayBuffer'`.
 * @property {string} credentials `'same-origin'|'include'` Use 'include' to send cookies with cross-origin requests.
 * @property {boolean} collectResourceTiming If true, Resource Timing API information will be collected for these transformed requests and returned in a resourceTiming property of relevant data events.
 * @example
 * // use transformRequest to modify requests that begin with `http://myHost`
 * transformRequest: function(url, resourceType) {
 *  if (resourceType === 'Source' && url.indexOf('http://myHost') > -1) {
 *    return {
 *      url: url.replace('http', 'https'),
 *      headers: { 'my-custom-header': true },
 *      credentials: 'include'  // Include cookies for cross-origin requests
 *    }
 *   }
 *  }
 *
 */
export type RequestParameters = {
    url: string;
    headers?: any;
    method?: 'GET' | 'POST' | 'PUT';
    body?: string;
    type?: 'string' | 'json' | 'arrayBuffer';
    credentials?: 'same-origin' | 'include';
    collectResourceTiming?: boolean;
};

export type ResponseCallback<T> = (
    error?: Error | null,
    data?: T | null,
    cacheControl?: string | null,
    expires?: string | null
) => void;

/**
 * An error thrown when a HTTP request results in an error response.
 * @extends Error
 * @param {number} status The response's HTTP status code.
 * @param {string} statusText The response's HTTP status text.
 * @param {string} url The request's URL.
 * @param {Blob} body The response's body.
 */
export class AJAXError extends Error {
    /**
     * The response's HTTP status code.
     */
    status: number;

    /**
     * The response's HTTP status text.
     */
    statusText: string;

    /**
     * The request's URL.
     */
    url: string;

    /**
     * The response's body.
     */
    body: Blob;

    constructor(status: number, statusText: string, url: string, body: Blob) {
        super(`AJAXError: ${statusText} (${status}): ${url}`);
        this.status = status;
        this.statusText = statusText;
        this.url = url;
        this.body = body;
    }
}

// Ensure that we're sending the correct referrer from blob URL worker bundles.
// For files loaded from the local file system, `location.origin` will be set
// to the string(!) "null" (Firefox), or "file://" (Chrome, Safari, Edge, IE),
// and we will set an empty referrer. Otherwise, we're using the document's URL.
/* global self */
export const getReferrer = isWorker() ?
    () => (self as any).worker && (self as any).worker.referrer :
    () => (window.location.protocol === 'blob:' ? window.parent : window).location.href;

// Determines whether a URL is a file:// URL. This is obviously the case if it begins
// with file://. Relative URLs are also file:// URLs iff the original document was loaded
// via a file:// URL.
const isFileURL = url => /^file:/.test(url) || (/^file:/.test(getReferrer()) && !/^\w+:/.test(url));

function makeFetchRequest(requestParameters: RequestParameters, callback: ResponseCallback<any>): Cancelable {
    const controller = new AbortController();
    const request = new Request(requestParameters.url, {
        method: requestParameters.method || 'GET',
        body: requestParameters.body,
        credentials: requestParameters.credentials,
        headers: requestParameters.headers,
        referrer: getReferrer(),
        signal: controller.signal
    });
    let complete = false;
    let aborted = false;

    const cacheIgnoringSearch = false;

    if (requestParameters.type === 'json') {
        request.headers.set('Accept', 'application/json');
    }

    const validateOrFetch = (err, cachedResponse?, responseIsFresh?) => {
        if (aborted) return;

        if (err) {
            // Do fetch in case of cache error.
            // HTTP pages in Edge trigger a security error that can be ignored.
            if (err.message !== 'SecurityError') {
                warnOnce(err);
            }
        }

        if (cachedResponse && responseIsFresh) {
            return finishRequest(cachedResponse);
        }

        if (cachedResponse) {
            // We can't do revalidation with 'If-None-Match' because then the
            // request doesn't have simple cors headers.
        }

        const requestTime = Date.now();

        fetch(request).then(response => {
            if (response.ok) {
                const cacheableResponse = cacheIgnoringSearch ? response.clone() : null;
                return finishRequest(response, cacheableResponse, requestTime);

            } else {
                return response.blob().then(body => callback(new AJAXError(response.status, response.statusText, requestParameters.url, body)));
            }
        }).catch(error => {
            if (error.code === 20) {
                // silence expected AbortError
                return;
            }
            callback(new Error(error.message));
        });
    };

    const finishRequest = (response, cacheableResponse?, requestTime?) => {
        (
            requestParameters.type === 'arrayBuffer' ? response.arrayBuffer() :
                requestParameters.type === 'json' ? response.json() :
                    response.text()
        ).then(result => {
            if (aborted) return;
            if (cacheableResponse && requestTime) {
                // The response needs to be inserted into the cache after it has completely loaded.
                // Until it is fully loaded there is a chance it will be aborted. Aborting while
                // reading the body can cause the cache insertion to error. We could catch this error
                // in most browsers but in Firefox it seems to sometimes crash the tab. Adding
                // it to the cache here avoids that error.
                cachePut(request, cacheableResponse, requestTime);
            }
            complete = true;
            callback(null, result, response.headers.get('Cache-Control'), response.headers.get('Expires'));
        }).catch(err => {
            if (!aborted) callback(new Error(err.message));
        });
    };

    if (cacheIgnoringSearch) {
        cacheGet(request, validateOrFetch);
    } else {
        validateOrFetch(null, null);
    }

    return {cancel: () => {
        aborted = true;
        if (!complete) controller.abort();
    }};
}

function makeXMLHttpRequest(requestParameters: RequestParameters, callback: ResponseCallback<any>): Cancelable {
    const xhr: XMLHttpRequest = new XMLHttpRequest();

    xhr.open(requestParameters.method || 'GET', requestParameters.url, true);
    if (requestParameters.type === 'arrayBuffer') {
        xhr.responseType = 'arraybuffer';
    }
    for (const k in requestParameters.headers) {
        xhr.setRequestHeader(k, requestParameters.headers[k]);
    }
    if (requestParameters.type === 'json') {
        xhr.responseType = 'text';
        xhr.setRequestHeader('Accept', 'application/json');
    }
    xhr.withCredentials = requestParameters.credentials === 'include';
    xhr.onerror = () => {
        callback(new Error(xhr.statusText));
    };
    xhr.onload = () => {
        if (((xhr.status >= 200 && xhr.status < 300) || xhr.status === 0) && xhr.response !== null) {
            let data: unknown = xhr.response;
            if (requestParameters.type === 'json') {
                // We're manually parsing JSON here to get better error messages.
                try {
                    data = JSON.parse(xhr.response);
                } catch (err) {
                    return callback(err);
                }
            }
            callback(null, data, xhr.getResponseHeader('Cache-Control'), xhr.getResponseHeader('Expires'));
        } else {
            const body = new Blob([xhr.response], {type: xhr.getResponseHeader('Content-Type')});
            callback(new AJAXError(xhr.status, xhr.statusText, requestParameters.url, body));
        }
    };
    xhr.send(requestParameters.body);
    return {cancel: () => xhr.abort()};
}

export const makeRequest = function(requestParameters: RequestParameters, callback: ResponseCallback<any>): Cancelable {
    // We're trying to use the Fetch API if possible. However, in some situations we can't use it:
    // - IE11 doesn't support it at all. In this case, we dispatch the request to the main thread so
    //   that we can get an accruate referrer header.
    // - Safari exposes window.AbortController, but it doesn't work actually abort any requests in
    //   some versions (see https://bugs.webkit.org/show_bug.cgi?id=174980#c2)
    // - Requests for resources with the file:// URI scheme don't work with the Fetch API either. In
    //   this case we unconditionally use XHR on the current thread since referrers don't matter.
    if (/:\/\//.test(requestParameters.url) && !(/^https?:|^file:/.test(requestParameters.url))) {
        if (isWorker() && (self as any).worker && (self as any).worker.actor) {
            return (self as any).worker.actor.send('getResource', requestParameters, callback);
        }
        if (!isWorker()) {
            const protocol = requestParameters.url.substring(0, requestParameters.url.indexOf('://'));
            const action = config.REGISTERED_PROTOCOLS[protocol] || makeFetchRequest;
            return action(requestParameters, callback);
        }
    }
    if (!isFileURL(requestParameters.url)) {
        if (fetch && Request && AbortController && Object.prototype.hasOwnProperty.call(Request.prototype, 'signal')) {
            return makeFetchRequest(requestParameters, callback);
        }
        if (isWorker() && (self as any).worker && (self as any).worker.actor) {
            const queueOnMainThread = true;
            return (self as any).worker.actor.send('getResource', requestParameters, callback, undefined, queueOnMainThread);
        }
    }
    return makeXMLHttpRequest(requestParameters, callback);
};

export const getJSON = function(requestParameters: RequestParameters, callback: ResponseCallback<any>): Cancelable {
    return makeRequest(extend(requestParameters, {type: 'json'}), callback);
};

export const getArrayBuffer = function(
    requestParameters: RequestParameters,
    callback: ResponseCallback<ArrayBuffer>
): Cancelable {
    return makeRequest(extend(requestParameters, {type: 'arrayBuffer'}), callback);
};

export const postData = function(requestParameters: RequestParameters, callback: ResponseCallback<string>): Cancelable {
    return makeRequest(extend(requestParameters, {method: 'POST'}), callback);
};

function sameOrigin(url) {
    const a: HTMLAnchorElement = window.document.createElement('a');
    a.href = url;
    return a.protocol === window.document.location.protocol && a.host === window.document.location.host;
}

const transparentPngUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQYV2NgAAIAAAUAAarVyFEAAAAASUVORK5CYII=';

function arrayBufferToImage(data: ArrayBuffer, callback: (err?: Error | null, image?: HTMLImageElement | null) => void) {
    const img: HTMLImageElement = new Image();
    img.onload = () => {
        callback(null, img);
        URL.revokeObjectURL(img.src);
        // prevent image dataURI memory leak in Safari;
        // but don't free the image immediately because it might be uploaded in the next frame
        // https://github.com/mapbox/mapbox-gl-js/issues/10226
        img.onload = null;
        window.requestAnimationFrame(() => { img.src = transparentPngUrl; });
    };
    img.onerror = () => callback(new Error('Could not load image. Please make sure to use a supported image type such as PNG or JPEG. Note that SVGs are not supported.'));
    const blob: Blob = new Blob([new Uint8Array(data)], {type: 'image/png'});
    img.src = data.byteLength ? URL.createObjectURL(blob) : transparentPngUrl;
}

function arrayBufferToImageBitmap(data: ArrayBuffer, callback: (err?: Error | null, image?: ImageBitmap | null) => void) {
    const blob: Blob = new Blob([new Uint8Array(data)], {type: 'image/png'});
    createImageBitmap(blob).then((imgBitmap) => {
        callback(null, imgBitmap);
    }).catch((e) => {
        callback(new Error(`Could not load image because of ${e.message}. Please make sure to use a supported image type such as PNG or JPEG. Note that SVGs are not supported.`));
    });
}

export type ExpiryData = {cacheControl?: string | null; expires?: Date | string | null};

function arrayBufferToCanvasImageSource(data: ArrayBuffer, callback: Callback<CanvasImageSource>) {
    const imageBitmapSupported = typeof createImageBitmap === 'function';
    if (imageBitmapSupported) {
        arrayBufferToImageBitmap(data, callback);
    } else {
        arrayBufferToImage(data, callback);
    }
}

let imageQueue;
let currentParallelImageRequests = 0;
export const resetImageRequestQueue = () => {
    imageQueue = [];
    currentParallelImageRequests = 0;
};
resetImageRequestQueue();

// By default, the image queue will process requests as quickly as it can while limiting
// the number of concurrent requests to MAX_PARALLEL_IMAGE_REQUESTS. The default behavior
// ensures that static views of the map can be rendered with minimal delay.
// However, the default behavior can prevent dynamic views of the map from rendering
// smoothly.
//
// Therefore, when the view of the map is moving dynamically, smoother frame rates can be
// achieved by throttling the number of items processed by the queue per frame. This can be
// accomplished by using installImageQueueThrottleControlCallback() to allow the caller to
// use a lambda function to determine when the queue should be throttled (e.g. when isMoving())
// and manually calling processImageRequestQueue() in the render loop.

export type ImageQueueThrottleControlCallback = () => boolean;

let imageQueueThrottleControlCallbackHandleCounter: number = 0;
const imageQueueThrottleControlCallbacks = [];

// Install a callback to control when image queue throttling is desired (e.g. when the map view is moving).
export const installImageQueueThrottleControlCallback = function (callback: ImageQueueThrottleControlCallback): number /*callbackHandle*/ {
    const handle = imageQueueThrottleControlCallbackHandleCounter++;
    imageQueueThrottleControlCallbacks[handle] = callback;
    return handle;
};

// Remove a previously installed callback by passing in the handle returned by installImageQueueThrottleControlCallback().
export const removeImageQueueThrottleControlCallback = function (callbackHandle: number) {
    const index = imageQueueThrottleControlCallbacks.indexOf(callbackHandle, 0);
    if (index >= 0) {
        imageQueueThrottleControlCallbacks.splice(index, 1);
    }
};

// Check to see if any of the installed callbacks are requesting the queue to be throttled.
const isImageQueueThrottled = function (): boolean {
    return imageQueueThrottleControlCallbacks.some(item => item());
};

export type GetImageCallback = (error?: Error | null, image?: HTMLImageElement | ImageBitmap | null, expiry?: ExpiryData | null) => void;

export const getImage = function(
    requestParameters: RequestParameters,
    callback: GetImageCallback
): Cancelable {
    if (webpSupported.supported) {
        if (!requestParameters.headers) {
            requestParameters.headers = {};
        }
        requestParameters.headers.accept = 'image/webp,*/*';
    }

    const queued = {
        requestParameters,
        callback,
        cancelled: false,
        completed: false,
        cancel() {
            this.cancelled = true;

            if (!isImageQueueThrottled()) {
                processImageRequestQueue(config.MAX_PARALLEL_IMAGE_REQUESTS);
            }
        }
    };
    imageQueue.push(queued);

    if (!isImageQueueThrottled()) {
        processImageRequestQueue(config.MAX_PARALLEL_IMAGE_REQUESTS);
    }

    return queued;
};

function doArrayRequest(requestParameters: RequestParameters, callback: GetImageCallback, request: any): Cancelable {
    // request the image with XHR to work around caching issues
    // see https://github.com/mapbox/mapbox-gl-js/issues/1470
    return getArrayBuffer(requestParameters, (err?: Error | null, data?: ArrayBuffer | null, cacheControl?: string | null, expires?: string | null) => {
        if (err) {
            callback(err);
        } else if (data) {
            const decoratedCallback = (imgErr?: Error | null, imgResult?: CanvasImageSource | null) => {
                if (imgErr != null) {
                    callback(imgErr);
                } else if (imgResult != null) {
                    callback(null, imgResult as (HTMLImageElement | ImageBitmap), {cacheControl, expires});
                }
            };
            arrayBufferToCanvasImageSource(data, decoratedCallback);
        }

        if (!request.cancelled) {
            request.completed = true;
            currentParallelImageRequests--;

            if (!isImageQueueThrottled()) {
                processImageRequestQueue(config.MAX_PARALLEL_IMAGE_REQUESTS);
            }
        }
    });
}

export const processImageRequestQueue = function (
    maxImageRequests: number) {

    if (!maxImageRequests) {
        maxImageRequests = Math.max(0, config.MAX_PARALLEL_IMAGE_REQUESTS - currentParallelImageRequests);
    }

    const cancelRequest = function () {
        if (!this.completed && !this.cancelled) {
            currentParallelImageRequests--;
            this.cancelled = true;
            this.innerRequest.cancel();

            if (!isImageQueueThrottled()) {
                processImageRequestQueue(config.MAX_PARALLEL_IMAGE_REQUESTS);
            }
        }
    };

    // limit concurrent image loads to help with raster sources performance on big screens

    for (let numImageRequests = currentParallelImageRequests; numImageRequests < maxImageRequests && imageQueue.length; numImageRequests++) {

        const request = imageQueue.shift();
        const {requestParameters, callback, cancelled} = request;

        if (cancelled) {
            continue;
        }

        const innerRequest = doArrayRequest(requestParameters, callback, request);

        currentParallelImageRequests++;

        request.innerRequest = innerRequest;
        request.cancel = function () { cancelRequest(); };
    }

    return imageQueue.length;
};

export const getVideo = function(urls: Array<string>, callback: Callback<HTMLVideoElement>): Cancelable {
    const video: HTMLVideoElement = window.document.createElement('video');
    video.muted = true;
    video.onloadstart = function() {
        callback(null, video);
    };
    for (let i = 0; i < urls.length; i++) {
        const s: HTMLSourceElement = window.document.createElement('source');
        if (!sameOrigin(urls[i])) {
            video.crossOrigin = 'Anonymous';
        }
        s.src = urls[i];
        video.appendChild(s);
    }
    return {cancel: () => {}};
};
