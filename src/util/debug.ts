import {extend} from './util';

/**
 * This is a private namespace for utility functions that will get automatically stripped
 * out in production builds.
 *
 * @private
 */
export const Debug = {
    extend(dest: any, ...sources: Array<any>): any {
        return extend(dest, ...sources);
    },

    run(fn: () => any) {
        fn();
    },

    logToElement(message: string, overwrite: boolean = false, id: string = "log") {
        const el = window.document.getElementById(id);
        if (el) {
            if (overwrite) el.innerHTML = '';
            el.innerHTML += `<br>${message}`;
        }

    }
};
