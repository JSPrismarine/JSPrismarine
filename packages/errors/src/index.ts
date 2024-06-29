import { BuiltinError } from './error';

export enum ErrorKind {
    GENERIC_NAMESPACE_INVALID = 'GENERIC_NAMESPACE_INVALID',

    CONFIG_INVALID_DATA = 'CONFIG_INVALID_DATA',

    COMMAND_UNKNOWN_COMMAND = 'COMMAND_UNKNOWN_COMMAND',
    COMMAND_REGISTER_CLASS_MALFORMED_OR_MISSING = 'COMMAND_REGISTER_CLASS_MALFORMED_OR_MISSING',

    PLAYER_NOT_FOUND = 'PLAYER_NOT_FOUND',

    GAMETYPE_INVALID = 'GAMETYPE_INVALID'
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
    name: string = 'GenericNamespaceInvalidError';
    message: string = `The namespace is malformed or invalid.`;
    code: ErrorKind = ErrorKind.GENERIC_NAMESPACE_INVALID;

    public constructor() {
        super();
        Object.setPrototypeOf(this, GenericNamespaceInvalidError.prototype);
    }
}

export class ConfigInvalidDataError extends Error {
    name: string = 'ConfigInvalidDataError';
    message: string = `Invalid data provided to a config handler.`;
    code: ErrorKind = ErrorKind.CONFIG_INVALID_DATA;

    public constructor() {
        super();
        Object.setPrototypeOf(this, ConfigInvalidDataError.prototype);
    }
}

export class CommandUnknownCommandError extends Error {
    name: string = 'CommandUnknownCommandError';
    message: string = `Unknown command.`;
    code: ErrorKind = ErrorKind.COMMAND_UNKNOWN_COMMAND;

    public constructor() {
        super();
        Object.setPrototypeOf(this, CommandUnknownCommandError.prototype);
    }
}

export class CommandRegisterClassMalformedOrMissingError extends Error {
    name: string = 'CommandRegisterClassMalformedOrMissingError';
    message: string = `Command class is malformed or missing.`;
    code: ErrorKind = ErrorKind.COMMAND_REGISTER_CLASS_MALFORMED_OR_MISSING;

    public constructor() {
        super();
        Object.setPrototypeOf(this, CommandRegisterClassMalformedOrMissingError.prototype);
    }
}

export class PlayerNotFoundError extends Error {
    name: string = 'PlayerNotFoundError';
    message: string = `Player not found.`;
    code: ErrorKind = ErrorKind.PLAYER_NOT_FOUND;

    public constructor(username?: string) {
        super();
        Object.setPrototypeOf(this, PlayerNotFoundError.prototype);

        if (username) {
            this.message = `Player "${username}" not found.`;
        }
    }
}

export class GametypeInvalidError extends Error {
    name: string = 'GametypeInvalidError';
    message: string = `Unknown or invalid game type.`;
    code: ErrorKind = ErrorKind.PLAYER_NOT_FOUND;

    public constructor(gametype?: string) {
        super();
        Object.setPrototypeOf(this, GametypeInvalidError.prototype);

        if (gametype) {
            this.message = `Gametype "${gametype}" is not a valid game type.`;
        }
    }
}
