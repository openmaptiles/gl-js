import '../../stub_loader';
import {test} from '../../util/test';
import Light from '../../../rollup/build/tsc/style/light';
import styleSpec from '../../../rollup/build/tsc/style-spec/reference/latest';
import Color from '../../../rollup/build/tsc/style-spec/util/color';
import {sphericalToCartesian} from '../../../rollup/build/tsc/util/util';

const spec = styleSpec.light;

test('Light with defaults', (t) => {
    const light = new Light({});
    light.recalculate({zoom: 0, zoomHistory: {}});

    expect(light.properties.get('anchor')).toEqual(spec.anchor.default);
    expect(light.properties.get('position')).toEqual(sphericalToCartesian(spec.position.default));
    expect(light.properties.get('intensity')).toEqual(spec.intensity.default);
    expect(light.properties.get('color')).toEqual(Color.parse(spec.color.default));

    t.end();
});

test('Light with options', (t) => {
    const light = new Light({
        anchor: 'map',
        position: [2, 30, 30],
        intensity: 1
    });
    light.recalculate({zoom: 0, zoomHistory: {}});

    expect(light.properties.get('anchor')).toEqual('map');
    expect(light.properties.get('position')).toEqual(sphericalToCartesian([2, 30, 30]));
    expect(light.properties.get('intensity')).toEqual(1);
    expect(light.properties.get('color')).toEqual(Color.parse(spec.color.default));

    t.end();
});

test('Light with stops function', (t) => {
    const light = new Light({
        intensity: {
            stops: [[16, 0.2], [17, 0.8]]
        }
    });
    light.recalculate({zoom: 16.5, zoomHistory: {}});

    expect(light.properties.get('intensity')).toEqual(0.5);

    t.end();
});

test('Light#getLight', (t) => {
    const defaults = {};
    for (const key in spec) {
        defaults[key] = spec[key].default;
    }

    expect(new Light(defaults).getLight()).toEqual(defaults);
    t.end();
});

test('Light#setLight', (t) => {
    t.test('sets light', (t) => {
        const light = new Light({});
        light.setLight({color: 'red', "color-transition": {duration: 3000}});
        light.updateTransitions({transition: true}, {});
        light.recalculate({zoom: 16, zoomHistory: {}, now: 1500});
        expect(light.properties.get('color')).toEqual(new Color(1, 0.5, 0.5, 1));
        t.end();
    });

    t.test('validates by default', (t) => {
        const light = new Light({});
        const lightSpy = t.spy(light, '_validate');
        t.stub(console, 'error');
        light.setLight({color: 'notacolor'});
        light.updateTransitions({transition: false}, {});
        light.recalculate({zoom: 16, zoomHistory: {}, now: 10});
        expect(lightSpy.calledOnce).toBeTruthy();
        expect(console.error.calledOnce).toBeTruthy();
        expect(lightSpy.args[0][2]).toEqual({});
        t.end();
    });

    t.test('respects validation option', (t) => {
        const light = new Light({});

        const lightSpy = t.spy(light, '_validate');
        light.setLight({color: [999]}, {validate: false});
        light.updateTransitions({transition: false}, {});
        light.recalculate({zoom: 16, zoomHistory: {}, now: 10});

        expect(lightSpy.calledOnce).toBeTruthy();
        expect(lightSpy.args[0][2]).toEqual({validate: false});
        expect(light.properties.get('color')).toEqual([999]);
        t.end();
    });
    t.end();
});
