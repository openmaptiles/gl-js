
import '../../stub_loader';
import fs from 'fs';
import path, {dirname} from 'path';
import Protobuf from 'pbf';
import {VectorTile} from '@mapbox/vector-tile';
import Point from '../util/point';
import segment from '../data/segment';
import FillBucket from '../data/bucket/fill_bucket';
import FillStyleLayer from '../style/style_layer/fill_style_layer';
import {fileURLToPath} from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

// Load a fill feature from fixture tile.
const vt = new VectorTile(new Protobuf(fs.readFileSync(path.join(__dirname, '/../../fixtures/mbsv5-6-18-23.vector.pbf'))));
const feature = vt.layers.water.feature(0);

function createPolygon(numPoints) {
    const points = [];
    for (let i = 0; i < numPoints; i++) {
        points.push(new Point(2048 + 256 * Math.cos(i / numPoints * 2 * Math.PI, 2048 + 256 * Math.sin(i / numPoints * 2 * Math.PI))));
    }
    return points;
}

describe('FillBucket', () => {
    const layer = new FillStyleLayer({id: 'test', type: 'fill', layout: {}});
    layer.recalculate({zoom: 0, zoomHistory: {}});

    const bucket = new FillBucket({layers: [layer]});

    bucket.addFeature({}, [[
        new Point(0, 0),
        new Point(10, 10)
    ]]);

    bucket.addFeature({}, [[
        new Point(0, 0),
        new Point(10, 10),
        new Point(10, 20)
    ]]);

    bucket.addFeature(feature, feature.loadGeometry());

    });

describe('FillBucket segmentation', () => {
    // Stub MAX_VERTEX_ARRAY_LENGTH so we can test features
    // breaking across array groups without tests taking a _long_ time.
    t.stub(segment, 'MAX_VERTEX_ARRAY_LENGTH').value(256);

    const layer = new FillStyleLayer({
        id: 'test',
        type: 'fill',
        layout: {},
        paint: {
            'fill-color': ['to-color', ['get', 'foo'], '#000']
        }
    });
    layer.recalculate({zoom: 0, zoomHistory: {}});

    const bucket = new FillBucket({layers: [layer]});

    // first add an initial, small feature to make sure the next one starts at
    // a non-zero offset
    bucket.addFeature({}, [createPolygon(10)]);

    // add a feature that will break across the group boundary
    bucket.addFeature({}, [
        createPolygon(128),
        createPolygon(128)
    ]);

    // Each polygon must fit entirely within a segment, so we expect the
    // first segment to include the first feature and the first polygon
    // of the second feature, and the second segment to include the
    // second polygon of the second feature.
    expect(bucket.layoutVertexArray.length).toBe(266);
    expect(bucket.segments.get()[0]).toEqual({
        vertexOffset: 0,
        vertexLength: 138,
        primitiveOffset: 0,
        primitiveLength: 134
    });
    expect(bucket.segments.get()[1]).toEqual({
        vertexOffset: 138,
        vertexLength: 128,
        primitiveOffset: 134,
        primitiveLength: 126
    });

    });
