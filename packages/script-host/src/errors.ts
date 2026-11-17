/** What a script's uncaught error reported: its name, message and stack as the engine saw them. */
export interface ScriptErrorDetails {
    readonly scriptName: string;
    readonly scriptMessage: string;
    readonly scriptStack: string;
}

/** A script threw, and nothing in the script caught it. */
export class ScriptError extends Error implements ScriptErrorDetails {
    public override readonly name: string = 'ScriptError';
    public readonly scriptName: string;
    public readonly scriptMessage: string;
    public readonly scriptStack: string;

    public constructor(details: ScriptErrorDetails) {
        super(details.scriptName === '' ? details.scriptMessage : `${details.scriptName}: ${details.scriptMessage}`);
        this.scriptName = details.scriptName;
        this.scriptMessage = details.scriptMessage;
        this.scriptStack = details.scriptStack;
    }
}

/**
 * A script ran out of its step budget. The engine stopped it with an error no script can catch,
 * at the same step on every run.
 */
export class ScriptTerminatedError extends ScriptError {
    public override readonly name: string = 'ScriptTerminatedError';
}

/** A script went over the engine's memory limit, and the error reached the host. */
export class ScriptOutOfMemoryError extends ScriptError {
    public override readonly name: string = 'ScriptOutOfMemoryError';
}

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
export class NotImplementedError extends Error implements ScriptApiMemberName {
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
        super(`${label}${access === 'set' ? ' (setter)' : ''} from ${name.module} is not implemented`);
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
export class ScriptApiError extends Error {
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
        super(message);
        this.errorModule = errorModule;
        this.errorClass = errorClass;
        this.fields = fields;
    }
}
