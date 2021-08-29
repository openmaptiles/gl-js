import type {Cancelable} from '../types/cancelable';

const now = performance && performance.now ?
    performance.now.bind(performance) :
    Date.now.bind(Date);

let linkEl;

let reducedMotionQuery: MediaQueryList;

/**
 * @private
 */
const exported = {
    /**
     * Provides a function that outputs milliseconds: either performance.now()
     * or a fallback to Date.now()
     */
    now,

    frame(fn: (paintStartTimestamp: number) => void): Cancelable {
        const frame = requestAnimationFrame(fn);
        return {cancel: () => cancelAnimationFrame(frame)};
    },

    getImageData(img: CanvasImageSource, padding: number = 0): ImageData {
        const canvas = window.document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error('failed to create canvas 2d context');
        }
        canvas.width = img.width as number;
        canvas.height = img.height as number;
        context.drawImage(img, 0, 0, img.width as number, img.height as number);
        return context.getImageData(-padding, -padding, img.width as number + 2 * padding, img.height as number + 2 * padding);
    },

    resolveURL(path: string) {
        if (!linkEl) linkEl = document.createElement('a');
        linkEl.href = path;
        return linkEl.href;
    },

    hardwareConcurrency: navigator && navigator.hardwareConcurrency || 4,

    get devicePixelRatio() { return devicePixelRatio; },
    get prefersReducedMotion(): boolean {
        if (!matchMedia) return false;
        //Lazily initialize media query
        if (reducedMotionQuery == null) {
            reducedMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');
        }
        return reducedMotionQuery.matches;
    },
};

export default exported;
