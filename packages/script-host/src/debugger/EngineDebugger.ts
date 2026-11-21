/**
 * The engine half of the script debugger: breakpoints, stepping and the queries a debugger makes
 * of a stopped script, over the `jsh_debug_` functions of the C layer.
 */

import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import type { NativePointer, NativeSymbols } from '../ffi';
import { ScriptHandle, ValueReader, ValueWriter } from '../values';
import type { ScriptValue, TransferBuffer } from '../values';

/** Why a script stopped, by the `jsh_debug_reason` code the engine sends. */
export const PauseReason = ['breakpoint', 'step', 'exception', 'pause'] as const;

/** Why a script stopped: at a breakpoint, after a step, on a thrown value, or on request. */
export type PauseReason = (typeof PauseReason)[number];

/** How a stopped script goes on, by its `jsh_debug_resume` code. */
export const ResumeMode = { continue: 0, stepOver: 1, stepIn: 2, stepOut: 3 } as const;

/** How a stopped script goes on. */
export type ResumeMode = keyof typeof ResumeMode;

/** The variables of a frame, by their `jsh_debug_scope` code. */
export const ScopeKind = { local: 0, closure: 1, global: 2 } as const;

/** Which variables of a frame a scope holds: its own, those it closes over, or the global object. */
export type ScopeKind = keyof typeof ScopeKind;

/** What the host does with a script once it has handled a stop. */
export type PauseOutcome = 'resume' | 'terminate';

/**
 * Receives the engine's debugger events. Both run synchronously on the engine's thread, inside the
 * engine call that runs the script, so the script and everything waiting on it stay blocked.
 */
export interface DebuggerListener {
    /**
     * The script stopped. The listener reads it through the {@link EngineDebugger}, calls
     * {@link EngineDebugger.resume} to say how it goes on, and returns. Returning `'terminate'`
     * stops the script as if it had run out of steps.
     */
    paused(reason: PauseReason): PauseOutcome;
    /**
     * A running script has passed the number of lines the debugger polls at. The listener reads
     * what the debugger has sent without waiting, and must not run script.
     */
    poll(): void;
}

/** One frame of a stopped script's stack. */
export interface DebugFrame {
    /** The function's name, empty for an anonymous one. */
    readonly name: string;
    /** The file name, as the script's stack traces show it; empty for a native frame. */
    readonly file: string;
    /** The 1-based line, 0 in a native frame. */
    readonly line: number;
    /** The 1-based column, 0 in a native frame. */
    readonly column: number;
}

/** The kinds of value {@link EngineDebugger.describe} tells apart. */
export type DescribedKind = 'object' | 'array' | 'function' | 'error' | 'proxy' | 'symbol' | 'bigint';

/** A value the engine described without running script. */
export interface ValueDescription {
    readonly kind: DescribedKind;
    /** A constructor's or function's name, a symbol's description or a bigint's digits. */
    readonly name: string | undefined;
    /** An array's length or an error's message. */
    readonly detail: string | number | undefined;
}

/** One own property of an object, read without running its getter. */
export interface DebugProperty {
    readonly name: string;
    /** True for a getter or setter, whose value the debugger never reads. */
    readonly accessor: boolean;
    /** The value, which the caller frees when it is a handle. Undefined for an accessor. */
    readonly value: ScriptValue;
}

/** A page of an object's own properties. */
export interface PropertyPage {
    /** How many own properties the object has in all. */
    readonly total: number;
    readonly properties: readonly DebugProperty[];
}

/** What a debugger needs of its engine; {@link ScriptEngine} provides it. */
export interface DebuggerHost {
    readonly native: NativeSymbols;
    readonly buffer: TransferBuffer;
    /** The engine's pointer, or a throw once it has been destroyed. */
    pointer(): NativePointer;
    /** Turns a negative status into the error the engine described. */
    check(result: number): number;
    /** Reads a result handle's value, freeing the handle unless the value is an object. */
    take(handle: number): ScriptValue;
    /** Tells the engine the debugger has detached. */
    detached(): void;
}

const kinds: readonly DescribedKind[] = ['object', 'array', 'function', 'error', 'proxy', 'symbol', 'bigint'];

const isKind = (kind: string): kind is DescribedKind => kinds.some((known) => known === kind);

/**
 * A debugger attached to one engine. While it is attached, every function the engine enters
 * reports its lines, and the engine stops at breakpoints, after steps, on pause requests and,
 * when asked, on thrown values. A stop calls {@link DebuggerListener.paused} and blocks until it
 * returns. Stopping and the queries leave the script's step counts as they were, so a script
 * stopped under the debugger still stops at the same step as one that is not.
 */
export class EngineDebugger {
    private readonly host: DebuggerHost;
    private attached = true;

    /** Use `ScriptEngine.attachDebugger`. */
    public constructor(host: DebuggerHost) {
        this.host = host;
    }

    /** Whether the debugger is still attached. */
    public get isAttached(): boolean {
        return this.attached;
    }

    /**
     * Replaces the breakpoints of one file.
     * @param file - The file name, as the script's stack traces show it.
     * @param lines - The 1-based lines to stop at; an empty list clears the file.
     * @returns How many breakpoints were set.
     */
    public setBreakpoints(file: string, lines: readonly number[]): number {
        const writer = new ValueWriter(this.host.buffer).list(lines);
        return this.host.check(this.host.native.jsh_debug_set_breakpoints(this.live(), file, writer.length));
    }

    /** Stops the script on every value it throws, caught or not, while `stop` is true. */
    public setStopOnException(stop: boolean): void {
        this.host.native.jsh_debug_set_stop_on_exception(this.live(), stop ? 1 : 0);
    }

    /** Stops the running script at its next line, or the next script the engine runs at its first. */
    public pause(): void {
        this.host.native.jsh_debug_pause(this.live());
    }

    /**
     * Says how the stopped script goes on once the listener returns.
     * @throws {RangeError} When no script is stopped.
     */
    public resume(mode: ResumeMode): void {
        this.host.check(this.host.native.jsh_debug_resume(this.live(), ResumeMode[mode]));
    }

    /** The stack of the stopped script, innermost frame first. */
    public frames(): DebugFrame[] {
        const length = this.host.check(this.host.native.jsh_debug_frames(this.live()));
        const values = new ValueReader(this.host.buffer.bytes, length).list();
        const frames: DebugFrame[] = [];
        for (let index = 0; index + 3 < values.length; index += 4) {
            const [name, file, line, column] = values.slice(index, index + 4);
            frames.push({
                name: typeof name === 'string' ? name : '',
                file: typeof file === 'string' ? file : '',
                line: typeof line === 'number' ? line : 0,
                column: typeof column === 'number' ? column : 0
            });
        }
        return frames;
    }

    /**
     * Returns an object holding a frame's variables, which the caller frees. The local and closure
     * scopes are copies: writing to them does not change the script. {@link evaluate} does.
     * @param frame - The frame's index in {@link frames}.
     */
    public scope(frame: number, kind: ScopeKind): ScriptHandle {
        return new ScriptHandle(this.host.check(this.host.native.jsh_debug_scope(this.live(), frame, ScopeKind[kind])));
    }

    /** The value the script stopped on when it stopped for `'exception'`, or undefined. */
    public exception(): ScriptValue {
        return this.host.take(this.host.check(this.host.native.jsh_debug_exception(this.live())));
    }

    /**
     * Runs source as if the function in a frame ran it, with its variables in scope, so an
     * assignment changes the script's variable. It gets a step budget of its own, and the stopped
     * script keeps its step counts.
     * @param frame - The frame's index in {@link frames}, or -1 to run it as a global script.
     * @returns The completion value. A handle in it belongs to the caller, who frees it.
     * @throws {ScriptError} When the source throws or runs out of its budget.
     */
    public evaluate(frame: number, source: string): ScriptValue {
        const text = Buffer.from(`${source}\0`, 'utf8');
        return this.host.take(
            this.host.check(this.host.native.jsh_debug_evaluate(this.live(), frame, text, text.length - 1))
        );
    }

    /** Describes a handle's value without running script. */
    public describe(handle: ScriptHandle): ValueDescription {
        const length = this.host.check(this.host.native.jsh_debug_describe(this.live(), handle.id));
        const reader = new ValueReader(this.host.buffer.bytes, length);
        const kind = reader.string();
        const name = reader.value();
        const detail = reader.value();
        return {
            kind: isKind(kind) ? kind : 'object',
            name: typeof name === 'string' ? name : undefined,
            detail: typeof detail === 'string' || typeof detail === 'number' ? detail : undefined
        };
    }

    /**
     * Reads a page of an object's own properties without running a getter. Array indices come
     * first. A proxy reports none, since reading it would run its handler.
     * @param start - The index of the first property to read.
     * @param count - How many to read at most.
     */
    public properties(handle: ScriptHandle, start = 0, count = Number.MAX_SAFE_INTEGER): PropertyPage {
        const limit = Math.min(count, 0x7fffffff);
        const length = this.host.check(this.host.native.jsh_debug_properties(this.live(), handle.id, start, limit));
        const reader = new ValueReader(this.host.buffer.bytes, length);
        const total = reader.value();
        const properties: DebugProperty[] = [];
        while (!reader.done) {
            const name = reader.string();
            const accessor = reader.value() === 1;
            properties.push({ name, accessor, value: reader.value() });
        }
        return { total: typeof total === 'number' ? total : properties.length, properties };
    }

    /** Detaches: the engine forgets the breakpoints and runs as if no debugger had attached. */
    public detach(): void {
        if (!this.attached) return;
        this.attached = false;
        this.host.native.jsh_debug_detach(this.host.pointer());
        this.host.detached();
    }

    private live(): NativePointer {
        if (!this.attached) throw new ScriptHostErrors.DebuggerDetached();
        return this.host.pointer();
    }
}
