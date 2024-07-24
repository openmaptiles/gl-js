import {ExpiryData, getArrayBuffer} from '../util/ajax';

import {VectorTile} from '@mapbox/vector-tile';
import Protobuf from 'pbf';
import {WorkerTile} from './worker_tile';
import {extend} from '../util/util';
import {RequestPerformance} from '../util/performance';

import type {
    WorkerSource,
    WorkerTileParameters,
    TileParameters,
    WorkerTileResult
} from '../source/worker_source';

import type {IActor} from '../util/actor';
import type {StyleLayerIndex} from '../style/style_layer_index';

export type LoadVectorTileResult = {
    vectorTile: VectorTile;
    rawData: ArrayBuffer;
    resourceTiming?: Array<PerformanceResourceTiming>;
} & ExpiryData;

type FetchingState = {
    rawTileData: ArrayBuffer;
    cacheControl: ExpiryData;
    resourceTiming: any;
}

export type AbortVectorData = () => void;
export type LoadVectorData = (params: WorkerTileParameters, abortController: AbortController) => Promise<LoadVectorTileResult | null>;

/**
 * The {@link WorkerSource} implementation that supports {@link VectorTileSource}.
 * This class is designed to be easily reused to support custom source types
 * for data formats that can be parsed/converted into an in-memory VectorTile
 * representation. To do so, override its `loadVectorTile` method.
 */
export class VectorTileWorkerSource implements WorkerSource {
    actor: IActor;
    layerIndex: StyleLayerIndex;
    availableImages: Array<string>;
    fetching: {[_: string]: FetchingState };
    loading: {[_: string]: WorkerTile};
    loaded: {[_: string]: WorkerTile};

    /**
     * @param loadVectorData - Optional method for custom loading of a VectorTile
     * object based on parameters passed from the main-thread Source. See
     * {@link VectorTileWorkerSource#loadTile}. The default implementation simply
     * loads the pbf at `params.url`.
     */
    constructor(actor: IActor, layerIndex: StyleLayerIndex, availableImages: Array<string>) {
        this.actor = actor;
        this.layerIndex = layerIndex;
        this.availableImages = availableImages;
        this.fetching = {};
        this.loading = {};
        this.loaded = {};
    }

    /**
     * Loads a vector tile
     */
    async loadVectorTile(params: WorkerTileParameters, abortController: AbortController): Promise<LoadVectorTileResult> {
        const response = await getArrayBuffer(params.request, abortController);
        try {
            const vectorTile = new VectorTile(new Protobuf(response.data));
            return {
                vectorTile,
                rawData: response.data,
                cacheControl: response.cacheControl,
                expires: response.expires
            };
        } catch (ex) {
            const bytes = new Uint8Array(response.data);
            const isGzipped = bytes[0] === 0x1f && bytes[1] === 0x8b;
            let errorMessage = `Unable to parse the tile at ${params.request.url}, `;
            if (isGzipped) {
                errorMessage += 'please make sure the data is not gzipped and that you have configured the relevant header in the server';
            } else {
                errorMessage += `got error: ${ex.message}`;
            }
            throw new Error(errorMessage);
        }
    }

    /**
     * Implements {@link WorkerSource#loadTile}. Delegates to
     * {@link VectorTileWorkerSource#loadVectorData} (which by default expects
     * a `params.url` property) for fetching and producing a VectorTile object.
     */
    async loadTile(params: WorkerTileParameters): Promise<WorkerTileResult | null> {
        const tileUid = params.uid;

        const perf = (params && params.request && params.request.collectResourceTiming) ?
            new RequestPerformance(params.request) : false;

        const workerTile = new WorkerTile(params);
        this.loading[tileUid] = workerTile;

        const abortController = new AbortController();
        workerTile.abort = abortController;
        try {
            const response = await this.loadVectorTile(params, abortController);
            delete this.loading[tileUid];
            if (!response) {
                return null;
            }

            const rawTileData = response.rawData;
            const cacheControl = {} as ExpiryData;
            if (response.expires) cacheControl.expires = response.expires;
            if (response.cacheControl) cacheControl.cacheControl = response.cacheControl;

            const resourceTiming = {} as {resourceTiming: any};
            if (perf) {
                const resourceTimingData = perf.finish();
                // it's necessary to eval the result of getEntriesByName() here via parse/stringify
                // late evaluation in the main thread causes TypeError: illegal invocation
                if (resourceTimingData)
                    resourceTiming.resourceTiming = JSON.parse(JSON.stringify(resourceTimingData));
            }

            workerTile.vectorTile = response.vectorTile;
            const parsePromise = workerTile.parse(response.vectorTile, this.layerIndex, this.availableImages, this.actor);
            this.loaded[tileUid] = workerTile;
            // keep the original fetching state so that reload tile can pick it up if the original parse is cancelled by reloads' parse
            this.fetching[tileUid] = {rawTileData, cacheControl, resourceTiming};

            try {
                const result = await parsePromise;
                // Transferring a copy of rawTileData because the worker needs to retain its copy.
                return extend({rawTileData: rawTileData.slice(0)}, result, cacheControl, resourceTiming);
            } finally {
                delete this.fetching[tileUid];
            }
        } catch (err) {
            delete this.loading[tileUid];
            workerTile.status = 'done';
            this.loaded[tileUid] = workerTile;
            throw err;
        }
    }

    /**
     * Implements {@link WorkerSource#reloadTile}.
     */
    async reloadTile(params: WorkerTileParameters): Promise<WorkerTileResult> {
        const uid = params.uid;
        if (!this.loaded || !this.loaded[uid]) {
            throw new Error('Should not be trying to reload a tile that was never loaded or has been removed');
        }
        const workerTile = this.loaded[uid];
        workerTile.showCollisionBoxes = params.showCollisionBoxes;
        if (workerTile.status === 'parsing') {
            const result = await workerTile.parse(workerTile.vectorTile, this.layerIndex, this.availableImages, this.actor);
            // if we have cancelled the original parse, make sure to pass the rawTileData from the original fetch
            let parseResult: WorkerTileResult;
            if (this.fetching[uid]) {
                const {rawTileData, cacheControl, resourceTiming} = this.fetching[uid];
                delete this.fetching[uid];
                parseResult = extend({rawTileData: rawTileData.slice(0)}, result, cacheControl, resourceTiming);
            } else {
                parseResult = result;
            }
            return parseResult;

        }
        // if there was no vector tile data on the initial load, don't try and re-parse tile
        if (workerTile.status === 'done' && workerTile.vectorTile) {
            // this seems like a missing case where cache control is lost? see #3309
            return workerTile.parse(workerTile.vectorTile, this.layerIndex, this.availableImages, this.actor);
        }
    }

    /**
     * Implements {@link WorkerSource#abortTile}.
     */
    async abortTile(params: TileParameters): Promise<void> {
        const loading = this.loading;
        const uid = params.uid;
        if (loading && loading[uid] && loading[uid].abort) {
            loading[uid].abort.abort();
            delete loading[uid];
        }
    }

    /**
     * Implements {@link WorkerSource#removeTile}.
     */
    async removeTile(params: TileParameters): Promise<void> {
        if (this.loaded && this.loaded[params.uid]) {
            delete this.loaded[params.uid];
        }
    }
}
