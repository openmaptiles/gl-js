import {DOM} from '../util/dom';
import {browser} from '../util/browser';
import {LngLat} from '../geo/lng_lat';
import Point from '@mapbox/point-geometry';
import {smartWrap} from '../util/smart_wrap';
import {anchorTranslate, applyAnchorClass} from './anchor';
import type {PositionAnchor} from './anchor';
import {Event, Evented} from '../util/evented';
import type {Map} from './map';
import {type Popup, type Offset} from './popup';
import type {LngLatLike} from '../geo/lng_lat';
import type {MapMouseEvent, MapTouchEvent} from './events';
import type {PointLike} from './camera';

/**
 * Alignment options of rotation and pitch
 */
type Alignment = 'map' | 'viewport' | 'auto';

/**
 * The {@link Marker} options object
 */
type MarkerOptions = {
    /**
     * DOM element to use as a marker. The default is a light blue, droplet-shaped SVG marker.
     */
    element?: HTMLElement;
    /**
     * Space-separated CSS class names to add to marker element.
     */
    className?: string;
    /**
     * The offset in pixels as a {@link PointLike} object to apply relative to the element's center. Negatives indicate left and up.
     */
    offset?: PointLike;
    /**
     * A string indicating the part of the Marker that should be positioned closest to the coordinate set via {@link Marker#setLngLat}.
     * Options are `'center'`, `'top'`, `'bottom'`, `'left'`, `'right'`, `'top-left'`, `'top-right'`, `'bottom-left'`, and `'bottom-right'`.
     * @defaultValue 'center'
     * */
    anchor?: PositionAnchor;
    /**
     * The color to use for the default marker if options.element is not provided. The default is light blue.
     * @defaultValue '#3FB1CE'
     */
    color?: string;
    /**
     * The scale to use for the default marker if options.element is not provided. The default scale corresponds to a height of `41px` and a width of `27px`.
     * @defaultValue 1
     */
    scale?: number;
    /**
     * A boolean indicating whether or not a marker is able to be dragged to a new position on the map.
     * @defaultValue false
     */
    draggable?: boolean;
    /**
     * The max number of pixels a user can shift the mouse pointer during a click on the marker for it to be considered a valid click (as opposed to a marker drag). The default is to inherit map's clickTolerance.
     * @defaultValue 0
     */
    clickTolerance?: number;
    /**
     * The rotation angle of the marker in degrees, relative to its respective `rotationAlignment` setting. A positive value will rotate the marker clockwise.
     * @defaultValue 0
     */
    rotation?: number;
    /**
     * `map` aligns the `Marker`'s rotation relative to the map, maintaining a bearing as the map rotates. `viewport` aligns the `Marker`'s rotation relative to the viewport, agnostic to map rotations. `auto` is equivalent to `viewport`.
     * @defaultValue 'auto'
     */
    rotationAlignment?: Alignment;
    /**
     * `map` aligns the `Marker` to the plane of the map. `viewport` aligns the `Marker` to the plane of the viewport. `auto` automatically matches the value of `rotationAlignment`.
     * @defaultValue 'auto'
     */
    pitchAlignment?: Alignment;
    /**
     * Marker's opacity when it's in clear view (not behind 3d terrain)
     * @defaultValue 1
     */
    opacity?: string;
    /**
     * Marker's opacity when it's behind 3d terrain
     * @defaultValue 0.2
     */
    opacityWhenCovered?: string;
    /**
      * If `true`, rounding is disabled for placement of the marker, allowing for
      * subpixel positioning and smoother movement when the marker is translated.
      * @defaultValue false
      */
    subpixelPositioning?: boolean;
};

/**
 * Creates a marker component
 *
 * @group Markers and Controls
 *
 * @example
 * ```ts
 * let marker = new Marker()
 *   .setLngLat([30.5, 50.5])
 *   .addTo(map);
 * ```
 *
 * @example
 * Set options
 * ```ts
 * let marker = new Marker({
 *     color: "#FFFFFF",
 *     draggable: true
 *   }).setLngLat([30.5, 50.5])
 *   .addTo(map);
 * ```
 * @see [Add custom icons with Markers](https://maplibre.org/maplibre-gl-js/docs/examples/custom-marker-icons/)
 * @see [Create a draggable Marker](https://maplibre.org/maplibre-gl-js/docs/examples/drag-a-marker/)
 *
 * ## Events
 *
 * **Event** `dragstart` of type {@link Event} will be fired when dragging starts.
 *
 * **Event** `drag` of type {@link Event} will be fired while dragging.
 *
 * **Event** `dragend` of type {@link Event} will be fired when the marker is finished being dragged.
 */
export class Marker extends Evented {
    _map: Map;
    _anchor: PositionAnchor;
    _offset: Point;
    _element: HTMLElement;
    _popup: Popup;
    _lngLat: LngLat;
    _pos: Point;
    _flatPos: Point;
    _color: string;
    _scale: number;
    _defaultMarker: boolean;
    _draggable: boolean;
    _clickTolerance: number;
    _isDragging: boolean;
    _state: 'inactive' | 'pending' | 'active'; // used for handling drag events
    _positionDelta: Point;
    _pointerdownPos: Point;
    _rotation: number;
    _pitchAlignment: Alignment;
    _rotationAlignment: Alignment;
    _originalTabIndex: string; // original tabindex of _element
    _opacity: string;
    _opacityWhenCovered: string;
    _opacityTimeout: ReturnType<typeof setTimeout>;
    _subpixelPositioning: boolean;

    /**
     * @param options - the options
     */
    constructor(options?: MarkerOptions) {
        super();

        this._anchor = options && options.anchor || 'center';
        this._color = options && options.color || '#3FB1CE';
        this._scale = options && options.scale || 1;
        this._draggable = options && options.draggable || false;
        this._clickTolerance = options && options.clickTolerance || 0;
        this._subpixelPositioning = options && options.subpixelPositioning || false;
        this._isDragging = false;
        this._state = 'inactive';
        this._rotation = options && options.rotation || 0;
        this._rotationAlignment = options && options.rotationAlignment || 'auto';
        this._pitchAlignment = options && options.pitchAlignment && options.pitchAlignment !== 'auto' ?  options.pitchAlignment : this._rotationAlignment;
        this.setOpacity(options?.opacity, options?.opacityWhenCovered);

        if (!options || !options.element) {
            this._defaultMarker = true;
            this._element = DOM.create('div');

            // create default map marker SVG
            const svg = DOM.createNS('http://www.w3.org/2000/svg', 'svg');
            const defaultHeight = 41;
            const defaultWidth = 27;
            svg.setAttributeNS(null, 'display', 'block');
            svg.setAttributeNS(null, 'height', `${defaultHeight}px`);
            svg.setAttributeNS(null, 'width', `${defaultWidth}px`);
            svg.setAttributeNS(null, 'viewBox', `0 0 ${defaultWidth} ${defaultHeight}`);

            const markerLarge = DOM.createNS('http://www.w3.org/2000/svg', 'g');
            markerLarge.setAttributeNS(null, 'stroke', 'none');
            markerLarge.setAttributeNS(null, 'stroke-width', '1');
            markerLarge.setAttributeNS(null, 'fill', 'none');
            markerLarge.setAttributeNS(null, 'fill-rule', 'evenodd');

            const page1 = DOM.createNS('http://www.w3.org/2000/svg', 'g');
            page1.setAttributeNS(null, 'fill-rule', 'nonzero');

            const shadow = DOM.createNS('http://www.w3.org/2000/svg', 'g');
            shadow.setAttributeNS(null, 'transform', 'translate(3.0, 29.0)');
            shadow.setAttributeNS(null, 'fill', '#000000');

            const ellipses = [
                {'rx': '10.5', 'ry': '5.25002273'},
                {'rx': '10.5', 'ry': '5.25002273'},
                {'rx': '9.5', 'ry': '4.77275007'},
                {'rx': '8.5', 'ry': '4.29549936'},
                {'rx': '7.5', 'ry': '3.81822308'},
                {'rx': '6.5', 'ry': '3.34094679'},
                {'rx': '5.5', 'ry': '2.86367051'},
                {'rx': '4.5', 'ry': '2.38636864'}
            ];

            for (const data of ellipses) {
                const ellipse = DOM.createNS('http://www.w3.org/2000/svg', 'ellipse');
                ellipse.setAttributeNS(null, 'opacity', '0.04');
                ellipse.setAttributeNS(null, 'cx', '10.5');
                ellipse.setAttributeNS(null, 'cy', '5.80029008');
                ellipse.setAttributeNS(null, 'rx', data['rx']);
                ellipse.setAttributeNS(null, 'ry', data['ry']);
                shadow.appendChild(ellipse);
            }

            const background = DOM.createNS('http://www.w3.org/2000/svg', 'g');
            background.setAttributeNS(null, 'fill', this._color);

            const bgPath = DOM.createNS('http://www.w3.org/2000/svg', 'path');
            bgPath.setAttributeNS(null, 'd', 'M27,13.5 C27,19.074644 20.250001,27.000002 14.75,34.500002 C14.016665,35.500004 12.983335,35.500004 12.25,34.500002 C6.7499993,27.000002 0,19.222562 0,13.5 C0,6.0441559 6.0441559,0 13.5,0 C20.955844,0 27,6.0441559 27,13.5 Z');

            background.appendChild(bgPath);

            const border = DOM.createNS('http://www.w3.org/2000/svg', 'g');
            border.setAttributeNS(null, 'opacity', '0.25');
            border.setAttributeNS(null, 'fill', '#000000');

            const borderPath = DOM.createNS('http://www.w3.org/2000/svg', 'path');
            borderPath.setAttributeNS(null, 'd', 'M13.5,0 C6.0441559,0 0,6.0441559 0,13.5 C0,19.222562 6.7499993,27 12.25,34.5 C13,35.522727 14.016664,35.500004 14.75,34.5 C20.250001,27 27,19.074644 27,13.5 C27,6.0441559 20.955844,0 13.5,0 Z M13.5,1 C20.415404,1 26,6.584596 26,13.5 C26,15.898657 24.495584,19.181431 22.220703,22.738281 C19.945823,26.295132 16.705119,30.142167 13.943359,33.908203 C13.743445,34.180814 13.612715,34.322738 13.5,34.441406 C13.387285,34.322738 13.256555,34.180814 13.056641,33.908203 C10.284481,30.127985 7.4148684,26.314159 5.015625,22.773438 C2.6163816,19.232715 1,15.953538 1,13.5 C1,6.584596 6.584596,1 13.5,1 Z');

            border.appendChild(borderPath);

            const maki = DOM.createNS('http://www.w3.org/2000/svg', 'g');
            maki.setAttributeNS(null, 'transform', 'translate(6.0, 7.0)');
            maki.setAttributeNS(null, 'fill', '#FFFFFF');

            const circleContainer = DOM.createNS('http://www.w3.org/2000/svg', 'g');
            circleContainer.setAttributeNS(null, 'transform', 'translate(8.0, 8.0)');

            const circle1 = DOM.createNS('http://www.w3.org/2000/svg', 'circle');
            circle1.setAttributeNS(null, 'fill', '#000000');
            circle1.setAttributeNS(null, 'opacity', '0.25');
            circle1.setAttributeNS(null, 'cx', '5.5');
            circle1.setAttributeNS(null, 'cy', '5.5');
            circle1.setAttributeNS(null, 'r', '5.4999962');

            const circle2 = DOM.createNS('http://www.w3.org/2000/svg', 'circle');
            circle2.setAttributeNS(null, 'fill', '#FFFFFF');
            circle2.setAttributeNS(null, 'cx', '5.5');
            circle2.setAttributeNS(null, 'cy', '5.5');
            circle2.setAttributeNS(null, 'r', '5.4999962');

            circleContainer.appendChild(circle1);
            circleContainer.appendChild(circle2);

            page1.appendChild(shadow);
            page1.appendChild(background);
            page1.appendChild(border);
            page1.appendChild(maki);
            page1.appendChild(circleContainer);

            svg.appendChild(page1);

            svg.setAttributeNS(null, 'height', `${defaultHeight * this._scale}px`);
            svg.setAttributeNS(null, 'width', `${defaultWidth * this._scale}px`);

            this._element.appendChild(svg);

            // if no element and no offset option given apply an offset for the default marker
            // the -14 as the y value of the default marker offset was determined as follows
            //
            // the marker tip is at the center of the shadow ellipse from the default svg
            // the y value of the center of the shadow ellipse relative to the svg top left is "shadow transform translate-y (29.0) + ellipse cy (5.80029008)"
            // offset to the svg center "height (41 / 2)" gives (29.0 + 5.80029008) - (41 / 2) and rounded for an integer pixel offset gives 14
            // negative is used to move the marker up from the center so the tip is at the Marker lngLat
            this._offset = Point.convert(options && options.offset || [0, -14]);
        } else {
            this._element = options.element;
            this._offset = Point.convert(options && options.offset || [0, 0]);
        }

        this._element.classList.add('maplibregl-marker');
        this._element.addEventListener('dragstart', (e: DragEvent) => {
            e.preventDefault();
        });
        this._element.addEventListener('mousedown', (e: MouseEvent) => {
            // prevent focusing on click
            e.preventDefault();
        });
        applyAnchorClass(this._element, this._anchor, 'marker');

        if (options && options.className) {
            for (const name of options.className.split(' ')) {
                this._element.classList.add(name);
            }
        }

        this._popup = null;
    }

    /**
     * Attaches the `Marker` to a `Map` object.
     * @param map - The MapLibre GL JS map to add the marker to.
     * @example
     * ```ts
     * let marker = new Marker()
     *   .setLngLat([30.5, 50.5])
     *   .addTo(map); // add the marker to the map
     * ```
     */
    addTo(map: Map): this {
        this.remove();
        this._map = map;
        this._element.setAttribute('aria-label', map._getUIString('Marker.Title'));

        map.getCanvasContainer().appendChild(this._element);
        map.on('move', this._update);
        map.on('moveend', this._update);
        map.on('terrain', this._update);
        map.on('projectiontransition', this._update);

        this.setDraggable(this._draggable);
        this._update();

        // If we attached the `click` listener to the marker element, the popup
        // would close once the event propagated to `map` due to the
        // `Popup#_onClickClose` listener.
        this._map.on('click', this._onMapClick);

        return this;
    }

    /**
     * Removes the marker from a map
     * @example
     * ```ts
     * let marker = new Marker().addTo(map);
     * marker.remove();
     * ```
     */
    remove(): this {
        if (this._opacityTimeout) {
            clearTimeout(this._opacityTimeout);
            delete this._opacityTimeout;
        }
        if (this._map) {
            this._map.off('click', this._onMapClick);
            this._map.off('move', this._update);
            this._map.off('moveend', this._update);
            this._map.off('terrain', this._update);
            this._map.off('projectiontransition', this._update);
            this._map.off('mousedown', this._addDragHandler);
            this._map.off('touchstart', this._addDragHandler);
            this._map.off('mouseup', this._onUp);
            this._map.off('touchend', this._onUp);
            this._map.off('mousemove', this._onMove);
            this._map.off('touchmove', this._onMove);
            delete this._map;
        }
        DOM.remove(this._element);
        if (this._popup) this._popup.remove();
        return this;
    }

    /**
     * Get the marker's geographical location.
     *
     * The longitude of the result may differ by a multiple of 360 degrees from the longitude previously
     * set by `setLngLat` because `Marker` wraps the anchor longitude across copies of the world to keep
     * the marker on screen.
     *
     * @returns A {@link LngLat} describing the marker's location.
     * @example
     * ```ts
     * // Store the marker's longitude and latitude coordinates in a variable
     * let lngLat = marker.getLngLat();
     * // Print the marker's longitude and latitude values in the console
     * console.log('Longitude: ' + lngLat.lng + ', Latitude: ' + lngLat.lat )
     * ```
     * @see [Create a draggable Marker](https://maplibre.org/maplibre-gl-js/docs/examples/drag-a-marker/)
     */
    getLngLat(): LngLat {
        return this._lngLat;
    }

    /**
     * Set the marker's geographical position and move it.
     * @param lnglat - A {@link LngLat} describing where the marker should be located.
     * @example
     * Create a new marker, set the longitude and latitude, and add it to the map
     * ```ts
     * new Marker()
     *   .setLngLat([-65.017, -16.457])
     *   .addTo(map);
     * ```
     * @see [Add custom icons with Markers](https://maplibre.org/maplibre-gl-js/docs/examples/custom-marker-icons/)
     * @see [Create a draggable Marker](https://maplibre.org/maplibre-gl-js/docs/examples/drag-a-marker/)
     */
    setLngLat(lnglat: LngLatLike): this {
        this._lngLat = LngLat.convert(lnglat);
        this._pos = null;
        if (this._popup) this._popup.setLngLat(this._lngLat);
        this._update();
        return this;
    }

    /**
     * Returns the `Marker`'s HTML element.
     * @returns element
     */
    getElement(): HTMLElement {
        return this._element;
    }

    /**
     * Binds a {@link Popup} to the {@link Marker}.
     * @param popup - An instance of the {@link Popup} class. If undefined or null, any popup
     * set on this {@link Marker} instance is unset.
     * @example
     * ```ts
     * let marker = new Marker()
     *  .setLngLat([0, 0])
     *  .setPopup(new Popup().setHTML("<h1>Hello World!</h1>")) // add popup
     *  .addTo(map);
     * ```
     * @see [Attach a popup to a marker instance](https://maplibre.org/maplibre-gl-js/docs/examples/set-popup/)
     */
    setPopup(popup?: Popup | null): this {
        if (this._popup) {
            this._popup.remove();
            this._popup = null;
            this._element.removeEventListener('keypress', this._onKeyPress);

            if (!this._originalTabIndex) {
                this._element.removeAttribute('tabindex');
            }
        }

        if (popup) {
            if (!('offset' in popup.options)) {
                const markerHeight = 41 - (5.8 / 2);
                const markerRadius = 13.5;
                const linearOffset = Math.abs(markerRadius) / Math.SQRT2;
                popup.options.offset = this._defaultMarker ? {
                    'top': [0, 0],
                    'top-left': [0, 0],
                    'top-right': [0, 0],
                    'bottom': [0, -markerHeight],
                    'bottom-left': [linearOffset, (markerHeight - markerRadius + linearOffset) * -1],
                    'bottom-right': [-linearOffset, (markerHeight - markerRadius + linearOffset) * -1],
                    'left': [markerRadius, (markerHeight - markerRadius) * -1],
                    'right': [-markerRadius, (markerHeight - markerRadius) * -1]
                } as Offset : this._offset;
            }
            this._popup = popup;

            this._originalTabIndex = this._element.getAttribute('tabindex');
            if (!this._originalTabIndex) {
                this._element.setAttribute('tabindex', '0');
            }
            this._element.addEventListener('keypress', this._onKeyPress);
        }

        return this;
    }

    /**
      * Set the option to allow subpixel positioning of the marker by passing a boolean
      *
      * @param value - when set to `true`, subpixel positioning is enabled for the marker.
      *
      * @example
      * ```ts
      * let marker = new Marker()
      * marker.setSubpixelPositioning(true);
      * ```
      */
    setSubpixelPositioning(value: boolean) {
        this._subpixelPositioning = value;
        return this;
    }

    _onKeyPress = (e: KeyboardEvent) => {
        const code = e.code;
        const legacyCode = e.charCode || e.keyCode;

        if (
            (code === 'Space') || (code === 'Enter') ||
            (legacyCode === 32) || (legacyCode === 13) // space or enter
        ) {
            this.togglePopup();
        }
    };

    _onMapClick = (e: MapMouseEvent) => {
        const targetElement = e.originalEvent.target;
        const element = this._element;

        if (this._popup && (targetElement === element || element.contains(targetElement as any))) {
            this.togglePopup();
        }
    };

    /**
     * Returns the {@link Popup} instance that is bound to the {@link Marker}.
     * @returns popup
     * @example
     * ```ts
     * let marker = new Marker()
     *  .setLngLat([0, 0])
     *  .setPopup(new Popup().setHTML("<h1>Hello World!</h1>"))
     *  .addTo(map);
     *
     * console.log(marker.getPopup()); // return the popup instance
     * ```
     */
    getPopup(): Popup {
        return this._popup;
    }

    /**
     * Opens or closes the {@link Popup} instance that is bound to the {@link Marker}, depending on the current state of the {@link Popup}.
     * @example
     * ```ts
     * let marker = new Marker()
     *  .setLngLat([0, 0])
     *  .setPopup(new Popup().setHTML("<h1>Hello World!</h1>"))
     *  .addTo(map);
     *
     * marker.togglePopup(); // toggle popup open or closed
     * ```
     */
    togglePopup(): this {
        const popup = this._popup;

        if (this._element.style.opacity === this._opacityWhenCovered) return this;

        if (!popup) return this;
        else if (popup.isOpen()) popup.remove();
        else {
            popup.setLngLat(this._lngLat);
            popup.addTo(this._map);
        }
        return this;
    }

    _updateOpacity(force: boolean = false) {
        const terrain = this._map?.terrain;
        if (!terrain) {
            const occluded = this._map.transform.isLocationOccluded(this._lngLat);
            const targetOpacity = occluded ? this._opacityWhenCovered : this._opacity;
            if (this._element.style.opacity !== targetOpacity) { this._element.style.opacity = targetOpacity; }
            return;
        }
        if (force) {
            this._opacityTimeout = null;
        } else {
            if (this._opacityTimeout) { return; }
            this._opacityTimeout = setTimeout(() => {
                this._opacityTimeout = null;
            }, 100);
        }

        const map = this._map;

        // Read depth framebuffer, getting position of terrain in line of sight to marker
        const terrainDistance = map.terrain.depthAtPoint(this._pos);
        // Transform marker position to clip space
        const elevation = map.terrain.getElevationForLngLatZoom(this._lngLat, map.transform.tileZoom);
        const markerDistance = map.transform.lngLatToCameraDepth(this._lngLat, elevation);

        const forgiveness = .006;
        if (markerDistance - terrainDistance < forgiveness) {
            this._element.style.opacity = this._opacity;
            return;
        }
        // If the base is obscured, use the offset to check if the marker's center is obscured.
        const metersToCenter = -this._offset.y / map.transform.pixelsPerMeter;
        const elevationToCenter = Math.sin(map.getPitch() * Math.PI / 180) * metersToCenter;
        const terrainDistanceCenter = map.terrain.depthAtPoint(new Point(this._pos.x, this._pos.y - this._offset.y));
        const markerDistanceCenter = map.transform.lngLatToCameraDepth(this._lngLat, elevation + elevationToCenter);
        // Display at full opacity if center is visible.
        const centerIsInvisible = markerDistanceCenter - terrainDistanceCenter > forgiveness;

        if (this._popup?.isOpen() && centerIsInvisible) this._popup.remove();
        this._element.style.opacity = centerIsInvisible ? this._opacityWhenCovered : this._opacity;
    }

    _update = (e?: { type: 'move' | 'moveend' | 'terrain' | 'render' }) => {
        if (!this._map) return;

        const isFullyLoaded = this._map.loaded() && !this._map.isMoving();
        if (e?.type === 'terrain' || (e?.type === 'render' && !isFullyLoaded)) {
            this._map.once('render', this._update);
        }

        if (this._map.transform.renderWorldCopies) {
            this._lngLat = smartWrap(this._lngLat, this._flatPos, this._map.transform);
        } else {
            this._lngLat = this._lngLat?.wrap();
        }

        this._flatPos = this._pos = this._map.project(this._lngLat)._add(this._offset);
        if (this._map.terrain) {
            // flat position is saved because smartWrap needs non-elevated points
            this._flatPos = this._map.transform.locationToScreenPoint(this._lngLat)._add(this._offset);
        }

        let rotation = '';
        if (this._rotationAlignment === 'viewport' || this._rotationAlignment === 'auto') {
            rotation = `rotateZ(${this._rotation}deg)`;
        } else if (this._rotationAlignment === 'map') {
            rotation = `rotateZ(${this._rotation - this._map.getBearing()}deg)`;
        }

        let pitch = '';
        if (this._pitchAlignment === 'viewport' || this._pitchAlignment === 'auto') {
            pitch = 'rotateX(0deg)';
        } else if (this._pitchAlignment === 'map') {
            pitch = `rotateX(${this._map.getPitch()}deg)`;
        }

        // because rounding the coordinates at every `move` event causes stuttered zooming
        // we only round them when _update is called with `moveend` or when its called with
        // no arguments (when the Marker is initialized or Marker#setLngLat is invoked).
        if (!this._subpixelPositioning && (!e || e.type === 'moveend')) {
            this._pos = this._pos.round();
        }

        DOM.setTransform(this._element, `${anchorTranslate[this._anchor]} translate(${this._pos.x}px, ${this._pos.y}px) ${pitch} ${rotation}`);

        browser.frameAsync(new AbortController()).then(() => { // Run _updateOpacity only after painter.render and drawDepth
            this._updateOpacity(e && e.type === 'moveend');
        }).catch(() => {});
    };

    /**
     * Get the marker's offset.
     * @returns The marker's screen coordinates in pixels.
     */
    getOffset(): Point {
        return this._offset;
    }

    /**
     * Sets the offset of the marker
     * @param offset - The offset in pixels as a {@link PointLike} object to apply relative to the element's center. Negatives indicate left and up.
     */
    setOffset(offset: PointLike): this {
        this._offset = Point.convert(offset);
        this._update();
        return this;
    }

    /**
     * Adds a CSS class to the marker element.
     *
     * @param className - on-empty string with CSS class name to add to marker element
     *
     * @example
     * ```
     * let marker = new Marker()
     * marker.addClassName('some-class')
     * ```
     */
    addClassName(className: string) {
        this._element.classList.add(className);
    }

    /**
     * Removes a CSS class from the marker element.
     *
     * @param className - Non-empty string with CSS class name to remove from marker element
     *
     * @example
     * ```ts
     * let marker = new Marker()
     * marker.removeClassName('some-class')
     * ```
     */
    removeClassName(className: string) {
        this._element.classList.remove(className);
    }

    /**
     * Add or remove the given CSS class on the marker element, depending on whether the element currently has that class.
     *
     * @param className - Non-empty string with CSS class name to add/remove
     *
     * @returns if the class was removed return false, if class was added, then return true
     *
     * @example
     * ```ts
     * let marker = new Marker()
     * marker.toggleClassName('toggleClass')
     * ```
     */
    toggleClassName(className: string): boolean {
        return this._element.classList.toggle(className);
    }

    _onMove = (e: MapMouseEvent | MapTouchEvent) => {
        if (!this._isDragging) {
            const clickTolerance = this._clickTolerance || this._map._clickTolerance;
            this._isDragging = e.point.dist(this._pointerdownPos) >= clickTolerance;
        }
        if (!this._isDragging) return;

        this._pos = e.point.sub(this._positionDelta);
        this._lngLat = this._map.unproject(this._pos);
        this.setLngLat(this._lngLat);
        // suppress click event so that popups don't toggle on drag
        this._element.style.pointerEvents = 'none';

        // make sure dragstart only fires on the first move event after mousedown.
        // this can't be on mousedown because that event doesn't necessarily
        // imply that a drag is about to happen.
        if (this._state === 'pending') {
            this._state = 'active';
            this.fire(new Event('dragstart'));
        }
        this.fire(new Event('drag'));
    };

    _onUp = () => {
        // revert to normal pointer event handling
        this._element.style.pointerEvents = 'auto';
        this._positionDelta = null;
        this._pointerdownPos = null;
        this._isDragging = false;
        this._map.off('mousemove', this._onMove);
        this._map.off('touchmove', this._onMove);

        // only fire dragend if it was preceded by at least one drag event
        if (this._state === 'active') {
            this.fire(new Event('dragend'));
        }

        this._state = 'inactive';
    };

    _addDragHandler = (e: MapMouseEvent | MapTouchEvent) => {
        if (this._element.contains(e.originalEvent.target as any)) {
            e.preventDefault();

            // We need to calculate the pixel distance between the click point
            // and the marker position, with the offset accounted for. Then we
            // can subtract this distance from the mousemove event's position
            // to calculate the new marker position.
            // If we don't do this, the marker 'jumps' to the click position
            // creating a jarring UX effect.
            this._positionDelta = e.point.sub(this._pos).add(this._offset);

            this._pointerdownPos = e.point;

            this._state = 'pending';
            this._map.on('mousemove', this._onMove);
            this._map.on('touchmove', this._onMove);
            this._map.once('mouseup', this._onUp);
            this._map.once('touchend', this._onUp);
        }
    };

    /**
     * Sets the `draggable` property and functionality of the marker
     * @param shouldBeDraggable - Turns drag functionality on/off
     */
    setDraggable(shouldBeDraggable?: boolean): this {
        this._draggable = !!shouldBeDraggable; // convert possible undefined value to false

        // handle case where map may not exist yet
        // e.g. when setDraggable is called before addTo
        if (this._map) {
            if (shouldBeDraggable) {
                this._map.on('mousedown', this._addDragHandler);
                this._map.on('touchstart', this._addDragHandler);
            } else {
                this._map.off('mousedown', this._addDragHandler);
                this._map.off('touchstart', this._addDragHandler);
            }
        }

        return this;
    }

    /**
     * Returns true if the marker can be dragged
     * @returns True if the marker is draggable.
     */
    isDraggable(): boolean {
        return this._draggable;
    }

    /**
     * Sets the `rotation` property of the marker.
     * @param rotation - The rotation angle of the marker (clockwise, in degrees), relative to its respective {@link Marker#setRotationAlignment} setting.
     */
    setRotation(rotation?: number): this {
        this._rotation = rotation || 0;
        this._update();
        return this;
    }

    /**
     * Returns the current rotation angle of the marker (in degrees).
     * @returns The current rotation angle of the marker.
     */
    getRotation(): number {
        return this._rotation;
    }

    /**
     * Sets the `rotationAlignment` property of the marker.
     * @param alignment - Sets the `rotationAlignment` property of the marker. defaults to 'auto'
     */
    setRotationAlignment(alignment?: Alignment): this {
        this._rotationAlignment = alignment || 'auto';
        this._update();
        return this;
    }

    /**
     * Returns the current `rotationAlignment` property of the marker.
     * @returns The current rotational alignment of the marker.
     */
    getRotationAlignment(): Alignment {
        return this._rotationAlignment;
    }

    /**
     * Sets the `pitchAlignment` property of the marker.
     * @param alignment - Sets the `pitchAlignment` property of the marker. If alignment is 'auto', it will automatically match `rotationAlignment`.
     */
    setPitchAlignment(alignment?: Alignment): this {
        this._pitchAlignment = alignment && alignment !== 'auto' ? alignment : this._rotationAlignment;
        this._update();
        return this;
    }

    /**
     * Returns the current `pitchAlignment` property of the marker.
     * @returns The current pitch alignment of the marker in degrees.
     */
    getPitchAlignment(): Alignment {
        return this._pitchAlignment;
    }

    /**
     * Sets the `opacity` and `opacityWhenCovered` properties of the marker.
     * When called without arguments, resets opacity and opacityWhenCovered to defaults
     * @param opacity - Sets the `opacity` property of the marker.
     * @param opacityWhenCovered - Sets the `opacityWhenCovered` property of the marker.
     */
    setOpacity(opacity?: string, opacityWhenCovered?: string): this {
        // Reset opacity when called without params or from constructor
        if (this._opacity === undefined || (opacity === undefined && opacityWhenCovered === undefined)) {
            this._opacity = '1';
            this._opacityWhenCovered = '0.2';
        }

        if (opacity !== undefined) {
            this._opacity = opacity;
        }
        if (opacityWhenCovered !== undefined) {
            this._opacityWhenCovered = opacityWhenCovered;
        }

        if (this._map) {
            this._updateOpacity(true);
        }
        return this;
    }
}
