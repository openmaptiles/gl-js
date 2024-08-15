import fs from 'fs';
import path from 'path';
import {RequestManager} from '../util/request_manager';
import {loadGlyphRange} from './load_glyph_range';
import {fakeServer} from 'nise';
import {bufferToArrayBuffer} from '../util/test/util';

describe('loadGlyphRange', () => {
    global.fetch = null;

    const transform = jest.fn().mockImplementation((url) => {
        return {url};
    });

    const manager = new RequestManager(transform);

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('requests and receives a glyph range', async () => {
        const server = fakeServer.create();
        server.respondWith(bufferToArrayBuffer(fs.readFileSync(path.join(__dirname, '../../test/unit/assets/0-255.pbf'))));

        const promise = loadGlyphRange('Arial Unicode MS', 0, 'https://localhost/fonts/v1/{fontstack}/{range}.pbf', manager);
        server.respond();
        const result = await promise;

        expect(transform).toHaveBeenCalledTimes(1);
        expect(transform).toHaveBeenCalledWith('https://localhost/fonts/v1/Arial Unicode MS/0-255.pbf', 'Glyphs');

        expect(Object.keys(result)).toHaveLength(223);
        for (const key in result) {
            const id = Number(key);
            const glyph = result[id];

            expect(glyph.id).toBe(Number(id));
            expect(glyph.metrics).toBeTruthy();
            expect(typeof glyph.metrics.width).toBe('number');
            expect(typeof glyph.metrics.height).toBe('number');
            expect(typeof glyph.metrics.top).toBe('number');
            expect(typeof glyph.metrics.advance).toBe('number');
        }
        expect(server.requests[0].url).toBe('https://localhost/fonts/v1/Arial Unicode MS/0-255.pbf');
    });

    test('warns on missing glyph range', async () => {
        jest.spyOn(console, 'warn').mockImplementation(() => { });

        const server = fakeServer.create();

        const promise = loadGlyphRange('Arial Unicode MS', 2, 'https://localhost/fonts/v1/{fontstack}/{range}.pbf', manager);
        server.respond();
        expect(async () => {
            const result = await promise;
            expect(console.warn).toHaveBeenCalledTimes(1);
            expect(Object.keys(result)).toHaveLength(0);
        }).not.toThrow();

        expect(transform).toHaveBeenCalledTimes(1);
        expect(transform).toHaveBeenCalledWith('https://localhost/fonts/v1/Arial Unicode MS/512-767.pbf', 'Glyphs');

        expect(server.requests[0].url).toBe('https://localhost/fonts/v1/Arial Unicode MS/512-767.pbf');
    });
});
