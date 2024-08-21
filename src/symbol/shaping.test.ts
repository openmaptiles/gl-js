import {type PositionedIcon, type Box, type Shaping, SectionOptions, TaggedString, determineLineBreaks, applyTextFit, shapeIcon, fitIconToText} from './shaping';
import {ImagePosition} from '../render/image_atlas';
import type {StyleGlyph} from '../style/style_glyph';
import {StyleImage, TextFit} from '../style/style_image';

describe('TaggedString', () => {
    describe('length', () => {
        test('counts a surrogate pair as a single character', () => {
            const tagged = new TaggedString();
            tagged.text = '茹𦨭';
            expect(tagged.length()).toBe(2);
        });
    });

    describe('trim', () => {
        test('turns a whitespace-only string into the empty string', () => {
            const tagged = new TaggedString();
            tagged.text = '  \t    \v ';
            tagged.sections = [new SectionOptions()];
            tagged.sectionIndex = Array(9).fill(0);
            tagged.trim();
            expect(tagged.text).toBe('');
            expect(tagged.sectionIndex).toHaveLength(0);
        });

        test('trims whitespace around a surrogate pair', () => {
            const tagged = new TaggedString();
            tagged.text = ' 茹𦨭 ';
            tagged.sections = [new SectionOptions()];
            tagged.sectionIndex = Array(4).fill(0);
            tagged.trim();
            expect(tagged.text).toBe('茹𦨭');
            expect(tagged.sectionIndex).toHaveLength(2);
        });
    });

    describe('substring', () => {
        test('avoids splitting a surrogate pair', () => {
            const tagged = new TaggedString();
            tagged.text = '𰻞𰻞麵𪚥𪚥';
            tagged.sections = [new SectionOptions()];
            tagged.sectionIndex = Array(5).fill(0);
            expect(tagged.substring(0, 1).text).toBe('𰻞');
            expect(tagged.substring(0, 1).sectionIndex).toEqual([0]);
            expect(tagged.substring(0, 2).text).toBe('𰻞𰻞');
            expect(tagged.substring(0, 2).sectionIndex).toEqual([0, 0]);
            expect(tagged.substring(1, 2).text).toBe('𰻞');
            expect(tagged.substring(1, 2).sectionIndex).toEqual([0]);
            expect(tagged.substring(1, 3).text).toBe('𰻞麵');
            expect(tagged.substring(1, 3).sectionIndex).toEqual([0, 0]);
            expect(tagged.substring(2, 5).text).toBe('麵𪚥𪚥');
            expect(tagged.substring(2, 5).sectionIndex).toEqual([0, 0, 0]);
        });
    });

    describe('codeUnitIndex', () => {
        test('splits surrogate pairs', () => {
            const tagged = new TaggedString();
            tagged.text = '𰻞𰻞麵𪚥𪚥';
            expect(tagged.toCodeUnitIndex(0)).toBe(0);
            expect(tagged.toCodeUnitIndex(1)).toBe(2);
            expect(tagged.toCodeUnitIndex(2)).toBe(4);
            expect(tagged.toCodeUnitIndex(3)).toBe(5);
            expect(tagged.toCodeUnitIndex(4)).toBe(7);
            expect(tagged.toCodeUnitIndex(5)).toBe(9);
        });
    });
});

describe('determineLineBreaks', () => {
    const metrics = {
        width: 22,
        height: 18,
        left: 0,
        top: -8,
        advance: 22,
    };
    const rect = {
        x: 0,
        y: 0,
        w: 32,
        h: 32,
    };
    const glyphs = {
        'Test': {
            '97': {id: 0x61, metrics, rect},
            '98': {id: 0x62, metrics, rect},
            '99': {id: 0x63, metrics, rect},
            '40629': {id: 0x9EB5, metrics, rect},
            '200414': {id: 0x30EDE, metrics, rect},
        } as any as StyleGlyph,
    };

    test('keeps alphabetic characters together', () => {
        const tagged = new TaggedString();
        tagged.text = 'abc';
        const section = new SectionOptions();
        section.fontStack = 'Test';
        tagged.sections = [section];
        tagged.sectionIndex = Array(3).fill(0);

        expect(determineLineBreaks(tagged, 0, 300, glyphs, {}, 30)).toEqual([3]);
    });

    test('keeps ideographic characters together', () => {
        const tagged = new TaggedString();
        tagged.text = '𰻞𰻞麵';
        const section = new SectionOptions();
        section.fontStack = 'Test';
        tagged.sections = [section];
        tagged.sectionIndex = Array(3).fill(0);

        expect(determineLineBreaks(tagged, 0, 300, glyphs, {}, 30)).toEqual([3]);
    });
});

describe('applyTextFit', () => {

    describe('applyTextFitHorizontal', () => {
        // This set of tests against applyTextFit starts with a 100x20 image with a 5,5,95,15 content box
        // that has been scaled to 4x4... resulting in a 14x14 image.
        const left = 0;
        const top = 0;
        const right = 14;
        const bottom = 14;
        const rectangle = {x: 0, y: 0, w: 100, h: 20};
        const content: [number, number, number, number] = [5, 5, 95, 15];

        test('applyTextFit: not specified', async () => {
            // No change should happen
            const styleImage: StyleImage = {
                pixelRatio: 1,
                version: 1,
                sdf: false,
                content,
                data: undefined!};
            const shapedIcon: PositionedIcon = {
                left,
                top,
                right,
                bottom,
                image: new ImagePosition(rectangle, styleImage),
            };
            const result: Box = applyTextFit(shapedIcon);
            expect(result).toEqual({x1: 0, y1: 0, x2: 14, y2: 14});
        });

        test('applyTextFit: stretchOrShrink', async () => {
            // No change should happen
            const styleImage: StyleImage = {
                pixelRatio: 1,
                version: 1,
                sdf: false,
                content,
                textFitWidth: TextFit.stretchOrShrink,
                textFitHeight: TextFit.stretchOrShrink,
                data: undefined!};
            const shapedIcon: PositionedIcon = {
                left,
                top,
                right,
                bottom,
                image: new ImagePosition(rectangle, styleImage),
            };
            const result: Box = applyTextFit(shapedIcon);
            expect(result).toEqual({x1: 0, y1: 0, x2: 14, y2: 14});
        });

        test('applyTextFit: stretchOnly, proportional', async () => {
            // Since textFitWidth is stretchOnly, it should be returned to
            // the aspect ratio of the content rectangle (9:1) aspect ratio so 126x14.
            const styleImage: StyleImage = {
                pixelRatio: 1,
                version: 1,
                sdf: false,
                content,
                textFitWidth: TextFit.stretchOnly,
                textFitHeight: TextFit.proportional,
                data: undefined!};
            const shapedIcon: PositionedIcon = {
                left,
                top,
                right,
                bottom,
                image: new ImagePosition(rectangle, styleImage),
            };
            const result: Box = applyTextFit(shapedIcon);
            expect(result).toEqual({x1: 0, y1: 0, x2: 126, y2: 14});
        });
    });

    describe('applyTextFitVertical', () => {
        // This set of tests against applyTextFit starts with a 20x100 image with a 5,5,15,95 content box
        // that has been scaled to 4x4... resulting in a 14x14 image.
        const left = 0;
        const top = 0;
        const right = 14;
        const bottom = 14;
        const rectangle = {x: 0, y: 0, w: 20, h: 100};
        const content: [number, number, number, number] = [5, 5, 15, 95];

        test('applyTextFit: proportional, stretchOnly', async () => {
            // Since the rectangle is wider than tall, when it matches based on width (because that is proportional),
            // then the height will stretch to match the content so we also get a 14x14 image.
            const styleImage: StyleImage = {
                pixelRatio: 1,
                version: 1,
                sdf: false,
                content,
                textFitWidth: TextFit.proportional,
                textFitHeight: TextFit.stretchOnly,
                data: undefined!};
            const shapedIcon: PositionedIcon = {
                left,
                top,
                right,
                bottom,
                image: new ImagePosition(rectangle, styleImage),
            };
            const result: Box = applyTextFit(shapedIcon);
            expect(result).toEqual({x1: 0, y1: 0, x2: 14, y2: 126});
        });
    });
});

describe('shapeIcon', () => {
    const imagePosition = new ImagePosition({x: 0, y: 0, w: 22, h: 22}, {pixelRatio: 1, version: 1} as StyleImage);
    const image = Object.freeze({
        content: undefined,
        stretchX: undefined,
        stretchY: undefined,
        paddedRect: Object.freeze({x: 0, y: 0, w: 22, h: 22}),
        pixelRatio: 1,
        version: 1
    });

    test('text-anchor: center', () => {
        expect(shapeIcon(imagePosition, [0, 0], 'center')).toEqual({
            top: -10,
            bottom: 10,
            left: -10,
            right: 10,
            image
        });

        expect(shapeIcon(imagePosition, [4, 7], 'center')).toEqual({
            top: -3,
            bottom: 17,
            left: -6,
            right: 14,
            image
        });

    });

    test('text-anchor: left', () => {
        expect(shapeIcon(imagePosition, [0, 0], 'left')).toEqual({
            top: -10,
            bottom: 10,
            left: 0,
            right: 20,
            image
        });

        expect(shapeIcon(imagePosition, [4, 7], 'left')).toEqual({
            top: -3,
            bottom: 17,
            left: 4,
            right: 24,
            image
        });

    });

    test('text-anchor: bottom-right', () => {
        expect(shapeIcon(imagePosition, [0, 0], 'bottom-right')).toEqual({
            top: -20,
            bottom: 0,
            left: -20,
            right: 0,
            image
        });

        expect(shapeIcon(imagePosition, [4, 7], 'bottom-right')).toEqual({
            top: -13,
            bottom: 7,
            left: -16,
            right: 4,
            image
        });

    });

});

describe('fitIconToText', () => {
    const glyphSize = 24;
    const shapedIcon = Object.freeze({
        top: -10,
        bottom: 10,
        left: -10,
        right: 10,
        collisionPadding: undefined,
        image: Object.freeze({
            pixelRatio: 1,
            displaySize: [20, 20],
            paddedRect: Object.freeze({x: 0, y: 0, w: 22, h: 22})
        })
    }) as PositionedIcon;

    const shapedText = Object.freeze({
        top: -10,
        bottom: 30,
        left: -60,
        right: 20
    }) as Shaping;

    test('icon-text-fit: width', () => {
        expect(
            fitIconToText(shapedIcon, shapedText, 'width', [0, 0, 0, 0], [0, 0], 24 / glyphSize)
        ).toEqual({
            image: shapedIcon.image,
            collisionPadding: undefined,
            top: 0,
            right: 20,
            bottom: 20,
            left: -60
        });

        expect(
            fitIconToText(shapedIcon, shapedText, 'width', [0, 0, 0, 0], [3, 7], 24 / glyphSize)
        ).toEqual({
            image: shapedIcon.image,
            collisionPadding: undefined,
            top: 7,
            right: 23,
            bottom: 27,
            left: -57
        });

        expect(
            fitIconToText(shapedIcon, shapedText, 'width', [0, 0, 0, 0], [0, 0], 12 / glyphSize)
        ).toEqual({
            image: shapedIcon.image,
            collisionPadding: undefined,
            top: -5,
            right: 10,
            bottom: 15,
            left: -30
        });

        // Ignores padding for top/bottom, since the icon is only stretched to the text's width but not height
        expect(
            fitIconToText(shapedIcon, shapedText, 'width', [5, 10, 5, 10], [0, 0], 12 / glyphSize)
        ).toEqual({
            image: shapedIcon.image,
            collisionPadding: undefined,
            top: -5,
            right: 20,
            bottom: 15,
            left: -40
        });

    });

    test('icon-text-fit: height', () => {
        expect(
            fitIconToText(shapedIcon, shapedText, 'height', [0, 0, 0, 0], [0, 0], 24 / glyphSize)
        ).toEqual({
            image: shapedIcon.image,
            collisionPadding: undefined,
            top: -10,
            right: -10,
            bottom: 30,
            left: -30
        });

        expect(
            fitIconToText(shapedIcon, shapedText, 'height', [0, 0, 0, 0], [3, 7], 24 / glyphSize)
        ).toEqual({
            image: shapedIcon.image,
            collisionPadding: undefined,
            top: -3,
            right: -7,
            bottom: 37,
            left: -27
        });

        expect(
            fitIconToText(shapedIcon, shapedText, 'height', [0, 0, 0, 0], [0, 0], 12 / glyphSize)
        ).toEqual({
            image: shapedIcon.image,
            collisionPadding: undefined,
            top: -5,
            right: 0,
            bottom: 15,
            left: -20
        });

        // Ignores padding for left/right, since the icon is only stretched to the text's height but not width
        expect(
            fitIconToText(shapedIcon, shapedText, 'height', [5, 10, 5, 10], [0, 0], 12 / glyphSize)
        ).toEqual({
            image: shapedIcon.image,
            collisionPadding: undefined,
            top: -10,
            right: 0,
            bottom: 20,
            left: -20
        });

    });

    test('icon-text-fit: both', () => {
        expect(
            fitIconToText(shapedIcon, shapedText, 'both', [0, 0, 0, 0], [0, 0], 24 / glyphSize)
        ).toEqual({
            image: shapedIcon.image,
            collisionPadding: undefined,
            top: -10,
            right: 20,
            bottom: 30,
            left: -60
        });

        expect(
            fitIconToText(shapedIcon, shapedText, 'both', [0, 0, 0, 0], [3, 7], 24 / glyphSize)
        ).toEqual({
            image: shapedIcon.image,
            collisionPadding: undefined,
            top: -3,
            right: 23,
            bottom: 37,
            left: -57
        });

        expect(
            fitIconToText(shapedIcon, shapedText, 'both', [0, 0, 0, 0], [0, 0], 12 / glyphSize)
        ).toEqual({
            image: shapedIcon.image,
            collisionPadding: undefined,
            top: -5,
            right: 10,
            bottom: 15,
            left: -30
        });

        expect(
            fitIconToText(shapedIcon, shapedText, 'both', [5, 10, 5, 10], [0, 0], 12 / glyphSize)
        ).toEqual({
            image: shapedIcon.image,
            collisionPadding: undefined,
            top: -10,
            right: 20,
            bottom: 20,
            left: -40
        });

        expect(
            fitIconToText(shapedIcon, shapedText, 'both', [0, 5, 10, 15], [0, 0], 12 / glyphSize)
        ).toEqual({
            image: shapedIcon.image,
            collisionPadding: undefined,
            top: -5,
            right: 15,
            bottom: 25,
            left: -45
        });

    });

});
