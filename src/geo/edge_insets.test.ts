import expect from 'expect';
import EdgeInsets from '../geo/edge_insets';

describe('EdgeInsets', () => {
    test('#constructor', () => {
        expect(new EdgeInsets() instanceof EdgeInsets).toBeTruthy();
        expect(() => {
            new EdgeInsets(NaN, 10);
        }).toThrowError('Invalid input EdgeInsets(NaN, 10) gets detected and error is thrown');
        expect(() => {
            new EdgeInsets(-10, 10, 20, 10);
        }).toThrowError(
            'Invalid input EdgeInsets(-10, 10, 20, 10) gets detected and error is thrown'
        );

        test('valid initialization', () => {
            const top = 10;
            const bottom = 15;
            const left = 26;
            const right = 19;

            const inset = new EdgeInsets(top, bottom, left, right);
            expect(inset.top).toBe(top);
            expect(inset.bottom).toBe(bottom);
            expect(inset.left).toBe(left);
            expect(inset.right).toBe(right);
        });
    });

    test('#getCenter', () => {
        test('valid input', () => {
            const inset = new EdgeInsets(10, 15, 50, 10);
            const center = inset.getCenter(600, 400);
            expect(center.x).toBe(320);
            expect(center.y).toBe(197.5);
        });

        test('center clamping', () => {
            const inset = new EdgeInsets(300, 200, 500, 200);
            const center = inset.getCenter(600, 400);
            // Midpoint of the overlap when padding overlaps
            expect(center.x).toBe(450);
            expect(center.y).toBe(250);
        });
    });

    test('#interpolate', () => {
        test('it works', () => {
            const inset1 = new EdgeInsets(10, 15, 50, 10);
            const inset2 = new EdgeInsets(20, 30, 100, 10);
            const inset3 = inset1.interpolate(inset1, inset2, 0.5);
            // inset1 is mutated in-place
            expect(inset3).toBe(inset1);

            expect(inset3.top).toBe(15);
            expect(inset3.bottom).toBe(22.5);
            expect(inset3.left).toBe(75);
            expect(inset3.right).toBe(10);
        });

        test('it retains insets that dont have new parameters passed in', () => {
            const inset = new EdgeInsets(10, 15, 50, 10);
            const target = {
                top: 20,
                bottom: inset.bottom,
                left: inset.left,
                right: inset.right
            };
            inset.interpolate(inset, target, 0.5);
            expect(inset.top).toBe(15);
            expect(inset.bottom).toBe(15);
            expect(inset.left).toBe(50);
            expect(inset.right).toBe(10);
        });

    });

    test('#equals', () => {
        const inset1 = new EdgeInsets(10, 15, 50, 10);
        const inset2 = new EdgeInsets(10, 15, 50, 10);
        const inset3 = new EdgeInsets(10, 15, 50, 11);
        expect(inset1.equals(inset2)).toBeTruthy();
        expect(inset2.equals(inset3)).toBeFalsy();
    });

    test('#clone', () => {
        const inset1 = new EdgeInsets(10, 15, 50, 10);
        const inset2 = inset1.clone();
        expect(inset2 === inset1).toBeFalsy();
        expect(inset1.equals(inset2)).toBeTruthy();
    });

});
