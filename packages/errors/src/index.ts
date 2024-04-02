import { BuiltinError } from './error';

export enum ErrorKind {
    GENERIC_NAMESPACE_INVALID = 'GENERIC_NAMESPACE_INVALID',

    COMMAND_UNKNOWN_COMMAND = 'COMMAND_UNKNOWN_Command',
    COMMAND_REGISTER_CLASS_MALFORMED_OR_MISSING = 'COMMAND_REGISTER_CLASS_MALFORMED_OR_MISSING'
}

export class Error<T = ErrorKind> extends BuiltinError {
    public readonly name: string = 'Error';
    public readonly message!: string;
    public readonly code!: T;

    public constructor() {
        super(...arguments);
        Object.setPrototypeOf(this, BuiltinError.prototype);
        Object.setPrototypeOf(this, Error.prototype);
    }
}

export class GenericNamespaceInvalidError extends Error {
    name = 'NamespaceInvalidError';
    message = `The namespace is malformed or invalid.`;
    code = ErrorKind.GENERIC_NAMESPACE_INVALID;

    public constructor() {
        super();
        Object.setPrototypeOf(this, GenericNamespaceInvalidError.prototype);
    }
}

export class CommandUnknownCommandError extends Error {
    name = 'UnknownCommandError';
    message = `Unknown command.`;
    code = ErrorKind.COMMAND_UNKNOWN_COMMAND;

    public constructor() {
        super();
        Object.setPrototypeOf(this, CommandUnknownCommandError.prototype);
    }
}

export class CommandRegisterClassMalformedOrMissingError extends Error {
    name = 'CommandRegisterClassMalformedOrMissingError';
    message = `Command class is malformed or missing.`;
    code = ErrorKind.COMMAND_REGISTER_CLASS_MALFORMED_OR_MISSING;

    public constructor() {
        super();
        Object.setPrototypeOf(this, CommandRegisterClassMalformedOrMissingError.prototype);
    }
}
