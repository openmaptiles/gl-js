import SymbolBucket from '../../rollup/build/tsc/data/bucket/symbol_bucket';
import SymbolStyleLayer from '../../rollup/build/tsc/style/style_layer/symbol_style_layer';
import featureFilter from '../../rollup/build/tsc/style-spec/feature_filter';

export function createSymbolBucket(layerId, font, text, collisionBoxArray) {
    const layer = new SymbolStyleLayer({
        id: layerId,
        type: 'symbol',
        layout: {'text-font': [font], 'text-field': text},
        filter: featureFilter()
    });
    layer.recalculate({zoom: 0, zoomHistory: {}});

    return new SymbolBucket({
        overscaling: 1,
        zoom: 0,
        collisionBoxArray,
        layers: [layer]
    });
}
