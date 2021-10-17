// @flow

import {test} from '../../util/test';
import Color from '../../../rollup/build/tsc/src/style-spec/util/color';

test('Color.parse', (t) => {
    expect(Color.parse('red')).toEqual(new Color(1, 0, 0, 1));
    expect(Color.parse('#ff00ff')).toEqual(new Color(1, 0, 1, 1));
    expect(Color.parse('invalid')).toEqual(undefined);
    expect(Color.parse(null)).toEqual(undefined);
    expect(Color.parse(undefined)).toEqual(undefined);
    t.end();
});

test('Color#toString', (t) => {
    const purple = Color.parse('purple');
    expect(purple && purple.toString()).toBe('rgba(128,0,128,1)');
    const translucentGreen = Color.parse('rgba(26, 207, 26, .73)');
    expect(translucentGreen && translucentGreen.toString()).toBe('rgba(26,207,26,0.73)');
    t.end();
});
