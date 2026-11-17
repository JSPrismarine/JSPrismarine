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
