import {
    getJSON,
    getArrayBuffer,
    getImage,
    getVideo,
    makeRequest,
    getReferer,
    makeFetchRequest,
    makeXMLHttpRequest,
    arrayBufferToCanvasImageSource,
    helper,
    MapLibreRequestDataType,
} from './ajax';
import * as util from './util';
import fetchMock from 'jest-fetch-mock';
import {fakeServer, FakeServer} from 'nise';
import webpSupported from './webp_supported';

describe('ajax', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('getJSON', () => {
        test('calls `makeRequest`', async () => {
            // @ts-ignore
            const makeRequestSpy = jest.spyOn(helper, 'makeRequest').mockImplementationOnce(() => {});

            getJSON({url: ''});

            expect(makeRequestSpy).toHaveBeenNthCalledWith(1, {url: ''}, MapLibreRequestDataType.JSON);
        });
    });

    describe('getArrayBuffer', () => {
        test('calls `makeRequest`', async () => {
            // @ts-ignore
            const makeRequestSpy = jest.spyOn(helper, 'makeRequest').mockImplementationOnce(() => {});

            getArrayBuffer({url: ''});

            expect(makeRequestSpy).toHaveBeenNthCalledWith(1, {url: ''}, MapLibreRequestDataType.ArrayBuffer);
        });
    });

    describe('getImage', () => {
        test('calls `imageRequestsQueue`', async () => {
            const imageRequestsQueueSpy = jest.spyOn(helper, 'imageRequestsQueue');

            getImage({url: ''});

            expect(imageRequestsQueueSpy).toHaveBeenCalledTimes(1);
        });

        test('respects .webp support', async () => {
            // webpSupported.supported = true;
            // const imageRequestsQueueSpy = jest.spyOn(helper, 'getArrayBuffer');
            //
            // getImage({url: ''});
            //
            // expect(imageRequestsQueueSpy).toHaveBeenNthCalledWith(1, {url: '', headers: {'Accept': 'image/webp,*/*'}});
            //
            // webpSupported.supported = false;
        });

        test('is cancelable', async () => {
            fetchMock.mockResponseOnce('');
            const request = getImage({url: ''});
            request.cancel();
            await expect(request.response).rejects.toStrictEqual(new Error('aborted'));
        });
    });

    describe('getVideo', () => {
        test('ok', async () => {
            try {
                const request = getVideo(['https://example.com/video']);
                // @ts-ignore
                request._testForceLoadStart();

                const response = await request.response;
                expect(response.data).toBeInstanceOf(HTMLVideoElement);
                expect(response.data.children).toHaveLength(1);
                expect((response.data.children[0] as HTMLSourceElement).src).toBe('https://example.com/video');
            } catch (err) {
                // should never execute
                expect(true).toBe(false);
            }
        });

        test('error', async () => {
            const request = getVideo(['https://example.com/video']);
            // @ts-ignore
            request._testForceError();

            await expect(request.response).rejects.toBeInstanceOf(Error);
        });
    });

    describe('getReferer', () => {
        test('when worker, returns the worker\'s referer', async () => {
            jest.spyOn(util, 'isWorker').mockImplementationOnce(() => true);
            self.worker = {referer: 'foo'};

            expect(getReferer()).toBe('foo');

            self.worker = null;
        });

        test('when not a worker and the current protocol is not "blob:", returns the window\'s href', async () => {
            expect(getReferer()).toBe(window.location.href);
        });
    });

    describe('makeRequest', () => {
        let makeFetchRequestSpy;
        let makeXMLHttpRequestSpy;

        beforeEach(() => {
            // @ts-ignore
            makeFetchRequestSpy = jest.spyOn(helper, 'makeFetchRequest').mockImplementationOnce(() => {});
            // @ts-ignore
            makeXMLHttpRequestSpy = jest.spyOn(helper, 'makeXMLHttpRequest').mockImplementationOnce(() => {});
        });

        function workerTest(url: string) {
            const fetch = global.fetch;
            global.fetch = null;
            self.worker = {actor: {send: jest.fn(() => {})}};
            const actor = self.worker.actor;
            const isWorkerSpy = jest.spyOn(util, 'isWorker').mockImplementationOnce(() => true);
            const sendSpy = jest.spyOn(actor, 'send');

            makeRequest({url});

            expect(isWorkerSpy).toHaveBeenCalledTimes(1);
            expect(sendSpy).toHaveBeenNthCalledWith(1, 'getResource', {url}, undefined);

            global.fetch = fetch;
            self.worker = null;
        }

        describe('"custom://" protocol', () => {
            test('when worker, calls `getResource` on the main thread', async () => {
                workerTest('custom://example.com');
            });

            test('uses fetch when it is available', async () => {
                makeRequest({url: 'custom://example.com'});

                expect(makeFetchRequestSpy).toHaveBeenNthCalledWith(1, {url: 'custom://example.com'}, undefined);
                expect(makeXMLHttpRequestSpy).not.toHaveBeenCalled();
            });
        });

        describe('protocol-less or HTTP[S] (not "file://")', () => {
            test('uses fetch when it is available', async () => {
                makeRequest({url: 'foo'});

                expect(makeFetchRequestSpy).toHaveBeenNthCalledWith(1, {url: 'foo'}, undefined);
                expect(makeXMLHttpRequestSpy).not.toHaveBeenCalled();
            });

            test('when worker, calls `getResource` on the main thread', async () => {
                workerTest('foo');
            });
        });

        test('"file://" urls use XHR', () => {
            fakeServer.create();

            makeRequest({url: 'file://example'});

            expect(makeFetchRequestSpy).not.toHaveBeenCalled();
            expect(makeXMLHttpRequestSpy).toHaveBeenNthCalledWith(1, {url: 'file://example'}, undefined);
        });
    });

    describe('makeFetchRequest', () => {
        fetchMock.enableMocks();

        beforeEach(() => {
            fetchMock.resetMocks();
        });

        test('ok', async () => {
            fetchMock.mockResponseOnce(JSON.stringify({foo: 'bar'}));

            try {
                const request = makeFetchRequest({url: ''});

                const response = await request.response;
                expect(response.data).toEqual(JSON.stringify({foo: 'bar'}));
            } catch (err) {
                // should never execute
                expect(true).toBe(false);
            }
        });

        test('`requestDataType` "json" sets respective request headers', async () => {
            fetchMock.doMockOnceIf(
                (req) => { return req.headers.get('Accept') === 'application/json'; },
                JSON.stringify({foo: 'bar'}),
                {headers: {'Content-Type': 'application/json'}}
            );

            try {
                const request = makeFetchRequest({url: ''}, MapLibreRequestDataType.JSON);

                const response = await request.response;
                expect(response.data).toEqual({foo: 'bar'});
            } catch (err) {
                expect(true).toBe(false);
            }
        });

        test('error when response status is not ok', async () => {
            fetchMock.mockResponseOnce('', {status: 500});
            const request = makeFetchRequest({url: ''});
            await expect(request.response).rejects.toBeInstanceOf(Error);
        });

        test('is cancelable', async () => {
            fetchMock.mockResponseOnce('');
            const request = makeFetchRequest({url: ''});
            request.cancel();
            await expect(request.response).rejects.toStrictEqual(new Error('aborted'));
        });
    });

    describe('makeXMLHttpRequest', () => {
        let fakeXMLHttpRequest: FakeServer;

        beforeEach(() => {
            fakeXMLHttpRequest = fakeServer.create();
        });

        afterEach(() => {
            fakeXMLHttpRequest.restore();
        });

        test('ok', async () => {
            fakeXMLHttpRequest.respondWith(request => {
                request.respond(200, undefined, JSON.stringify({foo: 'bar'}));
            });

            try {
                const request = makeXMLHttpRequest({url: ''});
                fakeXMLHttpRequest.respond();

                const response = await request.response;
                expect(response.data).toEqual(JSON.stringify({foo: 'bar'}));
            } catch (err) {
                // should never execute
                expect(true).toBe(false);
            }
        });

        test('respects request headers', async () => {
            fakeXMLHttpRequest.respondWith(request => {
                request.respond(200, undefined, '');
            });

            try {
                makeXMLHttpRequest({url: '', headers: {foo: 'bar'}});
                fakeXMLHttpRequest.respond();

                expect(fakeXMLHttpRequest.requests[0].requestHeaders.foo).toBe('bar');
            } catch (err) {
                // should never execute
                expect(true).toBe(false);
            }
        });

        test('sets "arraybuffer" response type when the `requestDataType` is array buffer', async () => {
            fakeXMLHttpRequest.respondWith(request => {
                request.respond(200, undefined, '');
            });

            try {
                makeXMLHttpRequest({url: ''}, MapLibreRequestDataType.ArrayBuffer);
                fakeXMLHttpRequest.respond();

                // the mock doesn't know about that property, safe to ignore
                // @ts-ignore
                expect(fakeXMLHttpRequest.requests[0].responseType).toBe('arraybuffer');
            } catch (err) {
                // should never execute
                expect(true).toBe(false);
            }
        });

        test('sets "text" response type and {"Accept", "application/json"} header when the `requestDataType` is json', async () => {
            fakeXMLHttpRequest.respondWith(request => {
                request.respond(200, {'Content-Type': 'application/json'}, JSON.stringify({foo: 'bar'}));
            });

            try {
                makeXMLHttpRequest({url: ''}, MapLibreRequestDataType.JSON);
                fakeXMLHttpRequest.respond();

                // the mock doesn't know about that property, safe to ignore
                // @ts-ignore
                expect(fakeXMLHttpRequest.requests[0].responseType).toBe('text');
                expect(fakeXMLHttpRequest.requests[0].requestHeaders['Accept']).toBe('application/json');
            } catch (err) {
                // should never execute
                expect(true).toBe(false);
            }
        });

        test('throws if loaded json is invalid', async () => {
            fakeXMLHttpRequest.respondWith(request => {
                request.respond(200, {'Content-Type': 'application/json'}, 'invalid json');
            });

            const request = makeXMLHttpRequest({url: ''}, MapLibreRequestDataType.JSON);
            fakeXMLHttpRequest.respond();

            await expect(request.response).rejects.toBeInstanceOf(SyntaxError);
        });

        test('error when response status is not ok', async () => {
            fakeXMLHttpRequest.respondWith(request => {
                request.respond(500, undefined, '');
            });

            const request = makeXMLHttpRequest({url: ''});
            fakeXMLHttpRequest.respond();

            await expect(request.response).rejects.toBeInstanceOf(Error);
        });

        test('is cancelable', async () => {
            fakeXMLHttpRequest.respondWith(request => {
                request.respond(200, undefined, '');
            });

            const request = makeXMLHttpRequest({url: ''});
            request.cancel();
            fakeXMLHttpRequest.respond();

            await expect(request.response).rejects.toStrictEqual(new Error('aborted'));
        });
    });

    describe('arrayBufferToCanvasImageSource', () => {
        test('ok (via ImageBitmap)', async () => {
            const arrayBuffer = new ArrayBuffer(1);

            try {
                const promisedImage = arrayBufferToCanvasImageSource(arrayBuffer);

                const image = await promisedImage;
                expect(image).toBeInstanceOf(ImageBitmap);
            } catch (err) {
                // should never execute
                expect(true).toBe(false);
            }
        });

        test('error (bad input)', async () => {
            global.createImageBitmap = () => { throw new Error(); };

            const arrayBuffer = new ArrayBuffer(0);

            const promisedImage = arrayBufferToCanvasImageSource(arrayBuffer);

            await expect(promisedImage).rejects.toBeInstanceOf(Error);
        });

        test('ok (via HTMLImageElement)', async () => {
            global.createImageBitmap = null;
            global.URL.revokeObjectURL = () => {};

            const arrayBuffer = new ArrayBuffer(0);

            try {
                const promisedImage = arrayBufferToCanvasImageSource(arrayBuffer, true);

                const image = await promisedImage;
                expect(image).toBeInstanceOf(HTMLImageElement);
            } catch (err) {
                // should never execute
                expect(true).toBe(false);
            }
        });

        test('error (via HTMLImageElement)', async () => {
            global.createImageBitmap = null;
            global.URL.revokeObjectURL = () => {};

            const arrayBuffer = new ArrayBuffer(0);

            const promisedImage = arrayBufferToCanvasImageSource(arrayBuffer, false);

            await expect(promisedImage).rejects.toBeInstanceOf(Error);
        });
    });
});
