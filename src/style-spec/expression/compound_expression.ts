import {toString} from './types';

import ParsingContext from './parsing_context';
import EvaluationContext from './evaluation_context';
import assert from 'assert';

import type {Expression, ExpressionRegistry} from './expression';
import type {Type} from './types';
import type {Value} from './values';

export type Varargs = {
  type: Type
};
type Signature = Array<Type> | Varargs;
type Evaluate = (b: EvaluationContext, a: Array<Expression>) => Value;

type Definition = [Type, Signature, Evaluate] | {
  type: Type,
  overloads: Array<[Signature, Evaluate]>
};

class CompoundExpression implements Expression {
    name: string;
    type: Type;
    _evaluate: Evaluate;
    args: Array<Expression>;

    static definitions: {[_: string]: Definition};

    constructor(name: string, type: Type, evaluate: Evaluate, args: Array<Expression>) {
        this.name = name;
        this.type = type;
        this._evaluate = evaluate;
        this.args = args;
    }

    evaluate(ctx: EvaluationContext) {
        return this._evaluate(ctx, this.args);
    }

    eachChild(fn: (_: Expression) => void) {
        this.args.forEach(fn);
    }

    outputDefined() {
        return false;
    }

    serialize(): Array<unknown> {
        return [this.name as unknown].concat(this.args.map(arg => arg.serialize()));
    }

    static parse(args: ReadonlyArray<unknown>, context: ParsingContext): Expression | undefined | null {
        const op: string = (args[0] as any);
        const definition = CompoundExpression.definitions[op];
        if (!definition) {
            return context.error(`Unknown expression "${op}". If you wanted a literal array, use ["literal", [...]].`, 0) as null;
        }

        // Now check argument types against each signature
        const type = Array.isArray(definition) ?
            definition[0] : definition.type;

        const availableOverloads = Array.isArray(definition) ?
            [[definition[1], definition[2]]] :
            definition.overloads;

        const overloads = availableOverloads.filter(([signature]) => (
            !Array.isArray(signature) || // varags
            signature.length === args.length - 1 // correct param count
        ));

        let signatureContext: ParsingContext = (null as any);

        for (const [params, evaluate] of overloads) {
            // Use a fresh context for each attempted signature so that, if
            // we eventually succeed, we haven't polluted `context.errors`.
            signatureContext = new ParsingContext(context.registry, context.path, null, context.scope);

            // First parse all the args, potentially coercing to the
            // types expected by this overload.
            const parsedArgs: Array<Expression> = [];
            let argParseFailed = false;
            for (let i = 1; i < args.length; i++) {
                const arg = args[i];
                const expectedType = Array.isArray(params) ?
                    params[i - 1] :
                    (params as Varargs).type;

                const parsed = signatureContext.parse(arg, 1 + parsedArgs.length, expectedType);
                if (!parsed) {
                    argParseFailed = true;
                    break;
                }
                parsedArgs.push(parsed);
            }
            if (argParseFailed) {
                // Couldn't coerce args of this overload to expected type, move
                // on to next one.
                continue;
            }

            if (Array.isArray(params)) {
                if (params.length !== parsedArgs.length) {
                    signatureContext.error(`Expected ${params.length} arguments, but found ${parsedArgs.length} instead.`);
                    continue;
                }
            }

            for (let i = 0; i < parsedArgs.length; i++) {
                const expected = Array.isArray(params) ? params[i] : (params as Varargs).type;
                const arg = parsedArgs[i];
                signatureContext.concat(i + 1).checkSubtype(expected, arg.type);
            }

            if (signatureContext.errors.length === 0) {
                return new CompoundExpression(op, type, evaluate as Evaluate, parsedArgs);
            }
        }

        assert(!signatureContext || signatureContext.errors.length > 0);

        if (overloads.length === 1) {
            context.errors.push(...signatureContext.errors);
        } else {
            const expected = overloads.length ? overloads : availableOverloads;
            const signatures = expected
                .map(([params]) => stringifySignature(params as Signature))
                .join(' | ');

            const actualTypes = [];
            // For error message, re-parse arguments without trying to
            // apply any coercions
            for (let i = 1; i < args.length; i++) {
                const parsed = context.parse(args[i], 1 + actualTypes.length);
                if (!parsed) return null;
                actualTypes.push(toString(parsed.type));
            }
            context.error(`Expected arguments of type ${signatures}, but found (${actualTypes.join(', ')}) instead.`);
        }

        return null;
    }

    static register(
        registry: ExpressionRegistry,
        definitions: {[_: string]: Definition}
    ) {
        assert(!CompoundExpression.definitions);
        CompoundExpression.definitions = definitions;
        for (const name in definitions) {
            registry[name] = CompoundExpression;
        }
    }
}

function stringifySignature(signature: Signature): string {
    if (Array.isArray(signature)) {
        return `(${signature.map(toString).join(', ')})`;
    } else {
        return `(${toString(signature.type)}...)`;
    }
}

export default CompoundExpression;
