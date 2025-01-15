import {Anchor} from './anchor';

import {getAnchors, getCenterAnchor} from './get_anchors';
import {clipLine} from './clip_line';
import {shapeText, shapeIcon, WritingMode, fitIconToText} from './shaping';
import {getGlyphQuads, getIconQuads} from './quads';
import {CollisionFeature} from './collision_feature';
import {warnOnce} from '../util/util';
import {
    allowsVerticalWritingMode,
    allowsLetterSpacing
} from '../util/script_detection';
import {findPoleOfInaccessibility} from '../util/find_pole_of_inaccessibility';
import {EXTENT} from '../data/extent';
import {SymbolBucket} from '../data/bucket/symbol_bucket';
import {EvaluationParameters} from '../style/evaluation_parameters';
import {SIZE_PACK_FACTOR, MAX_PACKED_SIZE, MAX_GLYPH_ICON_SIZE} from './symbol_size';
import ONE_EM from './one_em';
import type {CanonicalTileID} from '../source/tile_id';
import type {Shaping, PositionedIcon, TextJustify} from './shaping';
import type {CollisionBoxArray, TextAnchorOffsetArray} from '../data/array_types.g';
import type {SymbolFeature} from '../data/bucket/symbol_bucket';
import type {StyleImage} from '../style/style_image';
import type {StyleGlyph} from '../style/style_glyph';
import type {SymbolStyleLayer} from '../style/style_layer/symbol_style_layer';
import type {ImagePosition} from '../render/image_atlas';
import type {GlyphPosition} from '../render/glyph_atlas';
import type {PossiblyEvaluatedPropertyValue} from '../style/properties';

import type Point from '@mapbox/point-geometry';
import murmur3 from 'murmurhash-js';
import {getIconPadding, type SymbolPadding} from '../style/style_layer/symbol_style_layer';
import {type VariableAnchorOffsetCollection, classifyRings} from '@maplibre/maplibre-gl-style-spec';
import {getTextVariableAnchorOffset, evaluateVariableOffset, INVALID_TEXT_OFFSET, type TextAnchor, TextAnchorEnum} from '../style/style_layer/variable_text_anchor';
import {subdivideVertexLine} from '../render/subdivision';
import type {SubdivisionGranularitySetting} from '../render/subdivision_granularity_settings';

//import {Color} from '@maplibre/maplibre-gl-style-spec';

// The symbol layout process needs `text-size` evaluated at up to five different zoom levels, and
// `icon-size` at up to three:
//
//   1. `text-size` at the zoom level of the bucket. Used to calculate a per-feature size for source `text-size`
//       expressions, and to calculate the box dimensions for icon-text-fit.
//   2. `icon-size` at the zoom level of the bucket. Used to calculate a per-feature size for source `icon-size`
//       expressions.
//   3. `text-size` and `icon-size` at the zoom level of the bucket, plus one. Used to calculate collision boxes.
//   4. `text-size` at zoom level 18. Used for something line-symbol-placement-related.
//   5.  For composite `*-size` expressions: two zoom levels of curve stops that "cover" the zoom level of the
//       bucket. These go into a vertex buffer and are used by the shader to interpolate the size at render time.
//
// (1) and (2) are stored in `bucket.layers[0].layout`. The remainder are below.
//
type Sizes = {
    layoutTextSize: PossiblyEvaluatedPropertyValue<number>; // (3),
    layoutIconSize: PossiblyEvaluatedPropertyValue<number>; // (3),
    textMaxSize: PossiblyEvaluatedPropertyValue<number>;    // (4),
    compositeTextSizes: [PossiblyEvaluatedPropertyValue<number>, PossiblyEvaluatedPropertyValue<number>]; // (5),
    compositeIconSizes: [PossiblyEvaluatedPropertyValue<number>, PossiblyEvaluatedPropertyValue<number>]; // (5)
};

type ShapedTextOrientations = {
    vertical: Shaping | false;
    horizontal: Record<TextJustify, Shaping>;
};

export function performSymbolLayout(args: {
    bucket: SymbolBucket;
    glyphMap: {
        [_: string]: {
            [x: number]: StyleGlyph;
        };
    };
    glyphPositions: {
        [_: string]: {
            [x: number]: GlyphPosition;
        };
    };
    imageMap: {[_: string]: StyleImage};
    imagePositions: {[_: string]: ImagePosition};
    showCollisionBoxes: boolean;
    canonical: CanonicalTileID;
    subdivisionGranularity: SubdivisionGranularitySetting;
}) {
    args.bucket.createArrays();

    const tileSize = 512 * args.bucket.overscaling;
    args.bucket.tilePixelRatio = EXTENT / tileSize;
    args.bucket.compareText = {};
    args.bucket.iconsNeedLinear = false;

    const layer = args.bucket.layers[0];
    const layout = layer.layout;
    const unevaluatedLayoutValues = layer._unevaluatedLayout._values;

    const sizes: Sizes = {
        // Filled in below, if *SizeData.kind is 'composite'
        // compositeIconSizes: undefined,
        // compositeTextSizes: undefined,
        layoutIconSize: unevaluatedLayoutValues['icon-size'].possiblyEvaluate(new EvaluationParameters(args.bucket.zoom + 1), args.canonical),
        layoutTextSize: unevaluatedLayoutValues['text-size'].possiblyEvaluate(new EvaluationParameters(args.bucket.zoom + 1), args.canonical),
        textMaxSize: unevaluatedLayoutValues['text-size'].possiblyEvaluate(new EvaluationParameters(18))
    } as Sizes;

    if (args.bucket.textSizeData.kind === 'composite') {
        const {minZoom, maxZoom} = args.bucket.textSizeData;
        sizes.compositeTextSizes = [
            unevaluatedLayoutValues['text-size'].possiblyEvaluate(new EvaluationParameters(minZoom), args.canonical),
            unevaluatedLayoutValues['text-size'].possiblyEvaluate(new EvaluationParameters(maxZoom), args.canonical)
        ];
    }

    if (args.bucket.iconSizeData.kind === 'composite') {
        const {minZoom, maxZoom} = args.bucket.iconSizeData;
        sizes.compositeIconSizes = [
            unevaluatedLayoutValues['icon-size'].possiblyEvaluate(new EvaluationParameters(minZoom), args.canonical),
            unevaluatedLayoutValues['icon-size'].possiblyEvaluate(new EvaluationParameters(maxZoom), args.canonical)
        ];
    }

    const lineHeight = layout.get('text-line-height') * ONE_EM;
    const textAlongLine = layout.get('text-rotation-alignment') !== 'viewport' && layout.get('symbol-placement') !== 'point';
    const keepUpright = layout.get('text-keep-upright');
    const textSize = layout.get('text-size');

    /*
    const splitChars = new Map([
        ['\uE001', new Color(0.941, 0.973, 1, 1)], // AliceBlue
        ['\uE002', new Color(0.98, 0.922, 0.843, 1)], // AntiqueWhite
        ['\uE003', new Color(0, 1, 1, 1)], // Aqua
        ['\uE004', new Color(0.498, 1, 0.831, 1)], // Aquamarine
        ['\uE005', new Color(0.941, 1, 1, 1)], // Azure
        ['\uE006', new Color(0.961, 0.961, 0.863, 1)], // Beige
        ['\uE007', new Color(1, 0.894, 0.769, 1)], // Bisque
        ['\uE008', new Color(0, 0, 0, 1)], // Black
        ['\uE009', new Color(1, 0.922, 0.804, 1)], // BlanchedAlmond
        ['\uE00A', new Color(0, 0, 1, 1)], // Blue
        ['\uE00B', new Color(0.541, 0.169, 0.886, 1)], // BlueViolet
        ['\uE00C', new Color(0.647, 0.165, 0.165)], // Brown
        ['\uE00D', new Color(0.871, 0.722, 0.529, 1)], // BurlyWood
        ['\uE00E', new Color(0.373, 0.62, 0.627, 1)], // CadetBlue
        ['\uE00F', new Color(0.498, 1, 0, 1)], // Chartreuse
        ['\uE010', new Color(0.824, 0.412, 0.118, 1)], // Chocolate
        ['\uE011', new Color(1, 0.498, 0.314, 1)], // Coral
        ['\uE012', new Color(0.392, 0.584, 0.929, 1)], // CornflowerBlue
        ['\uE013', new Color(1, 0.973, 0.863, 1)], // Cornsilk
        ['\uE014', new Color(0.863, 0.078, 0.235, 1)], // Crimson
        ['\uE015', new Color(0, 1, 1, 1)], // Cyan
        ['\uE016', new Color(0, 0, 0.545, 1)], // DarkBlue
        ['\uE017', new Color(0, 0.545, 0.545, 1)], // DarkCyan
        ['\uE018', new Color(0.722, 0.525, 0.043, 1)], // DarkGoldenRod
        ['\uE019', new Color(0.663, 0.663, 0.663, 1)], // DarkGray
        ['\uE01A', new Color(0, 0.392, 0, 1)], // DarkGreen
        ['\uE01B', new Color(0.741, 0.718, 0.42, 1)], // DarkKhaki
        ['\uE01C', new Color(0.545, 0, 0.545, 1)], // DarkMagenta
        ['\uE01D', new Color(0.333, 0.42, 0.184, 1)], // DarkOliveGreen
        ['\uE01E', new Color(1, 0.549, 0, 1)], // DarkOrange
        ['\uE01F', new Color(0.6, 0.196, 0.8, 1)], // DarkOrchid
        ['\uE020', new Color(0.545, 0, 0, 1)], // DarkRed
        ['\uE021', new Color(0.914, 0.588, 0.478, 1)], // DarkSalmon
        ['\uE022', new Color(0.561, 0.737, 0.545, 1)], // DarkSeaGreen
        ['\uE023', new Color(0.282, 0.239, 0.545, 1)], // DarkSlateBlue
        ['\uE024', new Color(0.184, 0.31, 0.31, 1)], // DarkSlateGray
        ['\uE025', new Color(0, 0.808, 0.82, 1)], // DarkTurquoise
        ['\uE026', new Color(0.58, 0, 0.827, 1)], // DarkViolet
        ['\uE027', new Color(1, 0.078, 0.576, 1)], // DeepPink
        ['\uE028', new Color(0, 0.749, 1, 1)], // DeepSkyBlue
        ['\uE029', new Color(0.412, 0.412, 0.412, 1)], // DimGray
        ['\uE02A', new Color(0.118, 0.565, 1, 1)], // DodgerBlue
        ['\uE02B', new Color(0.698, 0.133, 0.133, 1)], // FireBrick
        ['\uE02C', new Color(1, 0.98, 0.941, 1)], // FloralWhite
        ['\uE02D', new Color(0.133, 0.545, 0.133, 1)], // ForestGreen
        ['\uE02E', new Color(1, 0.0, 1, 1)], // Fuchsia
        ['\uE02F', new Color(0.863, 0.863, 0.863, 1)], // Gainsboro
        ['\uE030', new Color(0.973, 0.973, 1, 1)], // GhostWhite
        ['\uE031', new Color(1, 0.843, 0, 1)], // Gold
        ['\uE032', new Color(0.855, 0.647, 0.125, 1)], // GoldenRod
        ['\uE033', new Color(0.502, 0.502, 0.502, 1)], // Gray
        ['\uE034', new Color(0, 0.502, 0)], // Green
        ['\uE035', new Color(0.678, 1, 0.184, 1)], // GreenYellow
        ['\uE036', new Color(0.941, 1, 0.941, 1)], // Honeydew
        ['\uE037', new Color(1, 0.412, 0.706, 1)], // HotPink
        ['\uE038', new Color(0.804, 0.361, 0.361, 1)], // IndianRed
        ['\uE039', new Color(0.294, 0, 0.51, 1)], // Indigo
        ['\uE03A', new Color(1, 1, 0.941, 1)], // Ivory
        ['\uE03B', new Color(0.941, 0.902, 0.549, 1)], // Khaki
        ['\uE03C', new Color(0.902, 0.902, 0.98, 1)], // Lavender
        ['\uE03D', new Color(1, 0.941, 0.961, 1)], // LavenderBlush
        ['\uE03E', new Color(0.486, 0.988, 0, 1)], // LawnGreen
        ['\uE03F', new Color(1, 0.98, 0.804, 1)], // LemonChiffon
        ['\uE040', new Color(0.678, 0.847, 0.902, 1)], // LightBlue
        ['\uE041', new Color(0.941, 0.502, 0.502, 1)], // LightCoral
        ['\uE042', new Color(0.878, 1, 1, 1)], // LightCyan
        ['\uE043', new Color(0.98, 0.98, 0.824, 1)], // LightGoldenRodYellow
        ['\uE044', new Color(0.827, 0.827, 0.827, 1)], // LightGray
        ['\uE045', new Color(0.565, 0.933, 0.565, 1)], // LightGreen
        ['\uE046', new Color(1, 0.714, 0.757, 1)], // LightPink
        ['\uE047', new Color(1, 0.627, 0.478, 1)], // LightSalmon
        ['\uE048', new Color(0.125, 0.698, 0.667, 1)], // LightSeaGreen
        ['\uE049', new Color(0.529, 0.808, 0.98, 1)], // LightSkyBlue
        ['\uE04A', new Color(0.467, 0.533, 0.6, 1)], // LightSlateGray
        ['\uE04B', new Color(0.69, 0.769, 0.871, 1)], // LightSteelBlue
        ['\uE04C', new Color(1, 1, 0.878, 1)], // LightYellow
        ['\uE04D', new Color(0, 1, 0, 1)], // Lime
        ['\uE04E', new Color(0.196, 0.804, 0.196, 1)], // LimeGreen
        ['\uE04F', new Color(0.98, 0.941, 0.902, 1)], // Linen
        ['\uE050', new Color(1, 0.0, 1, 1)], // Magenta
        ['\uE051', new Color(0.502, 0.0, 0.0, 1)], // Maroon
        ['\uE052', new Color(0.4, 0.804, 0.667, 1)], // MediumAquaMarine
        ['\uE053', new Color(0.0, 0.0, 0.804, 1)], // MediumBlue
        ['\uE054', new Color(0.729, 0.333, 0.827, 1)], // MediumOrchid
        ['\uE055', new Color(0.576, 0.439, 0.859, 1)], // MediumPurple
        ['\uE056', new Color(0.235, 0.702, 0.443, 1)], // MediumSeaGreen
        ['\uE057', new Color(0.482, 0.408, 0.933, 1)], // MediumSlateBlue
        ['\uE058', new Color(0.235, 0.702, 0.443, 1)], // MediumSpringGreen
        ['\uE059', new Color(0, 0.98, 0.604, 1)], // MediumTurquoise
        ['\uE05A', new Color(0.78, 0.082, 0.522, 1)], // MediumVioletRed
        ['\uE05B', new Color(0.02, 0.02, 0.439, 1)], // MidnightBlue
        ['\uE05C', new Color(0.098, 0.098, 0.439, 1)], // MintCream
        ['\uE05D', new Color(1, 0.894, 0.882, 1)], // MistyRose
        ['\uE05E', new Color(1, 0.894, 0.71, 1)], // Moccasin
        ['\uE05F', new Color(1, 0.871, 0.678, 1)], // NavajoWhite
        ['\uE060', new Color(0.0, 0.0, 0.502, 1)], // Navy
        ['\uE061', new Color(0.992, 0.961, 0.902, 1)], // OldLace
        ['\uE062', new Color(0.502, 0.502, 0.0, 1)], // Olive
        ['\uE063', new Color(0.42, 0.557, 0.137, 1)], // OliveDrab
        ['\uE064', new Color(1, 0.647, 0, 1)], // Orange
        ['\uE065', new Color(1, 0.271, 0, 1)], // OrangeRed
        ['\uE066', new Color(0.855, 0.439, 0.839, 1)], // Orchid
        ['\uE067', new Color(0.933, 0.91, 0.667, 1)], // PaleGoldenRod
        ['\uE068', new Color(0.596, 0.984, 0.596, 1)], // PaleGreen
        ['\uE069', new Color(0.686, 0.933, 0.933, 1)], // PaleTurquoise
        ['\uE06A', new Color(0.859, 0.439, 0.576, 1)], // PaleVioletRed
        ['\uE06B', new Color(1, 0.937, 0.835, 1)], // PapayaWhip
        ['\uE06C', new Color(1, 0.855, 0.725, 1)], // PeachPuff
        ['\uE06D', new Color(0.804, 0.522, 0.247, 1)], // Peru
        ['\uE06E', new Color(1, 0.753, 0.796, 1)], // Pink
        ['\uE06F', new Color(0.867, 0.627, 0.867, 1)], // Plum
        ['\uE070', new Color(0.69, 0.878, 0.902, 1)], // PowderBlue
        ['\uE071', new Color(0.502, 0.0, 0.502, 1)], // Purple
        ['\uE072', new Color(0.4, 0.2, 0.6, 1)], // RebeccaPurple
        ['\uE073', new Color(1, 0.0, 0.0, 1)], // Red
        ['\uE074', new Color(0.737, 0.561, 0.561, 1)], // RosyBrown
        ['\uE075', new Color(0.255, 0.412, 0.882, 1)], // RoyalBlue
        ['\uE076', new Color(0.545, 0.271, 0.075, 1)], // SaddleBrown
        ['\uE077', new Color(0.98, 0.502, 0.447, 1)], // Salmon
        ['\uE078', new Color(0.957, 0.643, 0.376, 1)], // SandyBrown
        ['\uE079', new Color(0.235, 0.702, 0.443, 1)], // SeaGreen
        ['\uE07A', new Color(1, 0.961, 0.933, 1)], // SeaShell
        ['\uE07B', new Color(0.627, 0.322, 0.176, 1)], // Sienna
        ['\uE07C', new Color(0.753, 0.753, 0.753, 1)], // Silver
        ['\uE07D', new Color(0.529, 0.808, 0.922, 1)], // SkyBlue
        ['\uE07E', new Color(0.416, 0.353, 0.804, 1)], // SlateBlue
        ['\uE07F', new Color(0.439, 0.502, 0.565, 1)], // SlateGray
        ['\uE080', new Color(1, 0.98, 0.98, 1)], // Snow
        ['\uE081', new Color(0, 1, 0.498, 1)], // SpringGreen
        ['\uE082', new Color(0.275, 0.51, 0.706, 1)], // SteelBlue
        ['\uE083', new Color(0.824, 0.706, 0.549, 1)], // Tan
        ['\uE084', new Color(0, 0.502, 0.502, 1)], // Teal
        ['\uE085', new Color(0.847, 0.749, 0.847, 1)], // Thistle
        ['\uE086', new Color(1, 0.388, 0.278, 1)], // Tomato
        ['\uE087', new Color(0.251, 0.878, 0.816, 1)], // Turquoise
        ['\uE088', new Color(0.933, 0.51, 0.933, 1)], // Violet
        ['\uE089', new Color(0.961, 0.871, 0.702, 1)], // Wheat
        ['\uE08A', new Color(1, 1, 1, 1)], // White
        ['\uE08B', new Color(0.961, 0.961, 0.961, 1)], // WhiteSmoke
        ['\uE08C', new Color(1, 1, 0.0, 1)], // Yellow
        ['\uE08D', new Color(0.604, 0.804, 0.196, 1)], // YellowGreen
    ]);

    // Optimization 2: Pre-calculate split points to avoid repeated indexOf calls
    function getSplitPoints(text, splitChars) {
        const splitPoints = [];
        for (let i = 0; i < text.length; i++) {
            if (splitChars.has(text[i])) {
                splitPoints.push(i);
            }
        }
        return splitPoints;
    }
    */

    // eslint-disable-next-line prefer-const
    for (let feature of args.bucket.features) {
        /*
        if (feature.text && feature.text.sections) {
            const updatedSections = [];
    
            for (const originalSection of feature.text.sections) {
                const text = originalSection.text;
                const splitPoints = getSplitPoints(text, splitChars);
    
                if (splitPoints.length > 0) {
                    let lastSplitIndex = 0;
    
                    for (let i = 0; i < splitPoints.length; i++) {
                        const splitPoint = splitPoints[i];
                        //const char = text[splitPoint];
    
                        updatedSections.push({
                            ...originalSection,
                            text: text.substring(lastSplitIndex, splitPoint + 1),
                            textColor: i === 0 ? originalSection.textColor : splitChars.get(text[splitPoints[i - 1]])
                        });
    
                        lastSplitIndex = splitPoint + 1;
                    }
    
                    // Add the last section
                    if (lastSplitIndex < text.length) {
                        updatedSections.push({
                            ...originalSection,
                            text: text.substring(lastSplitIndex),
                            textColor: splitChars.get(text[splitPoints[splitPoints.length - 1]])
                        });
                    }
                } else {
                    // No split points found, keep the original section
                    updatedSections.push(originalSection);
                }
            }
    
            // Replace all original sections with the updated sections
            feature.text.sections = updatedSections;
        } else {
            //console.error("Sections property is missing or not accessible.");
        }
        */
    
        const fontstack = layout.get('text-font').evaluate(feature, {}, args.canonical).join(',');
        const layoutTextSizeThisZoom = textSize.evaluate(feature, {}, args.canonical);
        const layoutTextSize = sizes.layoutTextSize.evaluate(feature, {}, args.canonical);
        const layoutIconSize = sizes.layoutIconSize.evaluate(feature, {}, args.canonical);

        const shapedTextOrientations: ShapedTextOrientations = {
            horizontal: {} as Record<TextJustify, Shaping>,
            vertical: undefined
        };
        const text = feature.text;
        
        let textOffset: [number, number] = [0, 0];
        if (text) {
            const unformattedText = text.toString();
            //console.log(feature);
            //console.log(text);
            //console.log(unformattedText);
            const spacing = layout.get('text-letter-spacing').evaluate(feature, {}, args.canonical) * ONE_EM;
            const spacingIfAllowed = allowsLetterSpacing(unformattedText) ? spacing : 0;

            const textAnchor = layout.get('text-anchor').evaluate(feature, {}, args.canonical);
            const variableAnchorOffset = getTextVariableAnchorOffset(layer, feature, args.canonical);

            if (!variableAnchorOffset) {
                const radialOffset = layout.get('text-radial-offset').evaluate(feature, {}, args.canonical);
                // Layers with variable anchors use the `text-radial-offset` property and the [x, y] offset vector
                // is calculated at placement time instead of layout time
                if (radialOffset) {
                    // The style spec says don't use `text-offset` and `text-radial-offset` together
                    // but doesn't actually specify what happens if you use both. We go with the radial offset.
                    textOffset = evaluateVariableOffset(textAnchor, [radialOffset * ONE_EM, INVALID_TEXT_OFFSET]);
                } else {
                    textOffset = (layout.get('text-offset').evaluate(feature, {}, args.canonical).map(t => t * ONE_EM) as [number, number]);
                }
            }

            let textJustify = textAlongLine ?
                'center' :
                layout.get('text-justify').evaluate(feature, {}, args.canonical);

            const symbolPlacement = layout.get('symbol-placement');
            const maxWidth = symbolPlacement === 'point' ?
                layout.get('text-max-width').evaluate(feature, {}, args.canonical) * ONE_EM :
                Infinity;

            const addVerticalShapingForPointLabelIfNeeded = () => {
                if (args.bucket.allowVerticalPlacement && allowsVerticalWritingMode(unformattedText)) {
                    // Vertical POI label placement is meant to be used for scripts that support vertical
                    // writing mode, thus, default left justification is used. If Latin
                    // scripts would need to be supported, this should take into account other justifications.
                    shapedTextOrientations.vertical = shapeText(text, args.glyphMap, args.glyphPositions, args.imagePositions, fontstack, maxWidth, lineHeight, textAnchor,
                        'left', spacingIfAllowed, textOffset, WritingMode.vertical, true, layoutTextSize, layoutTextSizeThisZoom);
                }
            };

            // If this layer uses text-variable-anchor, generate shapings for all justification possibilities.
            if (!textAlongLine && variableAnchorOffset) {
                const justifications = new Set<TextJustify>();

                if (textJustify === 'auto') {
                    for (let i = 0; i < variableAnchorOffset.values.length; i += 2) {
                        justifications.add(getAnchorJustification(variableAnchorOffset.values[i] as TextAnchor));
                    }
                } else {
                    justifications.add(textJustify);
                }

                let singleLine = false;
                for (const justification of justifications) {
                    if (shapedTextOrientations.horizontal[justification]) continue;
                    if (singleLine) {
                        // If the shaping for the first justification was only a single line, we
                        // can re-use it for the other justifications
                        shapedTextOrientations.horizontal[justification] = shapedTextOrientations.horizontal[0];
                    } else {
                        // If using text-variable-anchor for the layer, we use a center anchor for all shapings and apply
                        // the offsets for the anchor in the placement step.
                        const shaping = shapeText(text, args.glyphMap, args.glyphPositions, args.imagePositions, fontstack, maxWidth, lineHeight, 'center',
                            justification, spacingIfAllowed, textOffset, WritingMode.horizontal, false, layoutTextSize, layoutTextSizeThisZoom);
                        if (shaping) {
                            shapedTextOrientations.horizontal[justification] = shaping;
                            singleLine = shaping.positionedLines.length === 1;
                        }
                    }
                }

                addVerticalShapingForPointLabelIfNeeded();
            } else {
                if (textJustify === 'auto') {
                    textJustify = getAnchorJustification(textAnchor);
                }

                // Horizontal point or line label.
                const shaping = shapeText(text, args.glyphMap, args.glyphPositions, args.imagePositions, fontstack, maxWidth, lineHeight, textAnchor, textJustify, spacingIfAllowed,
                    textOffset, WritingMode.horizontal, false, layoutTextSize, layoutTextSizeThisZoom);
                if (shaping) shapedTextOrientations.horizontal[textJustify] = shaping;

                // Vertical point label (if allowVerticalPlacement is enabled).
                addVerticalShapingForPointLabelIfNeeded();

                // Verticalized line label.
                if (allowsVerticalWritingMode(unformattedText) && textAlongLine && keepUpright) {
                    shapedTextOrientations.vertical = shapeText(text, args.glyphMap, args.glyphPositions, args.imagePositions, fontstack, maxWidth, lineHeight, textAnchor, textJustify,
                        spacingIfAllowed, textOffset, WritingMode.vertical, false, layoutTextSize, layoutTextSizeThisZoom);
                }
            }
        }

        let shapedIcon;
        let isSDFIcon = false;
        if (feature.icon && feature.icon.name) {
            const image = args.imageMap[feature.icon.name];
            if (image) {
                shapedIcon = shapeIcon(
                    args.imagePositions[feature.icon.name],
                    layout.get('icon-offset').evaluate(feature, {}, args.canonical),
                    layout.get('icon-anchor').evaluate(feature, {}, args.canonical));
                // null/undefined SDF property treated same as default (false)
                isSDFIcon = !!image.sdf;
                if (args.bucket.sdfIcons === undefined) {
                    args.bucket.sdfIcons = isSDFIcon;
                } else if (args.bucket.sdfIcons !== isSDFIcon) {
                    warnOnce('Style sheet warning: Cannot mix SDF and non-SDF icons in one buffer');
                }
                if (image.pixelRatio !== args.bucket.pixelRatio) {
                    args.bucket.iconsNeedLinear = true;
                } else if (layout.get('icon-rotate').constantOr(1) !== 0) {
                    args.bucket.iconsNeedLinear = true;
                }
            }
        }

        const shapedText = getDefaultHorizontalShaping(shapedTextOrientations.horizontal) || shapedTextOrientations.vertical;
        args.bucket.iconsInText = shapedText ? shapedText.iconsInText : false;
        if (shapedText || shapedIcon) {
            addFeature(args.bucket, feature, shapedTextOrientations, shapedIcon, args.imageMap, sizes, layoutTextSize, layoutIconSize, textOffset, isSDFIcon, args.canonical, args.subdivisionGranularity);
        }
    }

    if (args.showCollisionBoxes) {
        args.bucket.generateCollisionDebugBuffers();
    }
}

// Choose the justification that matches the direction of the TextAnchor
export function getAnchorJustification(anchor: TextAnchor): TextJustify {
    switch (anchor) {
        case 'right':
        case 'top-right':
        case 'bottom-right':
            return 'right';
        case 'left':
        case 'top-left':
        case 'bottom-left':
            return 'left';
    }
    return 'center';
}

/**
 * Given a feature and its shaped text and icon data, add a 'symbol
 * instance' for each _possible_ placement of the symbol feature.
 * (At render timePlaceSymbols#place() selects which of these instances to
 * show or hide based on collisions with symbols in other layers.)
 */
function addFeature(bucket: SymbolBucket,
    feature: SymbolFeature,
    shapedTextOrientations: ShapedTextOrientations,
    shapedIcon: PositionedIcon,
    imageMap: {[_: string]: StyleImage},
    sizes: Sizes,
    layoutTextSize: number,
    layoutIconSize: number,
    textOffset: [number, number],
    isSDFIcon: boolean,
    canonical: CanonicalTileID,
    subdivisionGranularity: SubdivisionGranularitySetting) {
    // To reduce the number of labels that jump around when zooming we need
    // to use a text-size value that is the same for all zoom levels.
    // bucket calculates text-size at a high zoom level so that all tiles can
    // use the same value when calculating anchor positions.
    // ZERDA start
    const textMaxSize = layoutTextSize / 2;
    //let textMaxSize = sizes.textMaxSize.evaluate(feature, {});
    //if (textMaxSize === undefined) {
    //    textMaxSize = layoutTextSize;
    //}
    // ZERDA end
    const layout = bucket.layers[0].layout;
    const iconOffset = layout.get('icon-offset').evaluate(feature, {}, canonical);
    const defaultHorizontalShaping = getDefaultHorizontalShaping(shapedTextOrientations.horizontal);
    const glyphSize = 24,
        fontScale = layoutTextSize / glyphSize,
        textBoxScale = bucket.tilePixelRatio * fontScale,
        textMaxBoxScale = bucket.tilePixelRatio * textMaxSize / glyphSize,
        iconBoxScale = bucket.tilePixelRatio * layoutIconSize,
        symbolMinDistance = bucket.tilePixelRatio * layout.get('symbol-spacing'),
        textPadding = layout.get('text-padding') * bucket.tilePixelRatio,
        iconPadding = getIconPadding(layout, feature, canonical, bucket.tilePixelRatio),
        textMaxAngle = layout.get('text-max-angle') / 180 * Math.PI,
        textAlongLine = layout.get('text-rotation-alignment') !== 'viewport' && layout.get('symbol-placement') !== 'point',
        iconAlongLine = layout.get('icon-rotation-alignment') === 'map' && layout.get('symbol-placement') !== 'point',
        symbolPlacement = layout.get('symbol-placement'),
        textRepeatDistance = symbolMinDistance / 2;

    const iconTextFit = layout.get('icon-text-fit');
    let verticallyShapedIcon;
    // Adjust shaped icon size when icon-text-fit is used.
    if (shapedIcon && iconTextFit !== 'none') {
        if (bucket.allowVerticalPlacement && shapedTextOrientations.vertical) {
            verticallyShapedIcon = fitIconToText(shapedIcon, shapedTextOrientations.vertical, iconTextFit,
                layout.get('icon-text-fit-padding'), iconOffset, fontScale);
        }
        if (defaultHorizontalShaping) {
            shapedIcon = fitIconToText(shapedIcon, defaultHorizontalShaping, iconTextFit,
                layout.get('icon-text-fit-padding'), iconOffset, fontScale);
        }
    }

    const granularity = (canonical) ? subdivisionGranularity.line.getGranularityForZoomLevel(canonical.z) : 1;

    const addSymbolAtAnchor = (line, anchor) => {
        if (anchor.x < 0 || anchor.x >= EXTENT || anchor.y < 0 || anchor.y >= EXTENT) {
            // Symbol layers are drawn across tile boundaries, We filter out symbols
            // outside our tile boundaries (which may be included in vector tile buffers)
            // to prevent double-drawing symbols.
            return;
        }
        addSymbol(bucket, anchor, line, shapedTextOrientations, shapedIcon, imageMap, verticallyShapedIcon, bucket.layers[0],
            bucket.collisionBoxArray, feature.index, feature.sourceLayerIndex, bucket.index,
            textBoxScale, [textPadding, textPadding, textPadding, textPadding], textAlongLine, textOffset,
            iconBoxScale, iconPadding, iconAlongLine, iconOffset,
            feature, sizes, isSDFIcon, canonical, layoutTextSize);
    };

    if (symbolPlacement === 'line') {
        for (const line of clipLine(feature.geometry, 0, 0, EXTENT, EXTENT)) {
            const subdividedLine = subdivideVertexLine(line, granularity);
            const anchors = getAnchors(
                subdividedLine,
                symbolMinDistance,
                textMaxAngle,
                shapedTextOrientations.vertical || defaultHorizontalShaping,
                shapedIcon,
                glyphSize,
                textMaxBoxScale,
                bucket.overscaling,
                EXTENT
            );
            for (const anchor of anchors) {
                const shapedText = defaultHorizontalShaping;
                if (!shapedText || !anchorIsTooClose(bucket, shapedText.text, textRepeatDistance, anchor)) {
                    addSymbolAtAnchor(subdividedLine, anchor);
                }
            }
        }
    } else if (symbolPlacement === 'line-center') {
        //const textProjection = layout.get('text-projection');
        const textProjection = true;
        // No clipping, multiple lines per feature are allowed
        // "lines" with only one point are ignored as in clipLines
        for (const line of feature.geometry) {
            if (line.length > 1) {
                const subdividedLine = subdivideVertexLine(line, granularity);
                const anchor = getCenterAnchor(
                    subdividedLine,
                    textMaxAngle,
                    shapedTextOrientations.vertical || defaultHorizontalShaping,
                    shapedIcon,
                    glyphSize,
                    textMaxBoxScale,
                    textProjection,
                    canonical
                );
                if (anchor) {
                    addSymbolAtAnchor(subdividedLine, anchor);
                }
            }
        }
    } else if (feature.type === 'Polygon') {
        for (const polygon of classifyRings(feature.geometry, 0)) {
            // 16 here represents 2 pixels
            const poi = findPoleOfInaccessibility(polygon, 16);
            const subdividedLine = subdivideVertexLine(polygon[0], granularity, true);
            addSymbolAtAnchor(subdividedLine, new Anchor(poi.x, poi.y, 0));
        }
    } else if (feature.type === 'LineString') {
        // https://github.com/mapbox/mapbox-gl-js/issues/3808
        for (const line of feature.geometry) {
            const subdividedLine = subdivideVertexLine(line, granularity);
            addSymbolAtAnchor(subdividedLine, new Anchor(subdividedLine[0].x, subdividedLine[0].y, 0));
        }
    } else if (feature.type === 'Point') {
        for (const points of feature.geometry) {
            for (const point of points) {
                addSymbolAtAnchor([point], new Anchor(point.x, point.y, 0));
            }
        }
    }
}

function addTextVariableAnchorOffsets(textAnchorOffsets: TextAnchorOffsetArray, variableAnchorOffset: VariableAnchorOffsetCollection): [number, number] {
    const startIndex = textAnchorOffsets.length;
    const values = variableAnchorOffset?.values;

    if (values?.length > 0) {
        for (let i = 0; i < values.length; i += 2) {
            const anchor = TextAnchorEnum[values[i] as TextAnchor];
            const offset = values[i + 1] as [number, number];

            textAnchorOffsets.emplaceBack(anchor, offset[0], offset[1]);
        }
    }

    return [startIndex, textAnchorOffsets.length];
}

function addTextVertices(bucket: SymbolBucket,
    anchor: Point,
    shapedText: Shaping,
    imageMap: {[_: string]: StyleImage},
    layer: SymbolStyleLayer,
    textAlongLine: boolean,
    feature: SymbolFeature,
    textOffset: [number, number],
    lineArray: {
        lineStartIndex: number;
        lineLength: number;
    },
    writingMode: WritingMode,
    placementTypes: Array<'vertical' | 'center' | 'left' | 'right'>,
    placedTextSymbolIndices: {[_: string]: number},
    placedIconIndex: number,
    sizes: Sizes,
    canonical: CanonicalTileID) {
    const glyphQuads = getGlyphQuads(anchor, shapedText, textOffset,
        layer, textAlongLine, feature, imageMap, bucket.allowVerticalPlacement);

    const sizeData = bucket.textSizeData;
    let textSizeData = null;

    if (sizeData.kind === 'source') {
        textSizeData = [
            SIZE_PACK_FACTOR * layer.layout.get('text-size').evaluate(feature, {})
        ];
        if (textSizeData[0] > MAX_PACKED_SIZE) {
            warnOnce(`${bucket.layerIds[0]}: Value for "text-size" is >= ${MAX_GLYPH_ICON_SIZE}. Reduce your "text-size".`);
        }
    } else if (sizeData.kind === 'composite') {
        textSizeData = [
            SIZE_PACK_FACTOR * sizes.compositeTextSizes[0].evaluate(feature, {}, canonical),
            SIZE_PACK_FACTOR * sizes.compositeTextSizes[1].evaluate(feature, {}, canonical)
        ];
        if (textSizeData[0] > MAX_PACKED_SIZE || textSizeData[1] > MAX_PACKED_SIZE) {
            warnOnce(`${bucket.layerIds[0]}: Value for "text-size" is >= ${MAX_GLYPH_ICON_SIZE}. Reduce your "text-size".`);
        }
    }

    bucket.addSymbols(
        bucket.text,
        glyphQuads,
        textSizeData,
        textOffset,
        textAlongLine,
        feature,
        writingMode,
        anchor,
        lineArray.lineStartIndex,
        lineArray.lineLength,
        placedIconIndex,
        canonical);

    // The placedSymbolArray is used at render time in drawTileSymbols
    // These indices allow access to the array at collision detection time
    for (const placementType of placementTypes) {
        placedTextSymbolIndices[placementType] = bucket.text.placedSymbolArray.length - 1;
    }

    return glyphQuads.length * 4;
}

function getDefaultHorizontalShaping(
    horizontalShaping: Record<TextJustify, Shaping>
): Shaping | null {
    // We don't care which shaping we get because this is used for collision purposes
    // and all the justifications have the same collision box
    for (const justification in horizontalShaping) {
        return horizontalShaping[justification];
    }
    return null;
}

/**
 * Add a single label & icon placement.
 */
function addSymbol(bucket: SymbolBucket,
    anchor: Anchor,
    line: Array<Point>,
    shapedTextOrientations: ShapedTextOrientations,
    shapedIcon: PositionedIcon | void,
    imageMap: {[_: string]: StyleImage},
    verticallyShapedIcon: PositionedIcon | void,
    layer: SymbolStyleLayer,
    collisionBoxArray: CollisionBoxArray,
    featureIndex: number,
    sourceLayerIndex: number,
    bucketIndex: number,
    textBoxScale: number,
    textPadding: SymbolPadding,
    textAlongLine: boolean,
    textOffset: [number, number],
    iconBoxScale: number,
    iconPadding: SymbolPadding,
    iconAlongLine: boolean,
    iconOffset: [number, number],
    feature: SymbolFeature,
    sizes: Sizes,
    isSDFIcon: boolean,
    canonical: CanonicalTileID,
    layoutTextSize: number) {

    const lineArray = bucket.addToLineVertexArray(anchor, line);
    let textCollisionFeature, iconCollisionFeature, verticalTextCollisionFeature, verticalIconCollisionFeature;

    let numIconVertices = 0;
    let numVerticalIconVertices = 0;
    let numHorizontalGlyphVertices = 0;
    let numVerticalGlyphVertices = 0;
    let placedIconSymbolIndex = -1;
    let verticalPlacedIconSymbolIndex = -1;
    const placedTextSymbolIndices: {[k: string]: number} = {};
    let key = murmur3('');

    if (bucket.allowVerticalPlacement && shapedTextOrientations.vertical) {
        const textRotation = layer.layout.get('text-rotate').evaluate(feature, {}, canonical);
        const verticalTextRotation = textRotation + 90.0;
        const verticalShaping = shapedTextOrientations.vertical;
        verticalTextCollisionFeature = new CollisionFeature(collisionBoxArray, anchor, featureIndex, sourceLayerIndex, bucketIndex, verticalShaping, textBoxScale, textPadding, textAlongLine, verticalTextRotation);

        if (verticallyShapedIcon) {
            verticalIconCollisionFeature = new CollisionFeature(collisionBoxArray, anchor, featureIndex, sourceLayerIndex, bucketIndex, verticallyShapedIcon, iconBoxScale, iconPadding, textAlongLine, verticalTextRotation);
        }
    }

    //Place icon first, so text can have a reference to its index in the placed symbol array.
    //Text symbols can lazily shift at render-time because of variable anchor placement.
    //If the style specifies an `icon-text-fit` then the icon would have to shift along with it.
    // For more info check `updateVariableAnchors` in `draw_symbol.js` .
    if (shapedIcon) {
        const iconRotate = layer.layout.get('icon-rotate').evaluate(feature, {});
        const hasIconTextFit = layer.layout.get('icon-text-fit') !== 'none';
        const iconQuads = getIconQuads(shapedIcon, iconRotate, isSDFIcon, hasIconTextFit);
        const verticalIconQuads = verticallyShapedIcon ? getIconQuads(verticallyShapedIcon, iconRotate, isSDFIcon, hasIconTextFit) : undefined;
        iconCollisionFeature = new CollisionFeature(collisionBoxArray, anchor, featureIndex, sourceLayerIndex, bucketIndex, shapedIcon, iconBoxScale, iconPadding, /*align boxes to line*/false, iconRotate);

        numIconVertices = iconQuads.length * 4;

        const sizeData = bucket.iconSizeData;
        let iconSizeData = null;

        if (sizeData.kind === 'source') {
            iconSizeData = [
                SIZE_PACK_FACTOR * layer.layout.get('icon-size').evaluate(feature, {})
            ];
            if (iconSizeData[0] > MAX_PACKED_SIZE) {
                warnOnce(`${bucket.layerIds[0]}: Value for "icon-size" is >= ${MAX_GLYPH_ICON_SIZE}. Reduce your "icon-size".`);
            }
        } else if (sizeData.kind === 'composite') {
            iconSizeData = [
                SIZE_PACK_FACTOR * sizes.compositeIconSizes[0].evaluate(feature, {}, canonical),
                SIZE_PACK_FACTOR * sizes.compositeIconSizes[1].evaluate(feature, {}, canonical)
            ];
            if (iconSizeData[0] > MAX_PACKED_SIZE || iconSizeData[1] > MAX_PACKED_SIZE) {
                warnOnce(`${bucket.layerIds[0]}: Value for "icon-size" is >= ${MAX_GLYPH_ICON_SIZE}. Reduce your "icon-size".`);
            }
        }

        bucket.addSymbols(
            bucket.icon,
            iconQuads,
            iconSizeData,
            iconOffset,
            iconAlongLine,
            feature,
            WritingMode.none,
            anchor,
            lineArray.lineStartIndex,
            lineArray.lineLength,
            // The icon itself does not have an associated symbol since the text isn't placed yet
            -1, canonical);

        placedIconSymbolIndex = bucket.icon.placedSymbolArray.length - 1;

        if (verticalIconQuads) {
            numVerticalIconVertices = verticalIconQuads.length * 4;

            bucket.addSymbols(
                bucket.icon,
                verticalIconQuads,
                iconSizeData,
                iconOffset,
                iconAlongLine,
                feature,
                WritingMode.vertical,
                anchor,
                lineArray.lineStartIndex,
                lineArray.lineLength,
                // The icon itself does not have an associated symbol since the text isn't placed yet
                -1, canonical);

            verticalPlacedIconSymbolIndex = bucket.icon.placedSymbolArray.length - 1;
        }
    }

    const justifications = Object.keys(shapedTextOrientations.horizontal) as TextJustify[];
    for (const justification of justifications) {
        const shaping = shapedTextOrientations.horizontal[justification];

        if (!textCollisionFeature) {
            key = murmur3(shaping.text);
            const textRotate = layer.layout.get('text-rotate').evaluate(feature, {}, canonical);
            // As a collision approximation, we can use either the vertical or any of the horizontal versions of the feature
            // We're counting on all versions having similar dimensions
            textCollisionFeature = new CollisionFeature(collisionBoxArray, anchor, featureIndex, sourceLayerIndex, bucketIndex, shaping, textBoxScale, textPadding, textAlongLine, textRotate);
        }

        const singleLine = shaping.positionedLines.length === 1;
        numHorizontalGlyphVertices += addTextVertices(
            bucket, anchor, shaping, imageMap, layer, textAlongLine, feature, textOffset, lineArray,
            shapedTextOrientations.vertical ? WritingMode.horizontal : WritingMode.horizontalOnly,
            singleLine ? justifications : [justification],
            placedTextSymbolIndices, placedIconSymbolIndex, sizes, canonical);

        if (singleLine) {
            break;
        }
    }

    if (shapedTextOrientations.vertical) {
        numVerticalGlyphVertices += addTextVertices(
            bucket, anchor, shapedTextOrientations.vertical, imageMap, layer, textAlongLine, feature,
            textOffset, lineArray, WritingMode.vertical, ['vertical'], placedTextSymbolIndices, verticalPlacedIconSymbolIndex, sizes, canonical);
    }

    const textBoxStartIndex = textCollisionFeature ? textCollisionFeature.boxStartIndex : bucket.collisionBoxArray.length;
    const textBoxEndIndex = textCollisionFeature ? textCollisionFeature.boxEndIndex : bucket.collisionBoxArray.length;

    const verticalTextBoxStartIndex = verticalTextCollisionFeature ? verticalTextCollisionFeature.boxStartIndex : bucket.collisionBoxArray.length;
    const verticalTextBoxEndIndex = verticalTextCollisionFeature ? verticalTextCollisionFeature.boxEndIndex : bucket.collisionBoxArray.length;

    const iconBoxStartIndex = iconCollisionFeature ? iconCollisionFeature.boxStartIndex : bucket.collisionBoxArray.length;
    const iconBoxEndIndex = iconCollisionFeature ? iconCollisionFeature.boxEndIndex : bucket.collisionBoxArray.length;

    const verticalIconBoxStartIndex = verticalIconCollisionFeature ? verticalIconCollisionFeature.boxStartIndex : bucket.collisionBoxArray.length;
    const verticalIconBoxEndIndex = verticalIconCollisionFeature ? verticalIconCollisionFeature.boxEndIndex : bucket.collisionBoxArray.length;

    // Check if runtime collision circles should be used for any of the collision features.
    // It is enough to choose the tallest feature shape as circles are always placed on a line.
    // All measurements are in glyph metrics and later converted into pixels using proper font size "layoutTextSize"
    let collisionCircleDiameter = -1;

    const getCollisionCircleHeight = (feature: CollisionFeature, prevHeight: number): number => {
        if (feature && feature.circleDiameter)
            return Math.max(feature.circleDiameter, prevHeight);
        return prevHeight;
    };

    collisionCircleDiameter = getCollisionCircleHeight(textCollisionFeature, collisionCircleDiameter);
    collisionCircleDiameter = getCollisionCircleHeight(verticalTextCollisionFeature, collisionCircleDiameter);
    collisionCircleDiameter = getCollisionCircleHeight(iconCollisionFeature, collisionCircleDiameter);
    collisionCircleDiameter = getCollisionCircleHeight(verticalIconCollisionFeature, collisionCircleDiameter);
    const useRuntimeCollisionCircles = (collisionCircleDiameter > -1) ? 1 : 0;

    // Convert circle collision height into pixels
    if (useRuntimeCollisionCircles)
        collisionCircleDiameter *= layoutTextSize / ONE_EM;

    if (bucket.glyphOffsetArray.length >= SymbolBucket.MAX_GLYPHS) warnOnce(
        'Too many glyphs being rendered in a tile. See https://github.com/mapbox/mapbox-gl-js/issues/2907'
    );

    if (feature.sortKey !== undefined) {
        bucket.addToSortKeyRanges(bucket.symbolInstances.length, feature.sortKey as number);
    }

    const variableAnchorOffset = getTextVariableAnchorOffset(layer, feature, canonical);
    const [textAnchorOffsetStartIndex, textAnchorOffsetEndIndex] = addTextVariableAnchorOffsets(bucket.textAnchorOffsets, variableAnchorOffset);

    bucket.symbolInstances.emplaceBack(
        anchor.x,
        anchor.y,
        placedTextSymbolIndices.right >= 0 ? placedTextSymbolIndices.right : -1,
        placedTextSymbolIndices.center >= 0 ? placedTextSymbolIndices.center : -1,
        placedTextSymbolIndices.left >= 0 ? placedTextSymbolIndices.left : -1,
        placedTextSymbolIndices.vertical || -1,
        placedIconSymbolIndex,
        verticalPlacedIconSymbolIndex,
        key,
        textBoxStartIndex,
        textBoxEndIndex,
        verticalTextBoxStartIndex,
        verticalTextBoxEndIndex,
        iconBoxStartIndex,
        iconBoxEndIndex,
        verticalIconBoxStartIndex,
        verticalIconBoxEndIndex,
        featureIndex,
        numHorizontalGlyphVertices,
        numVerticalGlyphVertices,
        numIconVertices,
        numVerticalIconVertices,
        useRuntimeCollisionCircles,
        0,
        textBoxScale,
        collisionCircleDiameter,
        textAnchorOffsetStartIndex,
        textAnchorOffsetEndIndex);
}

function anchorIsTooClose(bucket: SymbolBucket, text: string, repeatDistance: number, anchor: Point) {
    const compareText = bucket.compareText;
    if (!(text in compareText)) {
        compareText[text] = [];
    } else {
        const otherAnchors = compareText[text];
        for (let k = otherAnchors.length - 1; k >= 0; k--) {
            if (anchor.dist(otherAnchors[k]) < repeatDistance) {
                // If it's within repeatDistance of one anchor, stop looking
                return true;
            }
        }
    }
    // If anchor is not within repeatDistance of any other anchor, add to array
    compareText[text].push(anchor);
    return false;
}
