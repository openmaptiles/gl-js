import {loadGlyphRange} from '../style/load_glyph_range';

import TinySDF from '@mapbox/tiny-sdf';
import {unicodeBlockLookup} from '../util/is_char_in_unicode_block';
import {AlphaImage} from '../util/image';

import type {StyleGlyph} from '../style/style_glyph';
import type {RequestManager} from '../util/request_manager';
import type {GetGlyphsResponse} from '../util/actor_messages';

type Entry = {
    // null means we've requested the range, but the glyph wasn't included in the result.
    glyphs: {
        [id: number]: StyleGlyph | null;
    };
    requests: {
        [range: number]: Promise<{[_: number]: StyleGlyph | null}>;
    };
    ranges: {
        [range: number]: boolean | null;
    };
    tinySDF?: TinySDF;
};

export class GlyphManager {
    requestManager: RequestManager;
    localIdeographFontFamily: string | false;
    entries: {[stack: string]: Entry};
    url: string;

    // exposed as statics to enable stubbing in unit tests
    static loadGlyphRange = loadGlyphRange;
    static TinySDF = TinySDF;

    constructor(requestManager: RequestManager, localIdeographFontFamily?: string | false) {
        this.requestManager = requestManager;
        this.localIdeographFontFamily = localIdeographFontFamily;
        this.entries = {};
    }

    setURL(url?: string | null) {
        this.url = url;
    }

    async getGlyphs(glyphs: {[stack: string]: Array<number>}): Promise<GetGlyphsResponse> {
        const glyphsPromises: Promise<{stack: string; id: number; glyph: StyleGlyph}>[] = [];

        for (const stack in glyphs) {
            for (const id of glyphs[stack]) {
                glyphsPromises.push(this._getAndCacheGlyphsPromise(stack, id));
            }
        }

        const updatedGlyphs = await Promise.all(glyphsPromises);

        const result: GetGlyphsResponse = {};

        for (const {stack, id, glyph} of updatedGlyphs) {
            if (!result[stack]) {
                result[stack] = {};
            }
            // Clone the glyph so that our own copy of its ArrayBuffer doesn't get transferred.
            result[stack][id] = glyph && {
                id: glyph.id,
                bitmap: glyph.bitmap.clone(),
                metrics: glyph.metrics
            };
        }

        return result;
    }

    async _getAndCacheGlyphsPromise(stack: string, id: number): Promise<{stack: string; id: number; glyph: StyleGlyph}> {
        let entry = this.entries[stack];
        if (!entry) {
            entry = this.entries[stack] = {
                glyphs: {},
                requests: {},
                ranges: {}
            };
        }

        let glyph = entry.glyphs[id];
        if (glyph !== undefined) {
            return {stack, id, glyph};
        }

        glyph = this._tinySDF(entry, stack, id);
        if (glyph) {
            entry.glyphs[id] = glyph;
            return {stack, id, glyph};
        }

        const range = Math.floor(id / 256);
        if (range * 256 > 65535) {
            throw new Error('glyphs > 65535 not supported');
        }

        if (entry.ranges[range]) {
            return {stack, id, glyph};
        }

        if (!this.url) {
            throw new Error('glyphsUrl is not set');
        }

        if (!entry.requests[range]) {
            const promise = GlyphManager.loadGlyphRange(stack, range, this.url, this.requestManager);
            entry.requests[range] = promise;
        }

        const response = await entry.requests[range];
        for (const id in response) {
            if (!this._doesCharSupportLocalGlyph(+id)) {
                entry.glyphs[+id] = response[+id];
            }
        }
        entry.ranges[range] = true;
        return {stack, id, glyph: response[id] || null};
    }

    _doesCharSupportLocalGlyph(id: number): boolean {
        // The CJK Unified Ideographs blocks and Hangul Syllables blocks are
        // spread across many glyph PBFs and are typically accessed very
        // randomly. Preferring local rendering for these blocks reduces
        // wasteful bandwidth consumption. For visual consistency within CJKV
        // text, also include any other CJKV or siniform ideograph or hangul,
        // hiragana, or katakana character.
        return !!this.localIdeographFontFamily &&
        (/\p{Ideo}|\p{sc=Hang}|\p{sc=Hira}|\p{sc=Kana}/u.test(String.fromCodePoint(id)) ||
        // fallback: RegExp can't cover all cases. refer Issue #5420
        unicodeBlockLookup['CJK Unified Ideographs'](id) ||
        unicodeBlockLookup['Hangul Syllables'](id) ||
        unicodeBlockLookup['Hiragana'](id) ||
        unicodeBlockLookup['Katakana'](id) || // includes "ー"
        // memo: these symbols are not all. others could be added if needed.
        unicodeBlockLookup['CJK Symbols and Punctuation'](id) || // 、。〃〄々〆〇〈〉《》「...
        unicodeBlockLookup['Halfwidth and Fullwidth Forms'](id) // ！？＂＃＄％＆...
        );
         
    }

    _tinySDF(entry: Entry, stack: string, id: number): StyleGlyph {
        const fontFamily = this.localIdeographFontFamily;
        if (!fontFamily) {
            return;
        }

        if (!this._doesCharSupportLocalGlyph(id)) {
            return;
        }

        // Client-generated glyphs are rendered at 2x texture scale,
        // because CJK glyphs are more detailed than others.
        const textureScale = 2;

        let tinySDF = entry.tinySDF;
        if (!tinySDF) {
            let fontWeight = '400';
            if (/bold/i.test(stack)) {
                fontWeight = '900';
            } else if (/medium/i.test(stack)) {
                fontWeight = '500';
            } else if (/light/i.test(stack)) {
                fontWeight = '200';
            }
            tinySDF = entry.tinySDF = new GlyphManager.TinySDF({
                fontSize: 24 * textureScale,
                buffer: 3 * textureScale,
                radius: 8 * textureScale,
                cutoff: 0.25,
                fontFamily,
                fontWeight
            });
        }

        const char = tinySDF.draw(String.fromCharCode(id));

        /**
         * TinySDF's "top" is the distance from the alphabetic baseline to the top of the glyph.
         * Server-generated fonts specify "top" relative to an origin above the em box (the origin
         * comes from FreeType, but I'm unclear on exactly how it's derived)
         * ref: https://github.com/mapbox/sdf-glyph-foundry
         *
         * Server fonts don't yet include baseline information, so we can't line up exactly with them
         * (and they don't line up with each other)
         * ref: https://github.com/mapbox/node-fontnik/pull/160
         *
         * To approximately align TinySDF glyphs with server-provided glyphs, we use this baseline adjustment
         * factor calibrated to be in between DIN Pro and Arial Unicode (but closer to Arial Unicode)
         */
        const topAdjustment = 27.5;

        const leftAdjustment = 0.5;

        return {
            id,
            bitmap: new AlphaImage({width: char.width || 30 * textureScale, height: char.height || 30 * textureScale}, char.data),
            metrics: {
                width: char.glyphWidth / textureScale || 24,
                height: char.glyphHeight / textureScale || 24,
                left: (char.glyphLeft / textureScale + leftAdjustment) || 0,
                top: char.glyphTop / textureScale - topAdjustment || -8,
                advance: char.glyphAdvance / textureScale || 24,
                isDoubleResolution: true
            }
        };
    }
}
