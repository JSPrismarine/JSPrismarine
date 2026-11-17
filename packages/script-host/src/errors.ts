import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

/** What a script's uncaught error reported: its name, message and stack as the engine saw them. */
export interface ScriptErrorDetails {
    readonly scriptName: string;
    readonly scriptMessage: string;
    readonly scriptStack: string;
}

/**
 * The values a `ScriptError` is made from: the details its fields read, and the script's error as
 * it prints for the message.
 * @param details - What the engine reported.
 */
export const scriptErrorParams = (details: ScriptErrorDetails) => ({
    ...details,
    error: details.scriptName === '' ? details.scriptMessage : `${details.scriptName}: ${details.scriptMessage}`
});

/** Where a Script API member sits: its module, its class (empty for a module function) and its name. */
export interface ScriptApiMemberName {
    readonly module: string;
    /** The class or error; empty for a module-level function. */
    readonly owner: string;
    readonly member: string;
}

/**
 * A script used a Script API member that the pinned BDS has and JSPrismarine does not implement
 * yet. It reaches the script as an `Error` named `NotImplementedError`.
 */
export class NotImplementedError extends ScriptHostErrors.NotImplemented implements ScriptApiMemberName {
    public override readonly name = 'NotImplementedError';
    public readonly module: string;
    public readonly owner: string;
    public readonly member: string;

    /**
     * @param name - The member.
     * @param access - `set` for a property's setter, which is implemented apart from its getter.
     */
    public constructor(name: ScriptApiMemberName, access?: 'set') {
        const label = name.owner === '' ? name.member : `${name.owner}.${name.member}`;
        super({ member: `${label}${access === 'set' ? ' (setter)' : ''}`, module: name.module });
        this.module = name.module;
        this.owner = name.owner;
        this.member = name.member;
    }
}

/** The value of a field a Script API error carries, such as `ArgumentOutOfBoundsError.index`. */
export type ScriptApiErrorField = string | number | boolean | undefined;

/**
 * Thrown by a member's implementation to throw one of the API's own error classes in the script,
 * such as `LocationInUnloadedChunkError`, with the fields its properties read.
 */
export class ScriptApiError extends ScriptHostErrors.ApiError {
    public override readonly name = 'ScriptApiError';
    /** The error class's module. */
    public readonly errorModule: string;
    /** The error class's name. */
    public readonly errorClass: string;
    public readonly fields: Readonly<Record<string, ScriptApiErrorField>>;

    /**
     * @param errorModule - The module that declares the error class, such as `@minecraft/server`.
     * @param errorClass - The error class, such as `LocationInUnloadedChunkError`.
     * @param message - The message the script sees.
     * @param fields - Values for the error's properties.
     */
    public constructor(
        errorModule: string,
        errorClass: string,
        message: string,
        fields: Readonly<Record<string, ScriptApiErrorField>> = {}
    ) {
        super({ message });
        this.errorModule = errorModule;
        this.errorClass = errorClass;
        this.fields = fields;
    }
}
