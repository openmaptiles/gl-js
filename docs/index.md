# Introduction

MapLibre GL JS is a TypeScript library that uses WebGL to render interactive maps from vector tiles in a browser. The customization of the map comply with the [MapLibre Style Spec](https://maplibre.org/maplibre-style-spec). It is part of the [MapLibre ecosystem](https://github.com/maplibre), with a counterpart for Android, iOS and other platforms called [MapLibre Native](https://github.com/maplibre/maplibre-native).

## Quickstart

<iframe src="./examples/simple-map.html" width="100%" height="400px" style="border:none"></iframe>

```html
<div id="map"></div>
<script>
    var map = new maplibregl.Map({
        container: 'map', // container id
        style: 'https://demotiles.maplibre.org/style.json', // style URL
        center: [0, 0], // starting position [lng, lat]
        zoom: 1 // starting zoom
    });
</script>
```


## Reading this documentation

This documentation is divided into several sections:

* [**Main**](./API/README.md) - The Main section holds the following classes
    * [`Map`](./API/classes/Map.md) object is the map on your page. It lets you access methods and properties for interacting with the map's style and layers, respond to events, and manipulate the user's perspective with the camera.
    * [`Global Functions`](./API/functions/addProtocol.md) let you set global properties and options that you might want to access while initializing your map or accessing information about its status.
* [**Markers and Controls**](./API/README.md#markers-and-controls) - This section describes the user interface elements that you can add to your map. The items in this section exist outside of the map's `canvas` element. This consists of `Marker`, `Popup` and all the controls.
* [**Geography and geometry**](./API/README.md#geography-and-geometry) - This section includes general utilities and types that relate to working with and manipulating geographic information or geometries.
* [**User interaction handlers**](./API/README.md#handlers) - The items in this section relate to the ways in which the map responds to user input.
* [**Sources**](./API/README.md#sources) - This section describes the source types MapLibre GL JS can handle besides the ones described in the [MapLibre Style Specification](https://maplibre.org/maplibre-style-spec/).
* [**Event Related**](./API/README.md#event-related) - This section describes the different types of events that MapLibre GL JS can raise.

Each section describes classes or objects as well as their **properties**, **parameters**, **instance members**, and associated **events**. Many sections also include inline code examples and related resources.

In the examples, we use vector tiles from our [Demo tiles repository](https://github.com/maplibre/demotiles)
and the following other providers (presented in alphabetical order).

|                                          |                                                                                                                                                            |
|------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------|
| [Americana OSM](https://tile.ourmap.us/) | A community tile server run by (amazingly dedicated) volunteers. Consult their [tile usage policy](https://tile.ourmap.us/usage.html) for acceptable uses. |
| [MapTiler](https://maptiler.com)         | A commercial tile provider; requires an API key for use.                                                                                                   |
| [Stadia Maps](https://stadiamaps.com/)   | A commercial tile provider; requires an API key or domain registration for use.                                                                            |

You can find a list of other tile providers on the
[Awesome MapLibre](https://github.com/maplibre/awesome-maplibre?tab=readme-ov-file#maptile-providers) tile provider section,
or on the [OSM Wiki](https://wiki.openstreetmap.org/wiki/Vector_tiles#Providers).

## NPM

Install the MapLibre GL JS package via NPM.

```bash
npm install maplibre-gl
```

You can then import the MapLibre GL JS module in your project.

```html
<div id="map"></div>
```

```javascript
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const map = new maplibregl.Map({
    container: 'map', // container id
    style: 'https://demotiles.maplibre.org/style.json', // style URL
    center: [0, 0], // starting position [lng, lat]
    zoom: 1 // starting zoom
});
```

## CSP Directives

As a mitigation for Cross-Site Scripting and other types of web security vulnerabilities, you may use a [Content Security Policy (CSP)](https://developer.mozilla.org/en-US/docs/Web/Security/CSP) to specify security policies for your website. If you do, MapLibre GL JS requires the following CSP directives:

```
worker-src blob: ;
child-src blob: ;
img-src data: blob: ;
```

For strict CSP environments without `worker-src blob: ; child-src blob:` enabled, there's a separate MapLibre GL JS bundle (`maplibre-gl-csp.js` and `maplibre-gl-csp-worker.js`) which requires setting the path to the worker manually:

```html
<script>
maplibregl.setWorkerUrl("${urls.js().replace('.js', '-csp-worker.js')}");
...
</script>
```

## MapLibre CSS

The CSS referenced in the Quickstart is used to style DOM elements created by MapLibre code. Without the CSS, elements like Popups and Markers won't work.

Including it with a `<link>` in the head of the document via the UNPKG CDN is the simplest and easiest way to provide the CSS, but it is also bundled in the MapLibre module, meaning that if you have a bundler that can handle CSS, you can import the CSS from `maplibre-gl/dist/maplibre-gl.css`.

Note too that if the CSS isn't available by the first render, as soon as the CSS is provided, the DOM elements that depend on this CSS should recover.

## CDN

MapLibre GL JS is also distributed via UNPKG. Our latest version can installed by adding below tags this in the html `<head>`. Further instructions on how to select specific versions and semver ranges can be found on at [unpkg.com](https://unpkg.com).

```html
<script src="https://unpkg.com/maplibre-gl@^4.7.0/dist/maplibre-gl.js"></script>
<link href="https://unpkg.com/maplibre-gl@^4.7.0/dist/maplibre-gl.css" rel="stylesheet" />
```
