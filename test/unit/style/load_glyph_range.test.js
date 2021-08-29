import '../../stub_loader';
import {test} from '../../util/test';
import fs from 'fs';
import path, {dirname} from 'path';
import {RequestManager} from '../../../rollup/build/tsc/util/mapbox';
import loadGlyphRange from '../../../rollup/build/tsc/style/load_glyph_range';
import {fileURLToPath} from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

test('loadGlyphRange', (t) => {
    window.useFakeXMLHttpRequest();

    t.tearDown(() => {
        window.clearFakeXMLHttpRequest();
    });

    const transform = t.stub().callsFake((url) => ({url}));
    const manager = new RequestManager(transform);

    let request;
    XMLHttpRequest.onCreate = (req) => { request = req; };

    loadGlyphRange('Arial Unicode MS', 0, 'https://localhost/fonts/v1/{fontstack}/{range}.pbf', manager, (err, result) => {
        t.ifError(err);
        t.ok(transform.calledOnce);
        t.deepEqual(transform.getCall(0).args, ['https://localhost/fonts/v1/Arial Unicode MS/0-255.pbf', 'Glyphs']);

        if (!result) return t.fail(); // appease flow

        t.equal(Object.keys(result).length, 223);
        for (const key in result) {
            const id = Number(key);
            const glyph = result[id];
            if (!glyph) return t.fail(); // appease flow
            t.equal(glyph.id, Number(id));
            t.ok(glyph.metrics);
            t.equal(typeof glyph.metrics.width, 'number');
            t.equal(typeof glyph.metrics.height, 'number');
            t.equal(typeof glyph.metrics.top, 'number');
            t.equal(typeof glyph.metrics.advance, 'number');
        }
        t.end();
    });

    if (!request) return t.fail(); // appease flow

    t.equal(request.url, 'https://localhost/fonts/v1/Arial Unicode MS/0-255.pbf');
    request.setStatus(200);
    request.response = fs.readFileSync(path.join(__dirname, '../../fixtures/0-255.pbf'));
    request.onload();

});
