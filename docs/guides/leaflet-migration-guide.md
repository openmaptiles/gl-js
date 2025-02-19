# Leaflet migration guide

This part of the docs is dedicated to the migration from `leaflet` to `maplibre-gl`.

This guide might not be accurate depending on the current version of `leaflet`.

The main differences in term of functionality is the ability to support map rotation, vector tiles and globe. For large datasets MapLibre is faster due to its usage of webgl technology.

## Setting Up MapLibre

Install MapLibre GL JS and replace Leaflet with MapLibre in your project:

```
npm install maplibre-gl
```

## Initializing the Map

### Leaflet

```js
const map = L.map('map').setView([0, 0], 2);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);
```

### MapLibre

```js
import 'maplibre-gl/dist/maplibre-gl.css';
import {Map} from 'maplibre-gl';

const map = new Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json',
  center: [0, 0],
  zoom: 2
});
```

## Adding a Marker

### Leaflet

```js
L.marker([0, 0]).addTo(map);
```

### MapLibre

```js
new maplibregl.Marker()
  .setLngLat([0, 0])
  .addTo(map);
```

## Adding a GeoJSON Layer

### Leaflet

```js
L.geoJSON('data.geojson').addTo(map);
```

### MapLibre

```js
map.on('load', function () {
  map.addSource('geojson-source', {
    type: 'geojson',
    data: 'data.geojson',
  });

  map.addLayer({
    id: 'geojson-layer',
    type: 'fill',
    source: 'geojson-source',
    paint: {
      'fill-color': '#0080ff',
      'fill-opacity': 0.5,
    },
  });
});
```

## Handling Click Events

### Leaflet

```js
map.on('click', function (event) {
  console.log('Clicked coordinates:', event.latlng);
});
```

### MapLibre

```js
map.on('click', function (event) {
  console.log('Clicked coordinates:', event.lngLat);
});
```

## Displaying a Popup

### Leaflet

```js
L.popup()
  .setLatLng([0, 0])
  .setContent('Hello, Leaflet!')
  .openOn(map);
```

### MapLibre

```js
new maplibregl.Popup()
  .setLngLat([0, 0])
  .setHTML('<p>Hello, MapLibre!</p>')
  .addTo(map);
```

## Adding a Custom Tile Layer

### Leaflet

```js
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
```

### MapLibre

```js
map.on('load', function () {
  map.addSource('osm', {
    type: 'raster',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    tileSize: 256
  });

  map.addLayer({
    id: 'osm-layer',
    type: 'raster',
    source: 'osm',
  });
});
```

## Adding a Polygon

### Leaflet

```js
L.polygon([
  [51.5, -0.1],
  [51.5, -0.12],
  [51.52, -0.12]
]).addTo(map);
```

### MapLibre

```js
map.on('load', function () {
  map.addSource('polygon', {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[[ -0.1, 51.5 ], [ -0.12, 51.5 ], [ -0.12, 51.52 ], [ -0.1, 51.5 ]]]
      }
    }
  });

  map.addLayer({
    id: 'polygon-layer',
    type: 'fill',
    source: 'polygon',
    paint: {
      'fill-color': '#ff0000',
      'fill-opacity': 0.5
    }
  });
});
```
