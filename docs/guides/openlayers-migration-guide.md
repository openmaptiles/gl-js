# OpenLayers migration guide

This part of the docs is dedicated to the migration from `openlayers` to `maplibre-gl`.


## Setting Up MapLibre

Install MapLibre GL JS and replace OpenLayers with MapLibre in your project:

```
npm install maplibre-gl
```

## Initializing the Map

### OpenLayers
```js
import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';

const map = new Map({
  target: 'map',
  layers: [
    new TileLayer({
      source: new OSM(),
    }),
  ],
  view: new View({
    center: [0, 0],
    zoom: 2,
  }),
});
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

### OpenLayers

```js
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Style from 'ol/style/Style';
import Icon from 'ol/style/Icon';

const marker = new Feature({
  geometry: new Point([0, 0]),
});

marker.setStyle(new Style({
  image: new Icon({
    src: 'marker.png',
    scale: 0.1,
  }),
}));

const vectorLayer = new VectorLayer({
  source: new VectorSource({
    features: [marker],
  }),
});

map.addLayer(vectorLayer);
```

### MapLibre

```js
map.on('load', function () {
  new maplibregl.Marker({ color: 'red' })
    .setLngLat([0, 0])
    .addTo(map);
});
```

## Adding a GeoJSON Layer

### OpenLayers

```js
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import GeoJSON from 'ol/format/GeoJSON';

const geoJsonLayer = new VectorLayer({
  source: new VectorSource({
    url: 'data.geojson',
    format: new GeoJSON(),
  }),
});

map.addLayer(geoJsonLayer);
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

### OpenLayers

```js
map.on('click', function (event) {
  console.log('Clicked coordinates:', event.coordinate);
});
```

### MapLibre

```js
map.on('click', function (event) {
  console.log('Clicked coordinates:', event.lngLat);
});
```

## Displaying a Popup

### OpenLayers

```js
import Overlay from 'ol/Overlay';

const popup = new Overlay({
  element: document.getElementById('popup'),
});

map.addOverlay(popup);

map.on('click', function (event) {
  popup.setPosition(event.coordinate);
  document.getElementById('popup-content').innerHTML = 'Hello, OpenLayers!';
});
```

### MapLibre

```js
const popup = new maplibregl.Popup()
  .setLngLat([0, 0])
  .setHTML('<p>Hello, MapLibre!</p>')
  .addTo(map);
```
