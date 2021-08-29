import maplibregl from '../rollup/build/tsc/index'

export default function () {
    return new Worker(maplibregl.workerUrl);
}