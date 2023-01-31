import {extend, isWorker, arrayBufferToImageBitmap, arrayBufferToImage} from './util';
import config from './config';
import webpSupported from './webp_supported';

import type {Callback} from '../types/callback';
import type {Cancelable} from '../types/cancelable';

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

export const getJSON = function(requestParameters: RequestParameters, callback: ResponseCallback<any>): Cancelable {
    const request = makeRequest<any>(requestParameters, RequestDataType.JSON);

    request.response
        .then(response => callback(null, response.data))
        .catch(err => {
            if (err.name !== 'AbortError') callback(err);
        });

    return request;
};

export const getArrayBuffer = function(
    requestParameters: RequestParameters,
    callback: ResponseCallback<ArrayBuffer>
): Cancelable {
    const request = makeRequest<ArrayBuffer>(requestParameters, RequestDataType.ArrayBuffer);

    request.response
        .then(response => callback(null, response.data))
        .catch(err => {
            if (err.name !== 'AbortError') callback(err);
        });

    return request;
};

function sameOrigin(url) {
    const a: HTMLAnchorElement = window.document.createElement('a');
    a.href = url;
    return a.protocol === window.document.location.protocol && a.host === window.document.location.host;
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

let imageQueue, numImageRequests;
export const resetImageRequestQueue = () => {
    imageQueue = [];
    numImageRequests = 0;
};
resetImageRequestQueue();

export type GetImageCallback = (error?: Error | null, image?: HTMLImageElement | ImageBitmap | null, expiry?: ExpiryData | null) => void;

export const getImage = function(
    requestParameters: RequestParameters,
    callback: GetImageCallback
): Cancelable {
    if (webpSupported.supported) {
        if (!requestParameters.headers) {
            requestParameters.headers = {};
        }
        requestParameters.headers['Accept'] = 'image/webp,*/*';
    }

    // limit concurrent image loads to help with raster sources performance on big screens
    if (numImageRequests >= config.MAX_PARALLEL_IMAGE_REQUESTS) {
        const queued = {
            requestParameters,
            callback,
            cancelled: false,
            cancel() { this.cancelled = true; }
        };
        imageQueue.push(queued);
        return queued;
    }
    numImageRequests++;

    let advanced = false;
    const advanceImageRequestQueue = () => {
        if (advanced) return;
        advanced = true;
        numImageRequests--;

        while (imageQueue.length && numImageRequests < config.MAX_PARALLEL_IMAGE_REQUESTS) {
            const request = imageQueue.shift();
            const {requestParameters, callback, cancelled} = request;
            if (!cancelled) {
                request.cancel = getImage(requestParameters, callback).cancel;
            }
        }
    };

    // request the image with XHR to work around caching issues
    // see https://github.com/mapbox/mapbox-gl-js/issues/1470
    const request = getArrayBuffer(requestParameters, (err?: Error | null, data?: ArrayBuffer | null, cacheControl?: string | null, expires?: string | null) => {

        advanceImageRequestQueue();

        if (err) {
            if (err.name !== 'AbortError') callback(err);
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
    });

    return {
        cancel: () => {
            request.cancel();
            advanceImageRequestQueue();
        }
    };
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

// new impl.

/**
 * A type that represents parameters of an asynchronous HTTP request. The same as built-in `RequestInit`, but with
 * required `url: string` and optional `collectResourceTiming?: boolean` additional properties.
 *
 * @typedef {RequestParameters}
 */
export type RequestParameters = RequestInit & { url: string; collectResourceTiming?: boolean };

/**
 * A type that tells the `makeRequest` which modifications to apply to the request before making it and how to treat
 * response of the request after it's loaded based on the type of the raw data being loaded.
 *
 * @enum {RequestDataType}
 */
export const enum RequestDataType {
    'string',
    'JSON',
    'ArrayBuffer'
}

/**
 * A generic type that represents a MapLibre asynchronous cancelable HTTP request.
 *
 * Represented by an object containing 2 fields:
 *  - `response`: a `Promise` that (possibly) resolves with the request's result
 *  - `cancel`: a function to cancel the request
 *
 * @typedef {Request}
 */
export type Request<T> = {response: Promise<T>} & Cancelable;

/**
 * A generic type that represents a MapLibre asynchronous cancelable HTTP request's response.
 *
 * Represented by an object containing 3 fields:
 *  - `data`: the response data
 *  - `cacheControl`: the value of the response's "Cache-Control" header
 *  - `expires`: the value of the response's "Expires" header
 *
 * @typedef {Response}
 */
export type Response<T> = {data: T} & ExpiryData;

/**
 * A generic function that makes an asynchronous HTTP request using the most appropriate for the given circumstances
 * API: either Fetch or XMLHttpRequest.
 *
 * The second argument - `requestDataType` - when present, applies certain modifications to the request headers and
 * response data parsing.
 *
 * Returns an object containing 2 fields:
 *  - `response`: a `Promise` that rejects with an `Error` in case the request has failed to load the data and resolves
 *  with the value of type `Response<T>`
 *  - `cancel`: a method to cancel the request
 *
 * @function
 * @param {RequestParameters} requestParameters Request parameters
 * @param {RequestDataType} requestDataType Request data type
 * @returns {Request<Response>} Promised response and the `cancel` method
 */
export function makeRequest<T>(requestParameters: RequestParameters, requestDataType?: RequestDataType): Request<Response<T>> {
    /*
        See https://github.com/maplibre/maplibre-gl-js/discussions/2004

        TL;DR: for the time being, it's still impossible to completely give up on using the XMLHttpRequest API. But
        that's a point to reconsider in the (hopefully near) future
     */

    // if the url uses some custom protocol. E.g. "custom://..."
    if (/:\/\//.test(requestParameters.url) && !(/^https?:|^file:/.test(requestParameters.url))) {
        // and if the request is made from inside a worker
        if (isWorker() && (self as any).worker && (self as any).worker.actor) {
            // then ask the main thread to make the request from there
            return (self as any).worker.actor.send('getResource', requestParameters, requestDataType);
        }

        // if it's not a worker
        if (!isWorker()) {
            // then check the protocol, and if there exists a custom handler for the protocol, then execute the custom
            // handler. Otherwise, make the request using the Fetch API
            const protocol = requestParameters.url.substring(0, requestParameters.url.indexOf('://'));
            const action = config.REGISTERED_PROTOCOLS[protocol] || helper.makeFetchRequest;

            return action(requestParameters, requestDataType);
        }
    }

    // if there's no protocol at all or the protocol is not `file://` (in comparison with the `if` block above, it can
    // now be `http[s]://`). E.g. "https://..." or "foo"
    if (!requestParameters.url.startsWith('file://')) {
        // and if Fetch API is supported by the target environment
        if (fetch && Request && AbortController && Object.prototype.hasOwnProperty.call(Request.prototype, 'signal')) {
            // then make a `fetch` request
            return helper.makeFetchRequest(requestParameters, requestDataType);
        }

        // if the function is called from a worker
        if (isWorker() && (self as any).worker && (self as any).worker.actor) {
            // ask the main thread to make the request
            return (self as any).worker.actor.send('getResource', requestParameters, requestDataType);
        }
    }

    // fallback to the XMLHttpRequest API. E.g. "file://..."
    return helper.makeXMLHttpRequest(requestParameters, requestDataType);
}

/**
 * Returns the current `referrer`. It differs based on whether the function is invoked from the global code or from a
 * worker.
 *
 * @returns {string} Result
 */
export function getReferrer(): string {
    if (isWorker()) {
        return (self as any).worker && (self as any).worker.referrer;
    } else {
        if (window.location.protocol === 'blob:') {
            return window.parent.location.href;
        } else {
            return window.location.href;
        }
    }
}

// private functions go below this line. Private functions are dependencies of the public function above and are
// exported only to be able to be imported in the unit tests

/**
 * @private
 *
 * A generic function that makes an asynchronous HTTP request using the Fetch API.
 *
 * Returns an object containing 2 fields:
 *  - `response`: a `Promise` that rejects with an `Error` in case the request has failed to load the data and resolves
 *  with the value of type `Response<T>`
 *  - `cancel`: a method to cancel the request
 *
 * @function
 * @param {RequestParameters} requestParameters Request parameters
 * @param {RequestDataType} requestDataType Request data type
 * @returns {Request<Response>} Promised response and the `cancel` method
 */
export function makeFetchRequest<T>(requestParameters: RequestParameters, requestDataType?: RequestDataType): Request<Response<T>> {
    const abortController = new AbortController();

    const request = new Request(requestParameters.url, extend({}, requestParameters, {
        referrer: getReferrer(),
        signal: abortController.signal
    }));

    if (requestDataType === RequestDataType.JSON) {
        request.headers.set('Accept', 'application/json');
    }

    return {
        response: (async (): Promise<Response<T>> => {
            const response = await fetch(request);

            if (abortController.signal.aborted) throw new DOMException('aborted', 'AbortError');

            if (response.ok) {
                const data: T = await (requestDataType === RequestDataType.ArrayBuffer ? response.arrayBuffer() : requestDataType === RequestDataType.JSON ? response.json() : response.text());

                return {
                    data,
                    cacheControl: response.headers.get('Cache-Control') ?? undefined,
                    expires: response.headers.get('Expires') ?? undefined
                };

            } else {
                throw new Error('Failed to fetch URL'/*response.status, response.statusText, requestParameters.url, await response.blob()*/);
            }
        })(),

        cancel: () => abortController.abort()
    };
}

/**
 * @private
 *
 * A generic function that makes an asynchronous HTTP request using the XMLHttpRequest API.
 *
 * Returns an object containing 2 fields:
 *  - `response`: a `Promise` that rejects with an `Error` in case the request has failed to load the data and resolves
 *  with the value of type `Response<T>`
 *  - `cancel`: a method to cancel the request
 *
 * @function
 * @param {RequestParameters} requestParameters Request parameters
 * @param {RequestDataType} requestDataType Request data type
 * @returns {Request<Response>} Promised response and the `cancel` method
 */
export function makeXMLHttpRequest<T>(requestParameters: RequestParameters, requestDataType?: RequestDataType): Request<Response<T>> {
    const xhr: XMLHttpRequest = new XMLHttpRequest();
    xhr.open(requestParameters.method || 'GET', requestParameters.url, true);

    if (requestDataType === RequestDataType.ArrayBuffer) {
        xhr.responseType = 'arraybuffer';
    }

    for (const k in requestParameters.headers) {
        xhr.setRequestHeader(k, requestParameters.headers[k]);
    }

    if (requestDataType === RequestDataType.JSON) {
        xhr.responseType = 'text';
        xhr.setRequestHeader('Accept', 'application/json');
    }

    xhr.withCredentials = requestParameters.credentials === 'include';

    xhr.send(requestParameters.body?.toString());

    return {
        response: new Promise<Response<T>>((res, rej) => {
            xhr.onload = () => {
                if (((xhr.status >= 200 && xhr.status < 300) || xhr.status === 0) && xhr.response !== null) {
                    let data: T = xhr.response;

                    if (requestDataType === RequestDataType.JSON) {
                        try {
                            data = JSON.parse(xhr.response);
                        } catch (err) {
                            return rej(err);
                        }
                    }

                    res({
                        data,
                        cacheControl: xhr.getResponseHeader('Cache-Control'),
                        expires: xhr.getResponseHeader('Expires')
                    });
                } else {
                    rej(new Error('Failed to Fetch URL'));
                }
            };

            xhr.onerror = () => rej(new Error('Failed to Fetch URL'));

            xhr.onabort = () => rej(new DOMException('aborted', 'AbortError'));
        }),

        cancel: () => xhr.abort()
    };
}

export const helper = {
    makeFetchRequest,
    makeXMLHttpRequest
};
