let supportsOffscreenCanvas: boolean | undefined | null;

export default function offscreenCanvasSupported(): boolean {
    if (supportsOffscreenCanvas == null) {
        supportsOffscreenCanvas = OffscreenCanvas &&
            new OffscreenCanvas(1, 1).getContext('2d') &&
            typeof createImageBitmap === 'function';
    }

    return supportsOffscreenCanvas;
}
