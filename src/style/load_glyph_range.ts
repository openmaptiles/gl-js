import {getArrayBuffer} from '../util/ajax';
import {ResourceType} from '../util/request_manager';

import {parseGlyphPbf} from './parse_glyph_pbf';

import type {StyleGlyph} from './style_glyph';
import type {RequestManager} from '../util/request_manager';

export async function loadGlyphRange(fontstack: string,
    range: number,
    urlTemplate: string,
    requestManager: RequestManager): Promise<{[_: number]: StyleGlyph | null}> {
    const begin = range * 256;
    const end = begin + 255;

    const request = requestManager.transformRequest(
        urlTemplate.replace('{fontstack}', fontstack).replace('{range}', `${begin}-${end}`),
        ResourceType.Glyphs
    );

    const response = await getArrayBuffer(request, new AbortController());
    if (!response || !response.data) {
        throw new Error(`Could not load glyph range. range: ${range}, ${begin}-${end}`);
    }
    const glyphs = {};

    for (const glyph of parseGlyphPbf(response.data)) {
        glyphs[glyph.id] = glyph;
    }

    return glyphs;
}
