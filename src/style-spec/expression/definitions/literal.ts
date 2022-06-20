import assert from 'assert';
import {isValue, typeOf, Color, Padding} from '../values';
import Formatted from '../types/formatted';

import type {Type} from '../types';
import type {Value}  from '../values';
import type {Expression} from '../expression';
import type ParsingContext from '../parsing_context';

class Literal implements Expression {
    type: Type;
    value: Value;

    constructor(type: Type, value: Value) {
        this.type = type;
        this.value = value;
    }

    static parse(args: ReadonlyArray<unknown>, context: ParsingContext): Expression {
        if (args.length !== 2)
            return context.error(`'literal' expression requires exactly one argument, but found ${args.length - 1} instead.`) as null;

        if (!isValue(args[1]))
            return context.error('invalid value') as null;

        const value = (args[1] as any);
        let type = typeOf(value);

        // special case: infer the item type if possible for zero-length arrays
        const expected = context.expectedType;
        if (
            type.kind === 'array' &&
            type.N === 0 &&
            expected &&
            expected.kind === 'array' &&
            (typeof expected.N !== 'number' || expected.N === 0)
        ) {
            type = expected;
        }

        return new Literal(type, value);
    }

    evaluate() {
        return this.value;
    }

    eachChild() {}

    outputDefined() {
        return true;
    }

    serialize(): Array<unknown> {
        if (this.type.kind === 'array' || this.type.kind === 'object') {
            return ['literal', this.value];
        } else if (this.value instanceof Color) {
            // Constant-folding can generate Literal expressions that you
            // couldn't actually generate with a "literal" expression,
            // so we have to implement an equivalent serialization here
            return ['rgba' as unknown].concat(this.value.toArray());
        } else if (this.value instanceof Formatted) {
            // Same as Color
            return this.value.serialize();
        } else {
            assert(this.value === null ||
                typeof this.value === 'string' ||
                typeof this.value === 'number' ||
                typeof this.value === 'boolean');
            return this.value as any;
        }
    }
}

export default Literal;
