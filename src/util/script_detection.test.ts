import {charAllowsIdeographicBreaking, charAllowsLetterSpacing, charHasUprightVerticalOrientation, charInComplexShapingScript, charInRTLScript} from './script_detection';

describe('charAllowsIdeographicBreaking', () => {
    test('disallows ideographic breaking of Latin text', () => {
        expect(charAllowsIdeographicBreaking('A'.codePointAt(0))).toBe(false);
        expect(charAllowsIdeographicBreaking('3'.codePointAt(0))).toBe(false);
    });

    test('allows ideographic breaking of ideographic punctuation', () => {
        expect(charAllowsIdeographicBreaking('〈'.codePointAt(0))).toBe(true);
    });

    test('allows ideographic breaking of Bopomofo text', () => {
        expect(charAllowsIdeographicBreaking('ㄎ'.codePointAt(0))).toBe(true);
    });

    test('allows ideographic breaking of Chinese and Vietnamese text', () => {
        expect(charAllowsIdeographicBreaking('市'.codePointAt(0))).toBe(true);
        expect(charAllowsIdeographicBreaking('𡔖'.codePointAt(0))).toBe(true);
        expect(charAllowsIdeographicBreaking('麵'.codePointAt(0))).toBe(true);
        expect(charAllowsIdeographicBreaking('𪚥'.codePointAt(0))).toBe(true);
    });

    test('disallows ideographic breaking of Korean text', () => {
        expect(charAllowsIdeographicBreaking('아'.codePointAt(0))).toBe(false);
    });

    test('allows ideographic breaking of Japanese text', () => {
        expect(charAllowsIdeographicBreaking('あ'.codePointAt(0))).toBe(true);
        expect(charAllowsIdeographicBreaking('カ'.codePointAt(0))).toBe(true);
    });

    test('allows ideographic breaking of Yi text', () => {
        expect(charAllowsIdeographicBreaking('ꉆ'.codePointAt(0))).toBe(true);
    });
});

describe('charAllowsLetterSpacing', () => {
    test('allows letter spacing of Latin text', () => {
        expect(charAllowsLetterSpacing('A'.codePointAt(0))).toBe(true);
    });

    test('disallows ideographic breaking of Arabic text', () => {
        // Arabic
        expect(charAllowsLetterSpacing('۳'.codePointAt(0))).toBe(false);
        // Arabic Supplement
        expect(charAllowsLetterSpacing('ݣ'.codePointAt(0))).toBe(false);
        // Arabic Extended-A
        expect(charAllowsLetterSpacing('ࢳ'.codePointAt(0))).toBe(false);
        // Arabic Extended-B
        expect(charAllowsLetterSpacing('࢐'.codePointAt(0))).toBe(false);
        // Arabic Presentation Forms-A
        expect(charAllowsLetterSpacing('ﰤ'.codePointAt(0))).toBe(false);
        // Arabic Presentation Forms-B
        expect(charAllowsLetterSpacing('ﺽ'.codePointAt(0))).toBe(false);
    });
});

describe('charHasUprightVerticalOrientation', () => {
    test('rotates Latin text sideways', () => {
        expect(charHasUprightVerticalOrientation('A'.codePointAt(0))).toBe(false);
    });

    test('keeps Bopomofo text upright', () => {
        expect(charHasUprightVerticalOrientation('ㄎ'.codePointAt(0))).toBe(true);
    });

    test('keeps Canadian Aboriginal text upright', () => {
        expect(charHasUprightVerticalOrientation('ᐃ'.codePointAt(0))).toBe(true);
    });

    test('keeps Chinese and Vietnamese text upright', () => {
        expect(charHasUprightVerticalOrientation('市'.codePointAt(0))).toBe(true);
        expect(charHasUprightVerticalOrientation('𡔖'.codePointAt(0))).toBe(true);
    });

    test('keeps Korean text upright', () => {
        expect(charHasUprightVerticalOrientation('아'.codePointAt(0))).toBe(true);
    });

    test('keeps Japanese text upright', () => {
        expect(charHasUprightVerticalOrientation('あ'.codePointAt(0))).toBe(true);
        expect(charHasUprightVerticalOrientation('カ'.codePointAt(0))).toBe(true);
    });

    test('keeps Yi text upright', () => {
        expect(charHasUprightVerticalOrientation('ꉆ'.codePointAt(0))).toBe(true);
    });
});

describe('charInComplexShapingScript', () => {
    test('recognizes that Arabic text needs complex shaping', () => {
        // Non-Arabic
        expect(charInComplexShapingScript('3'.codePointAt(0))).toBe(false);
        // Arabic
        expect(charInComplexShapingScript('۳'.codePointAt(0))).toBe(true);
        // Arabic Supplement
        expect(charInComplexShapingScript('ݣ'.codePointAt(0))).toBe(true);
        // Arabic Extended-A
        expect(charInComplexShapingScript('ࢳ'.codePointAt(0))).toBe(true);
        // Arabic Extended-B
        expect(charInComplexShapingScript('࢐'.codePointAt(0))).toBe(true);
        // Arabic Presentation Forms-A
        expect(charInComplexShapingScript('ﰤ'.codePointAt(0))).toBe(true);
        // Arabic Presentation Forms-B
        expect(charInComplexShapingScript('ﺽ'.codePointAt(0))).toBe(true);
    });
});

describe('charInRTLScript', () => {
    test('does not identify direction-neutral text as right-to-left', () => {
        expect(charInRTLScript('3'.codePointAt(0))).toBe(false);
    });

    test('identifies Arabic text as right-to-left', () => {
        // Arabic
        expect(charInRTLScript('۳'.codePointAt(0))).toBe(true);
        // Arabic Supplement
        expect(charInRTLScript('ݣ'.codePointAt(0))).toBe(true);
        // Arabic Extended-A
        expect(charInRTLScript('ࢳ'.codePointAt(0))).toBe(true);
        // Arabic Extended-B
        expect(charInRTLScript('࢐'.codePointAt(0))).toBe(true);
        // Arabic Presentation Forms-A
        expect(charInRTLScript('ﰤ'.codePointAt(0))).toBe(true);
        // Arabic Presentation Forms-B
        expect(charInRTLScript('ﺽ'.codePointAt(0))).toBe(true);
    });

    test('identifies Hebrew text as right-to-left', () => {
        // Hebrew
        expect(charInRTLScript('ה'.codePointAt(0))).toBe(true);
        // Alphabetic Presentation Forms
        expect(charInRTLScript('ﬡ'.codePointAt(0))).toBe(true);
    });

    test('identifies Thaana text as right-to-left', () => {
        // Thaana
        expect(charInRTLScript('ޘ'.codePointAt(0))).toBe(true);
    });
});
