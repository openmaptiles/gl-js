import {FeatureIndex} from '../data/feature_index';
import {performSymbolLayout} from '../symbol/symbol_layout';
import {CollisionBoxArray} from '../data/array_types.g';
import {DictionaryCoder} from '../util/dictionary_coder';
import {SymbolBucket} from '../data/bucket/symbol_bucket';
import {LineBucket} from '../data/bucket/line_bucket';
import {FillBucket} from '../data/bucket/fill_bucket';
import {FillExtrusionBucket} from '../data/bucket/fill_extrusion_bucket';
import {warnOnce, mapObject} from '../util/util';
import {ImageAtlas} from '../render/image_atlas';
import {GlyphAtlas} from '../render/glyph_atlas';
import {EvaluationParameters} from '../style/evaluation_parameters';
import {OverscaledTileID} from './tile_id';

import type {Bucket} from '../data/bucket';
import type {IActor} from '../util/actor';
import type {StyleLayer} from '../style/style_layer';
import type {StyleLayerIndex} from '../style/style_layer_index';
import type {
    WorkerTileParameters,
    WorkerTileResult,
} from '../source/worker_source';
import type {PromoteIdSpecification} from '@maplibre/maplibre-gl-style-spec';
import type {VectorTile} from '@mapbox/vector-tile';
import {MessageType, type GetGlyphsResponse, type GetImagesResponse} from '../util/actor_messages';
import type {SubdivisionGranularitySetting} from '../render/subdivision_granularity_settings';
import {PerformanceMarkers, PerformanceUtils} from '../util/performance';

export class WorkerTile {
    tileID: OverscaledTileID;
    uid: string | number;
    zoom: number;
    pixelRatio: number;
    tileSize: number;
    source: string;
    promoteId: PromoteIdSpecification;
    overscaling: number;
    showCollisionBoxes: boolean;
    collectResourceTiming: boolean;
    returnDependencies: boolean;

    status: 'parsing' | 'done';
    data: VectorTile;
    collisionBoxArray: CollisionBoxArray;

    abort: AbortController;
    vectorTile: VectorTile;
    inFlightDependencies: AbortController[];

    constructor(params: WorkerTileParameters) {
        this.tileID = new OverscaledTileID(params.tileID.overscaledZ, params.tileID.wrap, params.tileID.canonical.z, params.tileID.canonical.x, params.tileID.canonical.y);
        this.uid = params.uid;
        this.zoom = params.zoom;
        this.pixelRatio = params.pixelRatio;
        this.tileSize = params.tileSize;
        this.source = params.source;
        this.overscaling = this.tileID.overscaleFactor();
        this.showCollisionBoxes = params.showCollisionBoxes;
        this.collectResourceTiming = !!params.collectResourceTiming;
        this.returnDependencies = !!params.returnDependencies;
        this.promoteId = params.promoteId;
        this.inFlightDependencies = [];
    }

    async parse(data: VectorTile, layerIndex: StyleLayerIndex, availableImages: Array<string>, actor: IActor, subdivisionGranularity: SubdivisionGranularitySetting): Promise<WorkerTileResult> {
        this.status = 'parsing';
        this.data = data;

        this.collisionBoxArray = new CollisionBoxArray();
        const sourceLayerCoder = new DictionaryCoder(Object.keys(data.layers).sort());

        const featureIndex = new FeatureIndex(this.tileID, this.promoteId);
        featureIndex.bucketLayerIDs = [];

        const buckets: {[_: string]: Bucket} = {};

        const options = {
            featureIndex,
            iconDependencies: {},
            patternDependencies: {},
            glyphDependencies: {},
            availableImages,
            subdivisionGranularity
        };

        const layerFamilies = layerIndex.familiesBySource[this.source];
        for (const sourceLayerId in layerFamilies) {
            const sourceLayer = data.layers[sourceLayerId];
            if (!sourceLayer) {
                continue;
            }

            if (sourceLayer.version === 1) {
                warnOnce(`Vector tile source "${this.source}" layer "${sourceLayerId}" ` +
                    'does not use vector tile spec v2 and therefore may have some rendering errors.');
            }

            const sourceLayerIndex = sourceLayerCoder.encode(sourceLayerId);
            const features = [];
            for (let index = 0; index < sourceLayer.length; index++) {
                const feature = sourceLayer.feature(index);
                const id = featureIndex.getId(feature, sourceLayerId);
                features.push({feature, id, index, sourceLayerIndex});
            }

            for (const family of layerFamilies[sourceLayerId]) {
                const layer = family[0];

                if (layer.source !== this.source) {
                    warnOnce(`layer.source = ${layer.source} does not equal this.source = ${this.source}`);
                }
                if (layer.minzoom && this.zoom < Math.floor(layer.minzoom)) continue;
                if (layer.maxzoom && this.zoom >= layer.maxzoom) continue;
                if (layer.visibility === 'none') continue;

                recalculateLayers(family, this.zoom, availableImages);

                const bucket: Bucket = buckets[layer.id] = layer.createBucket({
                    index: featureIndex.bucketLayerIDs.length,
                    layers: family,
                    zoom: this.zoom,
                    pixelRatio: this.pixelRatio,
                    overscaling: this.overscaling,
                    collisionBoxArray: this.collisionBoxArray,
                    sourceLayerIndex,
                    sourceID: this.source
                });

                bucket.populate(features, options, this.tileID.canonical);
                featureIndex.bucketLayerIDs.push(family.map((l) => l.id));
            }
        }

        // options.glyphDependencies looks like: {"SomeFontName":{"10":true,"32":true}}
        // this line makes an object like: {"SomeFontName":[10,32]}
        const stacks: {[_: string]: Array<number>} = mapObject(options.glyphDependencies, (glyphs) => Object.keys(glyphs).map(Number));

        this.inFlightDependencies.forEach((request) => request?.abort());
        this.inFlightDependencies = [];

        let getGlyphsPromise = Promise.resolve<GetGlyphsResponse>({});
        if (Object.keys(stacks).length) {
            const abortController = new AbortController();
            this.inFlightDependencies.push(abortController);
            getGlyphsPromise = actor.sendAsync({type: MessageType.getGlyphs, data: {stacks, source: this.source, tileID: this.tileID, type: 'glyphs'}}, abortController);
        }

        const icons = Object.keys(options.iconDependencies);
        let getIconsPromise = Promise.resolve<GetImagesResponse>({});
        if (icons.length) {
            const abortController = new AbortController();
            this.inFlightDependencies.push(abortController);
            getIconsPromise = actor.sendAsync({type: MessageType.getImages, data: {icons, source: this.source, tileID: this.tileID, type: 'icons'}}, abortController);
        }

        const patterns = Object.keys(options.patternDependencies);
        let getPatternsPromise = Promise.resolve<GetImagesResponse>({});
        if (patterns.length) {
            const abortController = new AbortController();
            this.inFlightDependencies.push(abortController);
            getPatternsPromise = actor.sendAsync({type: MessageType.getImages, data: {icons: patterns, source: this.source, tileID: this.tileID, type: 'patterns'}}, abortController);
        }

        PerformanceUtils.mark(PerformanceMarkers.glyphsRequested);
        const [glyphMap, iconMap, patternMap] = await Promise.all([getGlyphsPromise, getIconsPromise, getPatternsPromise]);
        const glyphAtlas = new GlyphAtlas(glyphMap);
        const imageAtlas = new ImageAtlas(iconMap, patternMap);

        for (const key in buckets) {
            const bucket = buckets[key];
            if (bucket instanceof SymbolBucket) {
                recalculateLayers(bucket.layers, this.zoom, availableImages);
                performSymbolLayout({
                    bucket,
                    glyphMap,
                    glyphPositions: glyphAtlas.positions,
                    imageMap: iconMap,
                    imagePositions: imageAtlas.iconPositions,
                    showCollisionBoxes: this.showCollisionBoxes,
                    canonical: this.tileID.canonical,
                    subdivisionGranularity: options.subdivisionGranularity
                });
            } else if (bucket.hasPattern &&
                (bucket instanceof LineBucket ||
                bucket instanceof FillBucket ||
                bucket instanceof FillExtrusionBucket)) {
                recalculateLayers(bucket.layers, this.zoom, availableImages);
                bucket.addFeatures(options, this.tileID.canonical, imageAtlas.patternPositions);
            }
        }

        this.status = 'done';
        return {
            buckets: Object.values(buckets).filter(b => !b.isEmpty()),
            featureIndex,
            collisionBoxArray: this.collisionBoxArray,
            glyphAtlasImage: glyphAtlas.image,
            imageAtlas,
            // Only used for benchmarking:
            glyphMap: this.returnDependencies ? glyphMap : null,
            iconMap: this.returnDependencies ? iconMap : null,
            glyphPositions: this.returnDependencies ? glyphAtlas.positions : null
        };
    }
}

function recalculateLayers(layers: ReadonlyArray<StyleLayer>, zoom: number, availableImages: Array<string>) {
    // Layers are shared and may have been used by a WorkerTile with a different zoom.
    const parameters = new EvaluationParameters(zoom);
    for (const layer of layers) {
        layer.recalculate(parameters, availableImages);
    }
}
