import DOM from '../../util/dom';

import {bindAll, warnOnce} from '../../util/util';

import type Map from '../map';
import type {IControl} from './control';

type Options = {
  container?: HTMLElement
};

/**
 * A `FullscreenControl` control contains a button for toggling the map in and out of fullscreen mode.
 *
 * @implements {IControl}
 * @param {Object} [options]
 * @param {HTMLElement} [options.container] `container` is the [compatible DOM element](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullScreen#Compatible_elements) which should be made full screen. By default, the map container element will be made full screen.
 *
 * @example
 * map.addControl(new maplibregl.FullscreenControl({container: document.querySelector('body')}));
 * @see [View a fullscreen map](https://maplibre.org/maplibre-gl-js-docs/example/fullscreen/)
 */

class FullscreenControl implements IControl {
    _map: Map;
    _controlContainer: HTMLElement;
    _fullscreen: boolean;
    _fullscreenchange: string;
    _fullscreenButton: HTMLButtonElement;
    _container: HTMLElement;

    constructor(options: Options) {
        this._fullscreen = false;
        if (options && options.container) {
            if (options.container instanceof HTMLElement) {
                this._container = options.container;
            } else {
                warnOnce('Full screen control \'container\' must be a DOM element.');
            }
        }
        bindAll([
            '_onClickFullscreen',
            '_changeIcon'
        ], this);
        if ('onfullscreenchange' in document) {
            this._fullscreenchange = 'fullscreenchange';
        } else if ('onmozfullscreenchange' in document) {
            this._fullscreenchange = 'mozfullscreenchange';
        } else if ('onwebkitfullscreenchange' in document) {
            this._fullscreenchange = 'webkitfullscreenchange';
        } else if ('onmsfullscreenchange' in document) {
            this._fullscreenchange = 'MSFullscreenChange';
        }
    }

    onAdd(map: Map) {
        this._map = map;
        if (!this._container) this._container = this._map.getContainer();
        this._controlContainer = DOM.create('div', `maplibregl-ctrl maplibregl-ctrl-group mapboxgl-ctrl mapboxgl-ctrl-group`);
        if (this._checkFullscreenSupport()) {
            this._setupUI();
        } else {
            this._controlContainer.style.display = 'none';
            warnOnce('This device does not support fullscreen mode.');
        }
        return this._controlContainer;
    }

    onRemove() {
        DOM.remove(this._controlContainer);
        this._map = (null as any);
        window.document.removeEventListener(this._fullscreenchange, this._changeIcon);
    }

    _checkFullscreenSupport() {
        return !!(
            document.fullscreenEnabled ||
            (document as any).mozFullScreenEnabled ||
            (document as any).msFullscreenEnabled ||
            (document as any).webkitFullscreenEnabled
        );
    }

    _setupUI() {
        const button = this._fullscreenButton = DOM.create('button', ((`maplibregl-ctrl-fullscreen mapboxgl-ctrl-fullscreen`)), this._controlContainer) as HTMLButtonElement;
        DOM.create('span', `maplibregl-ctrl-icon mapboxgl-ctrl-icon`, button).setAttribute('aria-hidden', 'true');
        button.type = 'button';
        this._updateTitle();
        this._fullscreenButton.addEventListener('click', this._onClickFullscreen);
        window.document.addEventListener(this._fullscreenchange, this._changeIcon);
    }

    _updateTitle() {
        const title = this._getTitle();
        this._fullscreenButton.setAttribute("aria-label", title);
        this._fullscreenButton.title = title;
    }

    _getTitle() {
        return this._map._getUIString(this._isFullscreen() ? 'FullscreenControl.Exit' : 'FullscreenControl.Enter');
    }

    _isFullscreen() {
        return this._fullscreen;
    }

    _changeIcon() {
        const fullscreenElement =
            window.document.fullscreenElement ||
            (window.document as any).mozFullScreenElement ||
            (window.document as any).webkitFullscreenElement ||
            (window.document as any).msFullscreenElement;

        if ((fullscreenElement === this._container) !== this._fullscreen) {
            this._fullscreen = !this._fullscreen;
            this._fullscreenButton.classList.toggle(`maplibregl-ctrl-shrink`);
            this._fullscreenButton.classList.toggle(`mapboxgl-ctrl-shrink`);
            this._fullscreenButton.classList.toggle(`maplibregl-ctrl-fullscreen`);
            this._fullscreenButton.classList.toggle(`mapboxgl-ctrl-fullscreen`);
            this._updateTitle();
        }
    }

    _onClickFullscreen() {
        if (this._isFullscreen()) {
            if (window.document.exitFullscreen) {
                (window.document as any).exitFullscreen();
            } else if ((window.document as any).mozCancelFullScreen) {
                (window.document as any).mozCancelFullScreen();
            } else if ((window.document as any).msExitFullscreen) {
                (window.document as any).msExitFullscreen();
            } else if ((window.document as any).webkitCancelFullScreen) {
                (window.document as any).webkitCancelFullScreen();
            }
        } else if (this._container.requestFullscreen) {
            this._container.requestFullscreen();
        } else if ((this._container as any).mozRequestFullScreen) {
            (this._container as any).mozRequestFullScreen();
        } else if ((this._container as any).msRequestFullscreen) {
            (this._container as any).msRequestFullscreen();
        } else if ((this._container as any).webkitRequestFullscreen) {
            (this._container as any).webkitRequestFullscreen();
        }
    }
}

export default FullscreenControl;
