import '../../stub_loader';
import SymbolStyleLayer from '../style/style_layer/symbol_style_layer';
import FormatSectionOverride from '../style/format_section_override';
import properties from '../style/style_layer/symbol_style_layer_properties';

function createSymbolLayer(layerProperties) {
    const layer = new SymbolStyleLayer(layerProperties);
    layer.recalculate({zoom: 0, zoomHistory: {}});
    return layer;
}

function isOverriden(paintProperty) {
    if (paintProperty.value.kind === 'source' || paintProperty.value.kind === 'composite') {
        return paintProperty.value._styleExpression.expression instanceof FormatSectionOverride;
    }
    return false;
}

describe('setPaintOverrides', done => {
    test('setPaintOverrides, no overrides', done => {
        const layer = createSymbolLayer({});
        layer._setPaintOverrides();
        for (const overridable of properties.paint.overridableProperties) {
            expect(isOverriden(layer.paint.get(overridable))).toBe(false);
        }
        done();
    });

    test('setPaintOverrides, format expression, overriden text-color', done => {
        const props = {layout: {'text-field': ["format", "text", {"text-color": "yellow"}]}};
        const layer = createSymbolLayer(props);
        layer._setPaintOverrides();
        expect(isOverriden(layer.paint.get('text-color'))).toBe(true);
        done();
    });

    test('setPaintOverrides, format expression, no overrides', done => {
        const props = {layout: {'text-field': ["format", "text", {}]}};
        const layer = createSymbolLayer(props);
        layer._setPaintOverrides();
        expect(isOverriden(layer.paint.get('text-color'))).toBe(false);
        done();
    });

    done();
});

describe('hasPaintOverrides', done => {
    test('undefined', done => {
        const layer = createSymbolLayer({});
        expect(SymbolStyleLayer.hasPaintOverride(layer.layout, 'text-color')).toBe(false);
        done();
    });

    test('constant, Formatted type, overriden text-color', done => {
        const props = {layout: {'text-field': ["format", "text", {"text-color": "red"}]}};
        const layer = createSymbolLayer(props);
        expect(SymbolStyleLayer.hasPaintOverride(layer.layout, 'text-color')).toBe(true);
        done();
    });

    test('constant, Formatted type, no overrides', done => {
        const props = {layout: {'text-field': ["format", "text", {"font-scale": 0.8}]}};
        const layer = createSymbolLayer(props);
        expect(SymbolStyleLayer.hasPaintOverride(layer.layout, 'text-color')).toBe(false);
        done();
    });

    test('format expression, overriden text-color', done => {
        const props = {layout: {'text-field': ["format", ["get", "name"], {"text-color":"red"}]}};
        const layer = createSymbolLayer(props);
        expect(SymbolStyleLayer.hasPaintOverride(layer.layout, 'text-color')).toBe(true);
        done();
    });

    test('format expression, no overrides', done => {
        const props = {layout: {'text-field': ["format", ["get", "name"], {}]}};
        const layer = createSymbolLayer(props);
        expect(SymbolStyleLayer.hasPaintOverride(layer.layout, 'text-color')).toBe(false);
        done();
    });

    test('nested expression, overriden text-color', done => {
        const matchExpr = ["match", ["get", "case"],
            "one", ["format", "color", {"text-color": "blue"}],
            "default"];
        const props = {layout: {'text-field': matchExpr}};
        const layer = createSymbolLayer(props);
        expect(SymbolStyleLayer.hasPaintOverride(layer.layout, 'text-color')).toBe(true);
        done();
    });

    test('nested expression, no overrides', done => {
        const matchExpr = ["match", ["get", "case"],
            "one", ["format", "b&w", {}],
            "default"];
        const props = {layout: {'text-field': matchExpr}};
        const layer = createSymbolLayer(props);
        expect(SymbolStyleLayer.hasPaintOverride(layer.layout, 'text-color')).toBe(false);
        done();
    });

    done();
});
