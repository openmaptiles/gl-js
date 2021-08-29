// Note: Do not inherit from Error. It breaks when transpiling to ES5.

export default class ValidationError {
    message: string;
    identifier: string | undefined | null;
    line: number | undefined | null;

    constructor(key: string | undefined | null, value: {
      __line__: number
    } | undefined | null, message: string, identifier?: string | null) {
        this.message = (key ? `${key}: ` : '') + message;
        if (identifier) this.identifier = identifier;

        if (value !== null && value !== undefined && value.__line__) {
            this.line = value.__line__;
        }
    }
}
