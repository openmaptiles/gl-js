import {loadGlyphRange} from '../style/load_glyph_range';

import TinySDF from '@mapbox/tiny-sdf';
import {charAllowsIdeographicBreaking} from '../util/script_detection';
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

    /**
     * Returns whether the given codepoint should be rendered locally.
     *
     * Local rendering is preferred for Unicode code blocks that represent writing systems for
     * which TinySDF produces optimal results and greatly reduces bandwidth consumption. In
     * general, TinySDF is best for any writing system typically set in a monospaced font. With
     * more than 99,000 codepoints accessed essentially at random, Hanzi/Kanji/Hanja (from the CJK
     * Unified Ideographs blocks) is the canonical example of wasteful bandwidth consumption when
     * rendered remotely. For visual consistency within CJKV text, even relatively small CJKV and
     * other siniform code blocks prefer local rendering.
     */
    _doesCharSupportLocalGlyph(id: number): boolean {
        return !!this.localIdeographFontFamily &&
            (/\p{Ideo}|\p{sc=Hang}|\p{sc=Hira}|\p{sc=Kana}/u.test(String.fromCodePoint(id)) ||
             charAllowsIdeographicBreaking(id));
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

        const char = tinySDF.draw(String.fromCodePoint(id));

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
