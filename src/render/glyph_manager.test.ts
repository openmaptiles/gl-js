import {describe, afterEach, test, expect, vi} from 'vitest';
import {parseGlyphPbf} from '../style/parse_glyph_pbf';
import {GlyphManager} from './glyph_manager';
import fs from 'fs';
import {type RequestManager} from '../util/request_manager';

describe('GlyphManager', () => {
    const GLYPHS = {};
    for (const glyph of parseGlyphPbf(fs.readFileSync('./test/unit/assets/0-255.pbf'))) {
        GLYPHS[glyph.id] = glyph;
    }

    const identityTransform = ((url) => ({url})) as any as RequestManager;

    const createLoadGlyphRangeStub = () => {
        return vi.spyOn(GlyphManager, 'loadGlyphRange').mockImplementation((stack, range, urlTemplate, transform) => {
            expect(stack).toBe('Arial Unicode MS');
            expect(range).toBe(0);
            expect(urlTemplate).toBe('https://localhost/fonts/v1/{fontstack}/{range}.pbf');
            expect(transform).toBe(identityTransform);
            return Promise.resolve(GLYPHS);
        });
    };

    const createGlyphManager = (font?) => {
        const manager = new GlyphManager(identityTransform, font);
        manager.setURL('https://localhost/fonts/v1/{fontstack}/{range}.pbf');
        return manager;
    };

    afterEach(() => {
        vi.clearAllMocks();
    });

    test('GlyphManager requests 0-255 PBF', async () => {
        createLoadGlyphRangeStub();
        const manager = createGlyphManager();

        const returnedGlyphs = await manager.getGlyphs({'Arial Unicode MS': [55]});
        expect(returnedGlyphs['Arial Unicode MS']['55'].metrics.advance).toBe(12);
    });

    test('GlyphManager doesn\'t request twice 0-255 PBF if a glyph is missing', async () => {
        const stub = createLoadGlyphRangeStub();
        const manager = createGlyphManager();

        await manager.getGlyphs({'Arial Unicode MS': [0.5]});
        expect(manager.entries['Arial Unicode MS'].ranges[0]).toBe(true);
        expect(stub).toHaveBeenCalledTimes(1);

        // We remove all requests as in getGlyphs code.
        delete manager.entries['Arial Unicode MS'].requests[0];

        await manager.getGlyphs({'Arial Unicode MS': [0.5]});
        expect(manager.entries['Arial Unicode MS'].ranges[0]).toBe(true);
        expect(stub).toHaveBeenCalledTimes(1);
    });

    test('GlyphManager requests remote CJK PBF', async () => {
        vi.spyOn(GlyphManager, 'loadGlyphRange').mockImplementation((_stack, _range, _urlTemplate, _transform) => {
            return Promise.resolve(GLYPHS);
        });

        const manager = createGlyphManager();

        const returnedGlyphs = await manager.getGlyphs({'Arial Unicode MS': [0x5e73]});
        expect(returnedGlyphs['Arial Unicode MS'][0x5e73]).toBeNull(); // The fixture returns a PBF without the glyph we requested
    });

    test('GlyphManager does not cache CJK chars that should be rendered locally', async () => {
        vi.spyOn(GlyphManager, 'loadGlyphRange').mockImplementation((_stack, range, _urlTemplate, _transform) => {
            const overlappingGlyphs = {};
            const start = range * 256;
            const end = start + 256;
            for (let i = start, j = 0; i < end; i++, j++) {
                overlappingGlyphs[i] = GLYPHS[j];
            }
            return Promise.resolve(overlappingGlyphs);
        });

        const manager = createGlyphManager('sans-serif');

        //Request char that overlaps Katakana range
        let returnedGlyphs = await manager.getGlyphs({'Arial Unicode MS': [0x3005]});
        expect(returnedGlyphs['Arial Unicode MS'][0x3005]).not.toBeNull();
        //Request char from Katakana range (te テ)
        returnedGlyphs = await manager.getGlyphs({'Arial Unicode MS': [0x30C6]});
        const glyph = returnedGlyphs['Arial Unicode MS'][0x30c6];
        //Ensure that te is locally generated.
        expect(glyph.bitmap.height).toBe(12);
        expect(glyph.bitmap.width).toBe(12);
    });

    test('GlyphManager generates CJK PBF locally', async () => {
        const manager = createGlyphManager('sans-serif');

        // Chinese character píng 平
        const returnedGlyphs = await manager.getGlyphs({'Arial Unicode MS': [0x5e73]});
        expect(returnedGlyphs['Arial Unicode MS'][0x5e73].metrics.advance).toBe(0.5);
    });

    test('GlyphManager generates Katakana PBF locally', async () => {
        const manager = createGlyphManager('sans-serif');

        // Katakana letter te テ
        const returnedGlyphs = await manager.getGlyphs({'Arial Unicode MS': [0x30c6]});
        expect(returnedGlyphs['Arial Unicode MS'][0x30c6].metrics.advance).toBe(0.5);
    });

    test('GlyphManager generates Hiragana PBF locally', async () => {
        const manager = createGlyphManager('sans-serif');

        //Hiragana letter te て
        const returnedGlyphs = await manager.getGlyphs({'Arial Unicode MS': [0x3066]});
        expect(returnedGlyphs['Arial Unicode MS'][0x3066].metrics.advance).toBe(0.5);
    });

    test('GlyphManager consistently generates CJKV text locally', async () => {
        const manager = createGlyphManager('sans-serif');

        // Space
        expect(manager._doesCharSupportLocalGlyph(0x0020)).toBe(false);
        // Chinese character píng 平
        expect(manager._doesCharSupportLocalGlyph(0x5e73)).toBe(true);
        // Chinese character biáng 𰻞
        expect(manager._doesCharSupportLocalGlyph(0x30EDE)).toBe(true);
        // Katakana letter te テ
        expect(manager._doesCharSupportLocalGlyph(0x30c6)).toBe(true);
        // Hiragana letter te て
        expect(manager._doesCharSupportLocalGlyph(0x3066)).toBe(true);
        // Hangul letter a 아
        expect(manager._doesCharSupportLocalGlyph(0xC544)).toBe(true);
        // Japanese full-width dash ー
        expect(manager._doesCharSupportLocalGlyph(0x30FC)).toBe(true);
        // Halfwidth and Fullwidth Forms: full-width exclamation ！
        expect(manager._doesCharSupportLocalGlyph(0xFF01)).toBe(true);
        // CJK Symbols and Punctuation: Japanese Post mark 〒
        expect(manager._doesCharSupportLocalGlyph(0x3012)).toBe(true);
    });

    test('GlyphManager caches locally generated glyphs', async () => {

        const manager = createGlyphManager('sans-serif');
        const drawSpy = GlyphManager.TinySDF.prototype.draw = vi.fn().mockImplementation(() => {
            return {data: new Uint8ClampedArray(60 * 60)} as any;
        });

        // Katakana letter te
        const returnedGlyphs = await manager.getGlyphs({'Arial Unicode MS': [0x30c6]});
        expect(returnedGlyphs['Arial Unicode MS'][0x30c6].metrics.advance).toBe(24);
        await manager.getGlyphs({'Arial Unicode MS': [0x30c6]});
        expect(drawSpy).toHaveBeenCalledTimes(1);
    });
});
