<p align="center">
  <img src="https://maplibre.org/img/maplibre-logo-big.svg" alt="MapLibre Logo">
</p>

# MapLibre GL JS

[![License](https://img.shields.io/badge/License-BSD_3--Clause-blue.svg?style=flat)](LICENSE.txt) [![Version](https://img.shields.io/npm/v/maplibre-gl?style=flat)](https://www.npmjs.com/package/maplibre-gl) [![CI](https://github.com/maplibre/maplibre-gl-js/actions/workflows/test-all.yml/badge.svg)](https://github.com/maplibre/maplibre-gl-js/actions/workflows/test-all.yml) [![PRs](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat)](https://opensource.org/licenses/BSD-3-Clause) [![codecov](https://codecov.io/gh/maplibre/maplibre-gl-js/branch/main/graph/badge.svg)](https://codecov.io/gh/maplibre/maplibre-gl-js)

**[MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/API/)** is an open-source library for publishing maps on your websites or webview based apps. Fast displaying of maps is possible thanks to GPU-accelerated vector tile rendering.

It originated as an open-source fork of [mapbox-gl-js](https://github.com/mapbox/mapbox-gl-js), before their switch to a non-OSS license in December 2020. The library's initial versions (1.x) were intended to be a drop-in replacement for the Mapbox’s OSS version (1.x) with additional functionality, but have evolved a lot since then.

## Getting Started

Include the JavaScript and CSS files in the `<head>` of your HTML file.

```html
<script src='https://unpkg.com/maplibre-gl@latest/dist/maplibre-gl.js'></script>
<link href='https://unpkg.com/maplibre-gl@latest/dist/maplibre-gl.css' rel='stylesheet' />
```

Include the following code in the `<body>` of your HTML file.

```html
<div id='map' style='width: 400px; height: 300px;'></div>
<script>
var map = new maplibregl.Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json', // stylesheet location
  center: [-74.5, 40], // starting position [lng, lat]
  zoom: 9 // starting zoom
});
</script>
```

Enjoy the map!

<br />

## Documentation

Full documentation for this library [is available here](https://maplibre.org/maplibre-gl-js/docs/API/).

Check out the features through [examples](https://maplibre.org/maplibre-gl-js/docs/examples/).

| Showcases |      |
| ---- | ---- |
|![Display a map](https://maplibre.org/maplibre-gl-js/docs/assets/examples/simple-map.png)	|![Third party vector tile source](https://maplibre.org/maplibre-gl-js/docs/assets/examples/3d-terrain.png)	|
|![Animate a series of images](https://maplibre.org/maplibre-gl-js/docs/assets/examples/animate-images.png)	|![Create a heatmap layer](https://maplibre.org/maplibre-gl-js/docs/assets/examples/heatmap-layer.png)	|
|![3D buildings](https://maplibre.org/maplibre-gl-js/docs/assets/examples/3d-buildings.png)	|![Visualize population density](https://maplibre.org/maplibre-gl-js/docs/assets/examples/visualize-population-density.png)	|

<br />

Want an example? Have a look at the official [MapLibre GL JS Documentation](https://maplibre.org/maplibre-gl-js/docs/examples/).

Use MapLibre GL JS bindings for [React](https://visgl.github.io/react-map-gl/docs/get-started) and [Angular](https://github.com/maplibre/ngx-maplibre-gl). Find more at [awesome-maplibre](https://github.com/maplibre/awesome-maplibre).

<br />

## Contribution

### Getting Involved

Join the #maplibre slack channel at OSMUS: get an invite at https://slack.openstreetmap.us/
Read the [CONTRIBUTING.md](CONTRIBUTING.md) guide in order to get familiar with how we do things around here.

### Avoid Fragmentation

If you depend on a free software alternative to `mapbox-gl-js`, please consider joining our effort! Anyone with a stake in a healthy community-led fork is welcome to help us figure out our next steps. We welcome contributors and leaders! MapLibre GL JS already represents the combined efforts of a few early fork efforts, and we all benefit from "one project" rather than "our way". If you know of other forks, please reach out to them and direct them here.

> **MapLibre GL JS** is developed following [Semantic Versioning (2.0.0)](https://semver.org/spec/v2.0.0.html).

### Bounties

We offer Bounties for some tasks in the MapLibre GL JS repo. Read more about the Bounties in our step-by-step guide:

https://maplibre.org/roadmap/step-by-step-bounties-guide/

And find all currently published Bounties in MapLibre GL JS [here](https://github.com/maplibre/maplibre-gl-js/issues?q=is%3Aissue+is%3Aopen+label%3A%22%F0%9F%92%B0+bounty+L%22%2C%22%F0%9F%92%B0+bounty+S%22%2C%22%F0%9F%92%B0+bounty+M%22%2C%22%F0%9F%92%B0+bounty+XL%22%2C%22%F0%9F%92%B0+bounty+XXL%22+).

<br />

## Sponsors

We thank everyone who supported us financially in the past and special thanks to the people and organizations who support us with recurring donations!

Read more about the MapLibre Sponsorship Program at [https://maplibre.org/sponsors/](https://maplibre.org/sponsors/).

Gold:

<a href="https://aws.amazon.com/location"><img src="https://maplibre.org/img/aws-logo.svg" alt="Logo AWS" width="25%"/></a>

<a href="https://meta.com"><img src="https://maplibre.org/img/meta-logo.svg" alt="Logo Meta" width="25%"/></a>

Silver:

<a href="https://www.mierune.co.jp/?lang=en"><img src="https://maplibre.org/img/mierune-logo.svg" alt="Logo MIERUNE" width="25%"/></a>

<a href="https://komoot.com/"><img src="https://maplibre.org/img/komoot-logo.svg" alt="Logo komoot" width="25%"/></a>

<a href="https://www.jawg.io/"><img src="https://maplibre.org/img/jawgmaps-logo.svg" alt="Logo JawgMaps" width="25%"/></a>

<a href="https://www.radar.com/"><img src="https://maplibre.org/img/radar-logo.svg" alt="Logo Radar" width="25%"/></a>

<a href="https://www.microsoft.com/"><img src="https://maplibre.org/img/msft-logo.svg" alt="Logo MSFT" width="25%"/></a>

<a href="https://www.mappedin.com/"><img src="https://maplibre.org/img/mappedin-logo.svg" alt="Logo mappedin" width="25%"/></a>

<a href="https://www.mapme.com/"><img src="https://maplibre.org/img/mapme-logo.svg" alt="Logo mapme" width="25%"/></a>

Backers and Supporters:

<a href="https://opencollective.com/maplibre/backer/0/website?requireActive=false" target="_blank"><img src="https://opencollective.com/maplibre/backer/0/avatar.svg?requireActive=false"></a>
<a href="https://opencollective.com/maplibre/backer/1/website?requireActive=false" target="_blank"><img src="https://opencollective.com/maplibre/backer/1/avatar.svg?requireActive=false"></a>
<a href="https://opencollective.com/maplibre/backer/2/website?requireActive=false" target="_blank"><img src="https://opencollective.com/maplibre/backer/2/avatar.svg?requireActive=false"></a>
<a href="https://opencollective.com/maplibre/backer/3/website?requireActive=false" target="_blank"><img src="https://opencollective.com/maplibre/backer/3/avatar.svg?requireActive=false"></a>
<a href="https://opencollective.com/maplibre/backer/4/website?requireActive=false" target="_blank"><img src="https://opencollective.com/maplibre/backer/4/avatar.svg?requireActive=false"></a>
<a href="https://opencollective.com/maplibre/backer/5/website?requireActive=false" target="_blank"><img src="https://opencollective.com/maplibre/backer/5/avatar.svg?requireActive=false"></a>
<a href="https://opencollective.com/maplibre/backer/6/website?requireActive=false" target="_blank"><img src="https://opencollective.com/maplibre/backer/6/avatar.svg?requireActive=false"></a>
<a href="https://opencollective.com/maplibre/backer/7/website?requireActive=false" target="_blank"><img src="https://opencollective.com/maplibre/backer/7/avatar.svg?requireActive=false"></a>
<a href="https://opencollective.com/maplibre/backer/8/website?requireActive=false" target="_blank"><img src="https://opencollective.com/maplibre/backer/8/avatar.svg?requireActive=false"></a>
<a href="https://opencollective.com/maplibre/backer/9/website?requireActive=false" target="_blank"><img src="https://opencollective.com/maplibre/backer/9/avatar.svg?requireActive=false"></a>
<a href="https://opencollective.com/maplibre/backer/10/website?requireActive=false" target="_blank"><img src="https://opencollective.com/maplibre/backer/10/avatar.svg?requireActive=false"></a>
<a href="https://opencollective.com/maplibre/backer/11/website?requireActive=false" target="_blank"><img src="https://opencollective.com/maplibre/backer/11/avatar.svg?requireActive=false"></a>
<a href="https://opencollective.com/maplibre/backer/12/website?requireActive=false" target="_blank"><img src="https://opencollective.com/maplibre/backer/12/avatar.svg?requireActive=false"></a>
<a href="https://opencollective.com/maplibre/backer/13/website?requireActive=false" target="_blank"><img src="https://opencollective.com/maplibre/backer/13/avatar.svg?requireActive=false"></a>
<a href="https://opencollective.com/maplibre/backer/14/website?requireActive=false" target="_blank"><img src="https://opencollective.com/maplibre/backer/14/avatar.svg?requireActive=false"></a>
<a href="https://opencollective.com/maplibre/backer/15/website?requireActive=false" target="_blank"><img src="https://opencollective.com/maplibre/backer/15/avatar.svg?requireActive=false"></a>
<a href="https://opencollective.com/maplibre/backer/16/website?requireActive=false" target="_blank"><img src="https://opencollective.com/maplibre/backer/16/avatar.svg?requireActive=false"></a>
<a href="https://opencollective.com/maplibre/backer/17/website?requireActive=false" target="_blank"><img src="https://opencollective.com/maplibre/backer/17/avatar.svg?requireActive=false"></a>
<a href="https://opencollective.com/maplibre/backer/18/website?requireActive=false" target="_blank"><img src="https://opencollective.com/maplibre/backer/18/avatar.svg?requireActive=false"></a>
<a href="https://opencollective.com/maplibre/backer/19/website?requireActive=false" target="_blank"><img src="https://opencollective.com/maplibre/backer/19/avatar.svg?requireActive=false"></a>
<a href="https://opencollective.com/maplibre/backer/20/website?requireActive=false" target="_blank"><img src="https://opencollective.com/maplibre/backer/20/avatar.svg?requireActive=false"></a>
<a href="https://opencollective.com/maplibre/backer/21/website?requireActive=false" target="_blank"><img src="https://opencollective.com/maplibre/backer/21/avatar.svg?requireActive=false"></a>
<a href="https://opencollective.com/maplibre/backer/22/website?requireActive=false" target="_blank"><img src="https://opencollective.com/maplibre/backer/22/avatar.svg?requireActive=false"></a>
<a href="https://opencollective.com/maplibre/backer/23/website?requireActive=false" target="_blank"><img src="https://opencollective.com/maplibre/backer/23/avatar.svg?requireActive=false"></a>
<a href="https://opencollective.com/maplibre/backer/24/website?requireActive=false" target="_blank"><img src="https://opencollective.com/maplibre/backer/24/avatar.svg?requireActive=false"></a>
<a href="https://opencollective.com/maplibre/backer/25/website?requireActive=false" target="_blank"><img src="https://opencollective.com/maplibre/backer/25/avatar.svg?requireActive=false"></a>
<a href="https://opencollective.com/maplibre/backer/26/website?requireActive=false" target="_blank"><img src="https://opencollective.com/maplibre/backer/26/avatar.svg?requireActive=false"></a>
<a href="https://opencollective.com/maplibre/backer/27/website?requireActive=false" target="_blank"><img src="https://opencollective.com/maplibre/backer/27/avatar.svg?requireActive=false"></a>
<a href="https://opencollective.com/maplibre/backer/28/website?requireActive=false" target="_blank"><img src="https://opencollective.com/maplibre/backer/28/avatar.svg?requireActive=false"></a>
<a href="https://opencollective.com/maplibre/backer/29/website?requireActive=false" target="_blank"><img src="https://opencollective.com/maplibre/backer/29/avatar.svg?requireActive=false"></a>
<a href="https://opencollective.com/maplibre/backer/30/website?requireActive=false" target="_blank"><img src="https://opencollective.com/maplibre/backer/30/avatar.svg?requireActive=false"></a>

<br />

## Thank you Mapbox 🙏🏽

We'd like to acknowledge the amazing work Mapbox has contributed to open source. The open source community is sad to part ways with them, but we simultaneously feel grateful for everything they already contributed. `mapbox-gl-js` 1.x is an open source achievement that now lives on as `maplibre-gl`. We're proud to develop on the shoulders of giants, thank you Mapbox 🙇🏽‍♀️.

Please keep in mind: Unauthorized backports are the biggest threat to the MapLibre project. It is unacceptable to backport code from mapbox-gl-js, which is not covered by the former BSD-3 license. If you are unsure about this issue, [please ask](https://github.com/maplibre/maplibre-gl-js/discussions)!

<br />

## License

**MapLibre GL JS** is licensed under the [3-Clause BSD license](./LICENSE.txt).
