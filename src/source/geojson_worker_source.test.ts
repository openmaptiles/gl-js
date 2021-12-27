import '../../stub_loader';
import GeoJSONWorkerSource from '../source/geojson_worker_source';
import StyleLayerIndex from '../style/style_layer_index';
import {OverscaledTileID} from '../source/tile_id';
import perf from '../util/performance';

const actor = {send: () => {}};

describe('reloadTile', done => {
    test('does not rebuild vector data unless data has changed', done => {
        const layers = [
            {
                id: 'mylayer',
                source: 'sourceId',
                type: 'symbol',
            }
        ];
        const layerIndex = new StyleLayerIndex(layers);
        const source = new GeoJSONWorkerSource(actor, layerIndex, []);
        const originalLoadVectorData = source.loadVectorData;
        let loadVectorCallCount = 0;
        source.loadVectorData = function(params, callback) {
            loadVectorCallCount++;
            return originalLoadVectorData.call(this, params, callback);
        };
        const geoJson = {
            'type': 'Feature',
            'geometry': {
                'type': 'Point',
                'coordinates': [0, 0]
            }
        };
        const tileParams = {
            source: 'sourceId',
            uid: 0,
            tileID: new OverscaledTileID(0, 0, 0, 0, 0),
            maxZoom: 10
        };

        function addData(callback) {
            source.loadData({source: 'sourceId', data: JSON.stringify(geoJson)}, (err) => {
                source.coalesce({source: 'sourceId'});
                expect(err).toBeNull();
                callback();
            });
        }

        function reloadTile(callback) {
            source.reloadTile(tileParams, (err, data) => {
                expect(err).toBeNull();
                return callback(data);
            });
        }

        addData(() => {
            // first call should load vector data from geojson
            let firstData;
            reloadTile(data => {
                firstData = data;
            });
            expect(loadVectorCallCount).toBe(1);

            // second call won't give us new rawTileData
            reloadTile(data => {
                expect('rawTileData' in data).toBeFalsy();
                data.rawTileData = firstData.rawTileData;
                expect(data).toEqual(firstData);
            });

            // also shouldn't call loadVectorData again
            expect(loadVectorCallCount).toBe(1);

            // replace geojson data
            addData(() => {
                // should call loadVectorData again after changing geojson data
                reloadTile(data => {
                    expect('rawTileData' in data).toBeTruthy();
                    expect(data).toEqual(firstData);
                });
                expect(loadVectorCallCount).toBe(2);
                done();
            });
        });
    });

    done();
});

describe('resourceTiming', done => {

    const layers = [
        {
            id: 'mylayer',
            source: 'sourceId',
            type: 'symbol',
        }
    ];
    const geoJson = {
        'type': 'Feature',
        'geometry': {
            'type': 'Point',
            'coordinates': [0, 0]
        }
    };

    test('loadData - url', done => {
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
            name: 'http://localhost:2900/fake.geojson',
            nextHopProtocol: 'http/1.1',
            redirectEnd: 0,
            redirectStart: 0,
            requestStart: 477,
            responseEnd: 815,
            responseStart: 672,
            secureConnectionStart: 0
        };

        t.stub(perf, 'getEntriesByName').callsFake(() => { return [ exampleResourceTiming ]; });

        const layerIndex = new StyleLayerIndex(layers);
        const source = new GeoJSONWorkerSource(actor, layerIndex, [], (params, callback) => { return callback(null, geoJson); });

        source.loadData({source: 'testSource', request: {url: 'http://localhost/nonexistent', collectResourceTiming: true}}, (err, result) => {
            expect(err).toBeNull();
            expect(result.resourceTiming.testSource).toEqual([ exampleResourceTiming ]);
            done();
        });
    });

    test('loadData - url (resourceTiming fallback method)', done => {
        const sampleMarks = [100, 350];
        const marks = {};
        const measures = {};
        t.stub(perf, 'getEntriesByName').callsFake((name) => { return measures[name] || []; });
        t.stub(perf, 'mark').callsFake((name) => {
            marks[name] = sampleMarks.shift();
            return null;
        });
        t.stub(perf, 'measure').callsFake((name, start, end) => {
            measures[name] = measures[name] || [];
            measures[name].push({
                duration: marks[end] - marks[start],
                entryType: 'measure',
                name,
                startTime: marks[start]
            });
            return null;
        });
        t.stub(perf, 'clearMarks').callsFake(() => { return null; });
        t.stub(perf, 'clearMeasures').callsFake(() => { return null; });

        const layerIndex = new StyleLayerIndex(layers);
        const source = new GeoJSONWorkerSource(actor, layerIndex, [], (params, callback) => { return callback(null, geoJson); });

        source.loadData({source: 'testSource', request: {url: 'http://localhost/nonexistent', collectResourceTiming: true}}, (err, result) => {
            expect(err).toBeNull();
            expect(result.resourceTiming.testSource).toEqual(
                [{'duration': 250, 'entryType': 'measure', 'name': 'http://localhost/nonexistent', 'startTime': 100}]
            );
            done();
        });
    });

    test('loadData - data', done => {
        const layerIndex = new StyleLayerIndex(layers);
        const source = new GeoJSONWorkerSource(actor, layerIndex, []);

        source.loadData({source: 'testSource', data: JSON.stringify(geoJson)}, (err, result) => {
            expect(err).toBeNull();
            expect(result.resourceTiming).toBeUndefined();
            done();
        });
    });

    done();
});

describe('loadData', done => {
    const layers = [
        {
            id: 'layer1',
            source: 'source1',
            type: 'symbol',
        },
        {
            id: 'layer2',
            source: 'source2',
            type: 'symbol',
        }
    ];

    const geoJson = {
        'type': 'Feature',
        'geometry': {
            'type': 'Point',
            'coordinates': [0, 0]
        }
    };

    const layerIndex = new StyleLayerIndex(layers);
    function createWorker() {
        const worker = new GeoJSONWorkerSource(actor, layerIndex, []);

        // Making the call to loadGeoJSON asynchronous
        // allows these tests to mimic a message queue building up
        // (regardless of timing)
        const originalLoadGeoJSON = worker.loadGeoJSON;
        worker.loadGeoJSON = function(params, callback) {
            setTimeout(() => {
                originalLoadGeoJSON(params, callback);
            }, 0);
        };
        return worker;
    }

    test('abandons coalesced callbacks', done => {
        // Expect first call to run, second to be abandoned,
        // and third to run in response to coalesce
        const worker = createWorker();
        worker.loadData({source: 'source1', data: JSON.stringify(geoJson)}, (err, result) => {
            expect(err).toBeNull();
            expect(result && result.abandoned).toBeFalsy();
            worker.coalesce({source: 'source1'});
        });

        worker.loadData({source: 'source1', data: JSON.stringify(geoJson)}, (err, result) => {
            expect(err).toBeNull();
            expect(result && result.abandoned).toBeTruthy();
        });

        worker.loadData({source: 'source1', data: JSON.stringify(geoJson)}, (err, result) => {
            expect(err).toBeNull();
            expect(result && result.abandoned).toBeFalsy();
            done();
        });
    });

    test('removeSource aborts callbacks', done => {
        // Expect:
        // First loadData starts running before removeSource arrives
        // Second loadData is pending when removeSource arrives, gets cancelled
        // removeSource is executed immediately
        // First loadData finishes running, sends results back to foreground
        const worker = createWorker();
        worker.loadData({source: 'source1', data: JSON.stringify(geoJson)}, (err, result) => {
            expect(err).toBeNull();
            expect(result && result.abandoned).toBeFalsy();
            done();
        });

        worker.loadData({source: 'source1', data: JSON.stringify(geoJson)}, (err, result) => {
            expect(err).toBeNull();
            expect(result && result.abandoned).toBeTruthy();
        });

        worker.removeSource({source: 'source1'}, (err) => {
            expect(err).toBeFalsy();
        });

    });

    done();
});
