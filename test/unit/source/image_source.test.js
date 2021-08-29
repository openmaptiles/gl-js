import '../../stub_loader';
import {test} from '../../util/test';
import ImageSource from '../../../rollup/build/tsc/source/image_source';
import {Evented} from '../../../rollup/build/tsc/util/evented';
import Transform from '../../../rollup/build/tsc/geo/transform';
import {extend} from '../../../rollup/build/tsc/util/util';
import browser from '../../../rollup/build/tsc/util/browser';

function createSource(options) {
    options = extend({
        coordinates: [[0, 0], [1, 0], [1, 1], [0, 1]]
    }, options);

    const source = new ImageSource('id', options, {send() {}}, options.eventedParent);
    return source;
}

class StubMap extends Evented {
    constructor() {
        super();
        this.transform = new Transform();
        this._requestManager = {
            transformRequest: (url) => {
                return {url};
            }
        };
    }
}

test('ImageSource', (t) => {
    window.useFakeXMLHttpRequest();
    // https://github.com/jsdom/jsdom/commit/58a7028d0d5b6aacc5b435daee9fd8f9eacbb14c
    // fake the image request (sinon doesn't allow non-string data for
    // server.respondWith, so we do so manually)
    const requests = [];
    XMLHttpRequest.onCreate = req => { requests.push(req); };
    const respond = () => {
        const req = requests.shift();
        req.setStatus(200);
        req.response = new ArrayBuffer(1);
        req.onload();
    };
    t.stub(browser, 'getImageData').callsFake(() => new ArrayBuffer(1));

    t.test('constructor', (t) => {
        const source = createSource({url : '/image.png'});

        t.equal(source.minzoom, 0);
        t.equal(source.maxzoom, 22);
        t.equal(source.tileSize, 512);
        t.end();
    });

    t.test('fires dataloading event', (t) => {
        const source = createSource({url : '/image.png'});
        source.on('dataloading', (e) => {
            t.equal(e.dataType, 'source');
        });
        source.onAdd(new StubMap());
        respond();
        t.ok(source.image);
        t.end();
    });

    t.test('transforms url request', (t) => {
        const source = createSource({url : '/image.png'});
        const map = new StubMap();
        const spy = t.spy(map._requestManager, 'transformRequest');
        source.onAdd(map);
        respond();
        t.ok(spy.calledOnce);
        t.equal(spy.getCall(0).args[0], '/image.png');
        t.equal(spy.getCall(0).args[1], 'Image');
        t.end();
    });

    t.test('updates url from updateImage', (t) => {
        const source = createSource({url : '/image.png'});
        const map = new StubMap();
        const spy = t.spy(map._requestManager, 'transformRequest');
        source.onAdd(map);
        respond();
        t.ok(spy.calledOnce);
        t.equal(spy.getCall(0).args[0], '/image.png');
        t.equal(spy.getCall(0).args[1], 'Image');
        source.updateImage({url: '/image2.png'});
        respond();
        t.ok(spy.calledTwice);
        t.equal(spy.getCall(1).args[0], '/image2.png');
        t.equal(spy.getCall(1).args[1], 'Image');
        t.end();
    });

    t.test('sets coordinates', (t) => {
        const source = createSource({url : '/image.png'});
        const map = new StubMap();
        source.onAdd(map);
        respond();
        const beforeSerialized = source.serialize();
        t.deepEqual(beforeSerialized.coordinates, [[0, 0], [1, 0], [1, 1], [0, 1]]);
        source.setCoordinates([[0, 0], [-1, 0], [-1, -1], [0, -1]]);
        const afterSerialized = source.serialize();
        t.deepEqual(afterSerialized.coordinates, [[0, 0], [-1, 0], [-1, -1], [0, -1]]);
        t.end();
    });

    t.test('sets coordinates via updateImage', (t) => {
        const source = createSource({url : '/image.png'});
        const map = new StubMap();
        source.onAdd(map);
        respond();
        const beforeSerialized = source.serialize();
        t.deepEqual(beforeSerialized.coordinates, [[0, 0], [1, 0], [1, 1], [0, 1]]);
        source.updateImage({
            url: '/image2.png',
            coordinates: [[0, 0], [-1, 0], [-1, -1], [0, -1]]
        });
        respond();
        const afterSerialized = source.serialize();
        t.deepEqual(afterSerialized.coordinates, [[0, 0], [-1, 0], [-1, -1], [0, -1]]);
        t.end();
    });

    t.test('fires data event when content is loaded', (t) => {
        const source = createSource({url : '/image.png'});
        source.on('data', (e) => {
            if (e.dataType === 'source' && e.sourceDataType === 'content') {
                t.ok(typeof source.tileID == 'object');
                t.end();
            }
        });
        source.onAdd(new StubMap());
        respond();
    });

    t.test('fires data event when metadata is loaded', (t) => {
        const source = createSource({url : '/image.png'});
        source.on('data', (e) => {
            if (e.dataType === 'source' && e.sourceDataType === 'metadata') {
                t.end();
            }
        });
        source.onAdd(new StubMap());
        respond();
    });

    t.test('serialize url and coordinates', (t) => {
        const source = createSource({url: '/image.png'});

        const serialized = source.serialize();
        t.equal(serialized.type, 'image');
        t.equal(serialized.url, '/image.png');
        t.deepEqual(serialized.coordinates, [[0, 0], [1, 0], [1, 1], [0, 1]]);

        t.end();
    });

    t.end();
});
