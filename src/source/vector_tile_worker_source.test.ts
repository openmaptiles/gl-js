import fs from 'fs';
import path from 'path';
import {VectorTile} from '@mapbox/vector-tile';
import Protobuf from 'pbf';
import {LoadVectorData, VectorTileWorkerSource} from '../source/vector_tile_worker_source';
import {StyleLayerIndex} from '../style/style_layer_index';
import {fakeServer, type FakeServer} from 'nise';
import {IActor} from '../util/actor';
import {TileParameters, WorkerTileParameters, WorkerTileResult} from './worker_source';
import {WorkerTile} from './worker_tile';
import {setPerformance, sleep} from '../util/test/util';
import {ABORT_ERROR} from '../util/abort_error';

describe('vector tile worker source', () => {
    const actor = {sendAsync: () => Promise.resolve({})} as IActor;
    let server: FakeServer;

    beforeEach(() => {
        global.fetch = null;
        server = fakeServer.create();
        setPerformance();
    });

    afterEach(() => {
        server.restore();
        jest.clearAllMocks();
    });
    test('VectorTileWorkerSource#abortTile aborts pending request', async () => {
        const source = new VectorTileWorkerSource(actor, new StyleLayerIndex(), []);

        const loadPromise = source.loadTile({
            source: 'source',
            uid: 0,
            tileID: {overscaledZ: 0, wrap: 0, canonical: {x: 0, y: 0, z: 0, w: 0}},
            request: {url: 'http://localhost:2900/abort'}
        } as any as WorkerTileParameters);

        const abortPromise = source.abortTile({
            source: 'source',
            uid: 0
        } as any as TileParameters);

        expect(source.loading).toEqual({});
        await expect(abortPromise).resolves.toBeFalsy();
        await expect(loadPromise).rejects.toThrow(ABORT_ERROR);
    });

    test('VectorTileWorkerSource#removeTile removes loaded tile', async () => {
        const source = new VectorTileWorkerSource(actor, new StyleLayerIndex(), []);

        source.loaded = {
            '0': {} as WorkerTile
        };

        const res = await source.removeTile({
            source: 'source',
            uid: 0
        } as any as TileParameters);
        expect(res).toBeUndefined();

        expect(source.loaded).toEqual({});
    });

    test('VectorTileWorkerSource#reloadTile reloads a previously-loaded tile', async () => {
        const source = new VectorTileWorkerSource(actor, new StyleLayerIndex(), []);
        const parse = jest.fn().mockReturnValue(Promise.resolve({} as WorkerTileResult));

        source.loaded = {
            '0': {
                status: 'done',
                vectorTile: {},
                parse
            } as any as WorkerTile
        };

        const reloadPromise = source.reloadTile({uid: 0} as any as WorkerTileParameters);
        expect(parse).toHaveBeenCalledTimes(1);
        await expect(reloadPromise).resolves.toBeTruthy();
    });

    test('VectorTileWorkerSource#loadTile reparses tile if the reloadTile has been called during parsing', async () => {
        const rawTileData = new Uint8Array([]);
        const loadVectorData: LoadVectorData = async (_params, _abortController) => {
            return {
                vectorTile: {
                    layers: {
                        test: {
                            version: 2,
                            name: 'test',
                            extent: 8192,
                            length: 1,
                            feature: (featureIndex: number) => ({
                                extent: 8192,
                                type: 1,
                                id: featureIndex,
                                properties: {
                                    name: 'test'
                                },
                                loadGeometry () {
                                    return [[{x: 0, y: 0}]];
                                }
                            })
                        }
                    }
                } as any as VectorTile,
                rawData: rawTileData
            };
        };

        const layerIndex = new StyleLayerIndex([{
            id: 'test',
            source: 'source',
            'source-layer': 'test',
            type: 'symbol',
            layout: {
                'icon-image': 'hello',
                'text-font': ['StandardFont-Bold'],
                'text-field': '{name}'
            }
        }]);

        const actor = {
            sendAsync: (message: {type: string; data: unknown}, abortController: AbortController) => {
                return new Promise((resolve, _reject) => {
                    const res = setTimeout(() => {
                        const response = message.type === 'getImages' ?
                            {'hello': {width: 1, height: 1, data: new Uint8Array([0])}} :
                            {'StandardFont-Bold': {width: 1, height: 1, data: new Uint8Array([0])}};
                        resolve(response);
                    }, 100);
                    abortController.signal.addEventListener('abort', () => {
                        clearTimeout(res);
                    });
                });
            }
        };
        const source = new VectorTileWorkerSource(actor, layerIndex, ['hello']);
        source.loadVectorTile = loadVectorData;
        source.loadTile({
            source: 'source',
            uid: 0,
            tileID: {overscaledZ: 0, wrap: 0, canonical: {x: 0, y: 0, z: 0, w: 0}},
            request: {url: 'http://localhost:2900/faketile.pbf'}
        } as any as WorkerTileParameters).then(() => expect(false).toBeTruthy());

        // allow promise to run
        await sleep(0);

        const res = await source.reloadTile({
            source: 'source',
            uid: 0,
            tileID: {overscaledZ: 0, wrap: 0, canonical: {x: 0, y: 0, z: 0, w: 0}},
        } as any as WorkerTileParameters);
        expect(res).toBeDefined();
        expect(res.rawTileData).toBeDefined();
        expect(res.rawTileData).toStrictEqual(rawTileData);
    });

    test('VectorTileWorkerSource#loadTile reparses tile if reloadTile is called during reparsing', async () => {
        const rawTileData = new Uint8Array([]);
        const loadVectorData: LoadVectorData = async (_params, _abortController) => {
            return {
                vectorTile: new VectorTile(new Protobuf(rawTileData)),
                rawData: rawTileData
            };
        };

        const layerIndex = new StyleLayerIndex([{
            id: 'test',
            source: 'source',
            'source-layer': 'test',
            type: 'fill'
        }]);

        const source = new VectorTileWorkerSource(actor, layerIndex, []);
        source.loadVectorTile = loadVectorData;

        const parseWorkerTileMock = jest
            .spyOn(WorkerTile.prototype, 'parse')
            .mockImplementation(function(_data, _layerIndex, _availableImages, _actor) {
                this.status = 'parsing';
                return new Promise((resolve) => {
                    setTimeout(() => resolve({} as WorkerTileResult), 20);
                });
            });

        const loadPromise = source.loadTile({
            source: 'source',
            uid: 0,
            tileID: {overscaledZ: 0, wrap: 0, canonical: {x: 0, y: 0, z: 0, w: 0}},
            request: {url: 'http://localhost:2900/faketile.pbf'}
        } as any as WorkerTileParameters);

        // let the promise start
        await sleep(0);

        const res = await source.reloadTile({
            source: 'source',
            uid: '0',
            tileID: {overscaledZ: 0, wrap: 0, canonical: {x: 0, y: 0, z: 0, w: 0}},
        } as any as WorkerTileParameters);
        expect(res).toBeDefined();
        expect(parseWorkerTileMock).toHaveBeenCalledTimes(2);
        await expect(loadPromise).resolves.toBeTruthy();
    });

    test('VectorTileWorkerSource#reloadTile does not reparse tiles with no vectorTile data but does call callback', async () => {
        const source = new VectorTileWorkerSource(actor, new StyleLayerIndex(), []);
        const parse = jest.fn();

        source.loaded = {
            '0': {
                status: 'done',
                parse
            } as any as WorkerTile
        };

        await source.reloadTile({uid: 0} as any as WorkerTileParameters);
        expect(parse).not.toHaveBeenCalled();
    });

    test('VectorTileWorkerSource#loadTile returns null for an empty tile', async () => {
        const source = new VectorTileWorkerSource(actor, new StyleLayerIndex(), []);
        source.loadVectorTile = (_params, _abortController) => Promise.resolve(null);
        const parse = jest.fn();

        server.respondWith(request => {
            request.respond(200, {'Content-Type': 'application/pbf'}, 'something...');
        });

        const promise = source.loadTile({
            source: 'source',
            uid: 0,
            tileID: {overscaledZ: 0, wrap: 0, canonical: {x: 0, y: 0, z: 0, w: 0}},
            request: {url: 'http://localhost:2900/faketile.pbf'}
        } as any as WorkerTileParameters);

        server.respond();

        expect(parse).not.toHaveBeenCalled();
        expect(await promise).toBeNull();
    });

    test('VectorTileWorkerSource#returns a good error message when failing to parse a tile', done => {
        const source = new VectorTileWorkerSource(actor, new StyleLayerIndex(), []);
        const parse = jest.fn();

        server.respondWith(request => {
            request.respond(200, {'Content-Type': 'application/pbf'}, 'something...');
        });

        source.loadTile({
            source: 'source',
            uid: 0,
            tileID: {overscaledZ: 0, wrap: 0, canonical: {x: 0, y: 0, z: 0, w: 0}},
            request: {url: 'http://localhost:2900/faketile.pbf'}
        } as any as WorkerTileParameters).catch((err) => {
            expect(err.message).toContain('Unable to parse the tile at');
            done();
        });

        server.respond();

        expect(parse).not.toHaveBeenCalled();
    });

    test('VectorTileWorkerSource#returns a good error message when failing to parse a gzipped tile', done => {
        const source = new VectorTileWorkerSource(actor, new StyleLayerIndex(), []);
        const parse = jest.fn();

        server.respondWith(new Uint8Array([0x1f, 0x8b]).buffer);

        source.loadTile({
            source: 'source',
            uid: 0,
            tileID: {overscaledZ: 0, wrap: 0, canonical: {x: 0, y: 0, z: 0, w: 0}},
            request: {url: 'http://localhost:2900/faketile.pbf'}
        } as any as WorkerTileParameters).catch((err) => {
            expect(err.message).toContain('gzipped');
            done();
        });

        server.respond();

        expect(parse).not.toHaveBeenCalled();
    });

    test('VectorTileWorkerSource provides resource timing information', async () => {
        const rawTileData = fs.readFileSync(path.join(__dirname, '/../../test/unit/assets/mbsv5-6-18-23.vector.pbf'));

        const loadVectorData: LoadVectorData = async (_params, _abortController) => {
            return {
                vectorTile: new VectorTile(new Protobuf(rawTileData)),
                rawData: rawTileData,
                cacheControl: null,
                expires: null
            };
        };

        const exampleResourceTiming = {
            connectEnd: 473,
            connectStart: 473,
            decodedBodySize: 86494,
            domainLookupEnd: 473,
            domainLookupStart: 473,
            duration: 341,
            encodedBodySize: 52528,
            entryType: 'resource',
            fetchStart: 473.5,
            initiatorType: 'xmlhttprequest',
            name: 'http://localhost:2900/faketile.pbf',
            nextHopProtocol: 'http/1.1',
            redirectEnd: 0,
            redirectStart: 0,
            requestStart: 477,
            responseEnd: 815,
            responseStart: 672,
            secureConnectionStart: 0
        };

        const layerIndex = new StyleLayerIndex([{
            id: 'test',
            source: 'source',
            'source-layer': 'test',
            type: 'fill'
        }]);

        const source = new VectorTileWorkerSource(actor, layerIndex, []);
        source.loadVectorTile = loadVectorData;

        window.performance.getEntriesByName = jest.fn().mockReturnValue([exampleResourceTiming]);

        const res = await source.loadTile({
            source: 'source',
            uid: 0,
            tileID: {overscaledZ: 0, wrap: 0, canonical: {x: 0, y: 0, z: 0, w: 0}},
            request: {url: 'http://localhost:2900/faketile.pbf', collectResourceTiming: true}
        } as any as WorkerTileParameters);

        expect(res.resourceTiming[0]).toEqual(exampleResourceTiming);

    });

    test('VectorTileWorkerSource provides resource timing information (fallback method)', async () => {
        const rawTileData = fs.readFileSync(path.join(__dirname, '/../../test/unit/assets/mbsv5-6-18-23.vector.pbf'));

        const loadVectorData: LoadVectorData = async (_params, _abortController) => {
            return {
                vectorTile: new VectorTile(new Protobuf(rawTileData)),
                rawData: rawTileData,
                cacheControl: null,
                expires: null
            };
        };

        const layerIndex = new StyleLayerIndex([{
            id: 'test',
            source: 'source',
            'source-layer': 'test',
            type: 'fill'
        }]);

        const source = new VectorTileWorkerSource(actor, layerIndex, []);
        source.loadVectorTile = loadVectorData;

        const sampleMarks = [100, 350];
        const marks = {};
        const measures = {};
        window.performance.getEntriesByName = jest.fn().mockImplementation(name => (measures[name] || []));
        window.performance.mark = jest.fn().mockImplementation(name => {
            marks[name] = sampleMarks.shift();
            return null;
        });
        window.performance.measure = jest.fn().mockImplementation((name, start, end) => {
            measures[name] = measures[name] || [];
            measures[name].push({
                duration: marks[end] - marks[start],
                entryType: 'measure',
                name,
                startTime: marks[start]
            });
            return null;
        });

        const res = await source.loadTile({
            source: 'source',
            uid: 0,
            tileID: {overscaledZ: 0, wrap: 0, canonical: {x: 0, y: 0, z: 0, w: 0}},
            request: {url: 'http://localhost:2900/faketile.pbf', collectResourceTiming: true}
        } as any as WorkerTileParameters);

        expect(res.resourceTiming[0]).toEqual(
            {'duration': 250, 'entryType': 'measure', 'name': 'http://localhost:2900/faketile.pbf', 'startTime': 100}
        );
    });
});
