import {throttle} from '../util/throttle';
import {LngLat} from '../geo/lng_lat';

import type {Map} from './map';

/**
 * Adds the map's position to its page's location hash.
 * Passed as an option to the map object.
 *
 * @group Markers and Controls
 */
export class Hash {
    _map: Map;
    _hashName: string;

    constructor(hashName?: string | null) {
        this._hashName = hashName && encodeURIComponent(hashName);
    }

    /**
     * Map element to listen for coordinate changes
     *
     * @param map - The map object
     */
    addTo(map: Map) {
        this._map = map;
        addEventListener('hashchange', this._onHashChange, false);
        this._map.on('moveend', this._updateHash);
        return this;
    }

    /**
     * Removes hash
     */
    remove() {
        removeEventListener('hashchange', this._onHashChange, false);
        this._map.off('moveend', this._updateHash);
        clearTimeout(this._updateHash());
        this._removeHash();

        delete this._map;
        return this;
    }

    getHashString(mapFeedback?: boolean) {
        const center = this._map.getCenter(),
            zoom = Math.round(this._map.getZoom() * 100) / 100,
            // derived from equation: 512px * 2^z / 360 / 10^d < 0.5px
            precision = Math.ceil((zoom * Math.LN2 + Math.log(512 / 360 / 0.5)) / Math.LN10),
            m = Math.pow(10, precision),
            lng = Math.round(center.lng * m) / m,
            lat = Math.round(center.lat * m) / m,
            bearing = this._map.getBearing(),
            pitch = this._map.getPitch();
        let hash = '';
        if (mapFeedback) {
            // new map feedback site has some constraints that don't allow
            // us to use the same hash format as we do for the Map hash option.
            hash += `/${lng}/${lat}/${zoom}`;
        } else {
            hash += `${zoom}/${lat}/${lng}`;
        }

        if (bearing || pitch) hash += (`/${Math.round(bearing * 10) / 10}`);
        if (pitch) hash += (`/${Math.round(pitch)}`);

        if (this._hashName) {
            const hashName = this._hashName;
            let found = false;
            const parts = window.location.hash.slice(1).split('&').map(part => {
                const key = part.split('=')[0];
                if (key === hashName) {
                    found = true;
                    return `${key}=${hash}`;
                }
                return part;
            }).filter(a => a);
            if (!found) {
                parts.push(`${hashName}=${hash}`);
            }
            return `#${parts.join('&')}`;
        }

        return `#${hash}`;
    }

    _getCurrentHash = () => {
        // Get the current hash from location, stripped from its number sign
        const hash = window.location.hash.replace('#', '');
        if (this._hashName) {
            // Split the parameter-styled hash into parts and find the value we need
            let keyval;
            hash.split('&').map(
                part => part.split('=')
            ).forEach(part => {
                if (part[0] === this._hashName) {
                    keyval = part;
                }
            });
            return (keyval ? keyval[1] || '' : '').split('/');
        }
        return hash.split('/');
    };

    _onHashChange = () => {
        const hash = this._getCurrentHash();

        if (!this._isValidHash(hash)) {
            return false;
        }

        const bearing = this._map.dragRotate.isEnabled() && this._map.touchZoomRotate.isEnabled() ? +(hash[3] || 0) : this._map.getBearing();
        this._map.jumpTo({
            center: [+hash[2], +hash[1]],
            zoom: +hash[0],
            bearing,
            pitch: +(hash[4] || 0)
        });

        return true;
    };

    _updateHashUnthrottled = () => {
        // Replace if already present, else append the updated hash string
        const location = window.location.href.replace(/(#.*)?$/, this.getHashString());
        window.history.replaceState(window.history.state, null, location);
    };

    _removeHash = () => {
        const currentHash = this._getCurrentHash();
        if (currentHash.length === 0) {
            return;
        }
        const baseHash = currentHash.join('/');
        let targetHash = baseHash;
        if (targetHash.split('&').length > 0) {
            targetHash = targetHash.split('&')[0]; // #3/1/2&foo=bar -> #3/1/2
        }
        if (this._hashName) {
            targetHash = `${this._hashName}=${baseHash}`;
        }
        let replaceString = window.location.hash.replace(targetHash, '');
        if (replaceString.startsWith('#&')) {
            replaceString = replaceString.slice(0, 1) + replaceString.slice(2);
        } else if (replaceString === '#') {
            replaceString = '';
        }
        let location = window.location.href.replace(/(#.+)?$/, replaceString);
        location = location.replace('&&', '&');
        window.history.replaceState(window.history.state, null, location);
    };

    /**
     * Mobile Safari doesn't allow updating the hash more than 100 times per 30 seconds.
     */
    _updateHash: () => ReturnType<typeof setTimeout> = throttle(this._updateHashUnthrottled, 30 * 1000 / 100);

    _isValidHash(hash: number[]) {
        if (hash.length < 3 || hash.some(isNaN)) {
            return false;
        }

        // LngLat() throws error if latitude is out of range, and it's valid if it succeeds.
        try {
            new LngLat(+hash[2], +hash[1]);
        } catch {
            return false;
        }

        const zoom = +hash[0];
        const bearing = +(hash[3] || 0);
        const pitch = +(hash[4] || 0);

        return zoom >= this._map.getMinZoom() && zoom <= this._map.getMaxZoom() &&
            bearing >= -180 && bearing <= 180 &&
            pitch >= this._map.getMinPitch() && pitch <= this._map.getMaxPitch();
    };
}
