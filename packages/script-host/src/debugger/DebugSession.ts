/**
 * One debugger connection, from the handshake to the detach, run on the engine's thread. It
 * answers the VS Code extension's requests from an {@link EngineDebugger}, and blocks the thread
 * while a script is stopped. The bytes travel elsewhere: a {@link DebuggerChannel} hands this
 * session whole messages.
 */

import type { ScriptEngine } from '../ScriptEngine';
import { ScriptError } from '../errors';
import type { ScriptHandle } from '../values';
import type { ScriptValue } from '../values';
import type { EngineDebugger, PauseOutcome, PauseReason, ResumeMode, ScopeKind } from './EngineDebugger';
import {
    DEBUGGER_PROTOCOL_VERSION,
    DebuggerMessages,
    LogLevel,
    parseExtensionMessage,
    requestedBreakpointLines
} from './protocol';
import type { DebuggerEvent, DebuggerPlugin, ExtensionMessage, ForwardedRequest, HostMessage } from './protocol';

/**
 * Carries whole messages between a session and the extension. A session calls it only on the
 * engine's thread.
 */
export interface DebuggerChannel {
    /** Sends one message to the extension. */
    send(message: HostMessage): void;
    /** Returns the next message, waiting as long as it takes; undefined once the connection has closed. */
    receive(): unknown;
    /** Returns the next message if one has arrived, without waiting; undefined otherwise. */
    poll(): unknown;
}

/** How a {@link ScriptDebugSession} presents the world's scripts to the extension. */
export interface DebugSessionOptions {
    /** The script packs the extension may pick, by the UUID of each pack's script module. */
    readonly plugins: readonly DebuggerPlugin[];
    /** The `script-debugger-passcode` the extension must send. None when absent or empty. */
    readonly passcode?: string;
    /** The thread id the extension shows for the scripts. */
    readonly threadId?: number;
    /** Turns an engine file name into the path the extension knows it by. The same name when absent. */
    readonly toDebuggerPath?: (file: string) => string;
    /** Turns a path from the extension into the engine's file name. The same path when absent. */
    readonly fromDebuggerPath?: (path: string) => string;
    /** Whether the engine knows a file, so a breakpoint in it is verified. Every file when absent. */
    readonly knowsFile?: (file: string) => boolean;
    /** Runs a command the extension's command box sent, in the named dimension. */
    readonly runCommand?: (command: string, dimension: string) => void;
    /** The lines a running script runs between polls, {@link DebuggerOptions.pollLines}. */
    readonly pollLines?: number;
}

/** Why a debugger connection was refused, with Bedrock Dedicated Server's message for it. */
export class DebuggerConnectionError extends Error {
    public override readonly name = 'DebuggerConnectionError';
}

/** The thread id a session reports when none is given. */
export const DEFAULT_THREAD_ID = 1;

/** What a `variablesReference` names during one stop. */
type Reference =
    | { readonly kind: 'scope'; readonly frame: number; readonly scope: ScopeKind }
    | { readonly kind: 'value'; readonly handle: ScriptHandle };

/** A variable as the extension's `variables` and `evaluate` bodies carry it (koush's `js_debugger_get_variable`). */
interface VariableBody {
    readonly name: string;
    readonly value: string;
    readonly type: string;
    readonly variablesReference: number;
    readonly indexedVariables?: number;
}

const scopeNames: Readonly<Record<ScopeKind, string>> = { local: 'Local', closure: 'Closure', global: 'Global' };

const resumeCommands: Readonly<Record<string, ResumeMode>> = {
    continue: 'continue',
    next: 'stepOver',
    stepIn: 'stepIn',
    stepOut: 'stepOut'
};

/**
 * One debugger connection over a {@link DebuggerChannel}. The world host runs {@link handshake},
 * then {@link attach} with the engine of the pack the extension picked, then calls {@link poll}
 * between ticks until the connection closes or {@link detach} ends it. Every method blocks the
 * calling thread for as long as the extension keeps a script stopped, which is how a stopped
 * script stops its world's tick.
 */
export class ScriptDebugSession {
    private readonly channel: DebuggerChannel;
    private readonly options: DebugSessionOptions;
    private readonly threadId: number;
    private engine: ScriptEngine | undefined;
    private debug: EngineDebugger | undefined;
    private closedValue = false;
    /** The reason the script is stopped for, while it is. */
    private stopped: PauseReason | undefined;
    /** Set while a script runs and polls, when no request may run script. */
    private running = false;
    private resumeMode: ResumeMode | undefined;
    private terminateRequested = false;
    private references = new Map<number, Reference>();
    private nextReference = 1;

    public constructor(channel: DebuggerChannel, options: DebugSessionOptions) {
        this.channel = channel;
        this.options = options;
        this.threadId = options.threadId ?? DEFAULT_THREAD_ID;
    }

    /** Whether the connection has closed or the session has detached. */
    public get closed(): boolean {
        return this.closedValue;
    }

    /**
     * Offers the protocol and the plugins, and checks the extension's answer as Bedrock Dedicated
     * Server does: the same version, the passcode when one is set, and a target among the plugins.
     * @returns The script module UUID the extension picked, lowercase, or undefined when it picked none.
     * @throws {DebuggerConnectionError} With Bedrock Dedicated Server's message when the answer is refused or never comes.
     */
    public handshake(): string | undefined {
        const passcode = this.options.passcode ?? '';
        this.event({
            type: 'ProtocolEvent',
            version: DEBUGGER_PROTOCOL_VERSION,
            plugins: this.options.plugins,
            ...(passcode === '' ? {} : { require_passcode: true })
        });
        for (;;) {
            const message = this.next(this.channel.receive());
            if (message === undefined) throw new DebuggerConnectionError('The debugger closed the connection');
            if (message.type !== 'protocol') continue;
            if (message.version !== DEBUGGER_PROTOCOL_VERSION) {
                throw new DebuggerConnectionError(DebuggerMessages.versionMismatch);
            }
            if (passcode !== '' && message.passcode !== passcode) {
                throw new DebuggerConnectionError(DebuggerMessages.passcodeMismatch);
            }
            const target = message.targetModuleUuid?.toLowerCase();
            if (
                target !== undefined &&
                !this.options.plugins.some((plugin) => plugin.module_uuid.toLowerCase() === target)
            ) {
                throw new DebuggerConnectionError(DebuggerMessages.noPlugin(message.targetModuleUuid ?? ''));
            }
            return target;
        }
    }

    /**
     * Attaches to the engine of the picked pack, and handles the extension's configuration, its
     * breakpoints and exception setting, until it sends `resume`. The engine runs no script until then.
     */
    public attach(engine: ScriptEngine): void {
        if (this.engine !== undefined) throw new Error('The session is already attached to an engine');
        this.engine = engine;
        this.debug = engine.attachDebugger(
            { paused: (reason) => this.paused(reason), poll: () => this.pollRunning() },
            { pollLines: this.options.pollLines }
        );
        this.event({ type: 'ThreadEvent', reason: 'new', thread: this.threadId });
        for (;;) {
            const message = this.next(this.channel.receive());
            if (message === undefined) return;
            if (message.type === 'resume') return;
            this.handle(message);
        }
    }

    /**
     * Handles what the extension has sent while no script ran, without waiting. A pause request
     * stops the next script the engine runs at its first line.
     */
    public poll(): void {
        for (
            let message = this.next(this.channel.poll());
            message !== undefined;
            message = this.next(this.channel.poll())
        ) {
            this.handle(message);
        }
    }

    /** Shows script output in the extension's debug console. */
    public print(message: string, logLevel: number = LogLevel.log): void {
        if (!this.closedValue) this.event({ type: 'PrintEvent', message, logLevel });
    }

    /** Detaches from the engine and tells the extension the scripts' thread has exited. */
    public detach(): void {
        if (this.closedValue) return;
        if (this.debug !== undefined) this.event({ type: 'ThreadEvent', reason: 'exited', thread: this.threadId });
        this.close();
    }

    /** Ends the session after the connection closed or the session detached. */
    private close(): void {
        this.closedValue = true;
        this.releaseReferences();
        if (this.debug?.isAttached === true) this.debug.detach();
        this.debug = undefined;
    }

    /** Parses a received message; marks the session closed when there is none because the connection closed. */
    private next(message: unknown): ExtensionMessage | undefined {
        if (message === undefined) return undefined;
        try {
            return parseExtensionMessage(message);
        } catch {
            return { type: 'other', name: '' };
        }
    }

    /** The engine's stop: tells the extension, then answers it until it resumes or goes away. */
    private paused(reason: PauseReason): PauseOutcome {
        this.stopped = reason;
        this.resumeMode = undefined;
        this.terminateRequested = false;
        this.event({ type: 'StoppedEvent', reason, thread: this.threadId });
        while (this.resumeMode === undefined && !this.closedValue) {
            const received = this.channel.receive();
            if (received === undefined) {
                this.close();
                break;
            }
            const message = this.next(received);
            if (message !== undefined) this.handle(message);
        }
        this.releaseReferences();
        this.stopped = undefined;
        if (this.debug?.isAttached === true) this.debug.resume(this.resumeMode ?? 'continue');
        return this.terminateRequested ? 'terminate' : 'resume';
    }

    /** The engine's poll while a script runs: handles what has arrived without running script. */
    private pollRunning(): void {
        this.running = true;
        try {
            this.poll();
        } finally {
            this.running = false;
        }
    }

    private handle(message: ExtensionMessage): void {
        switch (message.type) {
            case 'request':
                this.request(message.request);
                return;
            case 'breakpoints':
                this.setBreakpoints(message.path, message.lines);
                return;
            case 'stopOnException':
                this.debug?.setStopOnException(message.stop);
                return;
            case 'resume':
                if (this.stopped !== undefined) this.resumeMode = 'continue';
                return;
            case 'minecraftCommand':
                this.options.runCommand?.(message.command, message.dimension);
                return;
            case 'debugger-request':
                this.channel.send({
                    type: 'debuggee-response',
                    event: {
                        type: 'debuggee-response',
                        request_seq: message.request_seq,
                        success: false,
                        response_message: `JSPrismarine does not support the debugger request '${message.request}'.`
                    }
                });
                return;
            default:
                return;
        }
    }

    private request(request: ForwardedRequest): void {
        try {
            const mode = resumeCommands[request.command];
            if (mode !== undefined) {
                this.requireStopped();
                this.resumeMode = mode;
                this.respond(request, undefined);
                return;
            }
            switch (request.command) {
                case 'setBreakpoints': {
                    const path = typeof request.args.path === 'string' ? request.args.path : '';
                    const lines = requestedBreakpointLines(request.args);
                    const verified = this.setBreakpoints(path, lines);
                    this.respond(request, { breakpoints: lines.map(() => ({ verified })) });
                    return;
                }
                case 'pause':
                    this.respond(request, undefined);
                    if (this.stopped !== undefined) {
                        this.event({ type: 'StoppedEvent', reason: 'pause', thread: this.threadId });
                    } else {
                        this.debug?.pause();
                    }
                    return;
                case 'stackTrace':
                    this.respond(request, this.stackTrace());
                    return;
                case 'scopes':
                    this.respond(request, this.scopes(request.args));
                    return;
                case 'variables':
                    this.respond(request, this.variables(request.args));
                    return;
                case 'evaluate':
                    this.respond(request, this.evaluate(request.args));
                    return;
                default:
                    throw new Error(`JSPrismarine does not handle the debugger command '${request.command}'`);
            }
        } catch (error) {
            this.channel.send({
                type: 'response',
                request_seq: request.request_seq,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    private setBreakpoints(path: string, lines: readonly number[]): boolean {
        const file = this.options.fromDebuggerPath?.(path) ?? path;
        this.debug?.setBreakpoints(file, lines);
        return this.options.knowsFile?.(file) ?? true;
    }

    private requireStopped(): EngineDebugger {
        if (this.stopped === undefined || this.debug === undefined) throw new Error('No script is stopped');
        return this.debug;
    }

    /** The `stackTrace` body: koush's frame objects, innermost first, with their index as id. */
    private stackTrace(): object[] {
        return this.requireStopped()
            .frames()
            .map((frame, id) => ({
                id,
                name: frame.name === '' ? '<anonymous>' : frame.name,
                filename: frame.file === '' ? '' : (this.options.toDebuggerPath?.(frame.file) ?? frame.file),
                line: frame.line,
                column: frame.column
            }));
    }

    /** The `scopes` body, which the extension reads as `{ name, reference, expensive }` objects. */
    private scopes(args: Record<string, unknown>): object[] {
        this.requireStopped();
        const frame = typeof args.frameId === 'number' ? args.frameId : 0;
        return (['local', 'closure', 'global'] as const).map((scope) => ({
            name: scopeNames[scope],
            reference: this.reference({ kind: 'scope', frame, scope }),
            expensive: scope === 'global'
        }));
    }

    /** The `variables` body: one page of an object's or a scope's properties. */
    private variables(args: Record<string, unknown>): VariableBody[] {
        const debug = this.requireStopped();
        const id = typeof args.variablesReference === 'number' ? args.variablesReference : 0;
        const reference = this.references.get(id);
        if (reference === undefined) throw new Error(`No variables have reference ${id}`);
        const handle = reference.kind === 'value' ? reference.handle : debug.scope(reference.frame, reference.scope);
        if (reference.kind === 'scope') this.references.set(id, { kind: 'value', handle });

        const description = debug.describe(handle);
        const indexed = description.kind === 'array' && typeof description.detail === 'number' ? description.detail : 0;
        const start = typeof args.start === 'number' ? args.start : 0;
        const count = typeof args.count === 'number' && args.count > 0 ? args.count : undefined;
        const page =
            args.filter === 'indexed'
                ? debug.properties(handle, start, count ?? indexed)
                : debug.properties(handle, args.filter === 'named' ? indexed : 0);

        const variables: VariableBody[] = [];
        if (
            reference.kind === 'scope' &&
            reference.scope === 'local' &&
            reference.frame === 0 &&
            this.stopped === 'exception'
        ) {
            variables.push(this.variable('<exception>', debug.exception()));
        }
        for (const property of page.properties) {
            variables.push(
                property.accessor
                    ? { name: property.name, value: '(accessor)', type: 'accessor', variablesReference: 0 }
                    : this.variable(property.name, property.value)
            );
        }
        return variables;
    }

    /** The `evaluate` body. A failed evaluation is a result too: the extension never answers an error here. */
    private evaluate(args: Record<string, unknown>): object {
        if (this.running || this.debug === undefined) throw new Error('A running script cannot evaluate');
        const expression = typeof args.expression === 'string' ? args.expression : '';
        const frame = this.stopped !== undefined && typeof args.frameId === 'number' ? args.frameId : -1;
        try {
            const { value, type, variablesReference, indexedVariables } = this.variable(
                '',
                this.debug.evaluate(frame, expression)
            );
            return {
                result: value,
                type,
                variablesReference,
                ...(indexedVariables === undefined ? {} : { indexedVariables })
            };
        } catch (error) {
            if (!(error instanceof ScriptError)) throw error;
            const text = error.scriptName === '' ? error.scriptMessage : `${error.scriptName}: ${error.scriptMessage}`;
            return { result: text, type: 'error', variablesReference: 0 };
        }
    }

    /** Formats a value as VS Code shows it, giving an object a reference to expand it by. */
    private variable(name: string, value: ScriptValue): VariableBody {
        if (value === undefined) return { name, value: 'undefined', type: 'undefined', variablesReference: 0 };
        if (value === null) return { name, value: 'null', type: 'null', variablesReference: 0 };
        if (typeof value === 'boolean') return { name, value: String(value), type: 'boolean', variablesReference: 0 };
        if (typeof value === 'number') {
            return { name, value: Object.is(value, -0) ? '-0' : String(value), type: 'number', variablesReference: 0 };
        }
        if (typeof value === 'string')
            return { name, value: JSON.stringify(value), type: 'string', variablesReference: 0 };

        if (this.debug === undefined) throw new Error('The session has detached');
        const { kind, name: label, detail } = this.debug.describe(value);
        if (kind === 'symbol' || kind === 'bigint') {
            this.engine?.free(value);
            const text = kind === 'bigint' ? `${label ?? ''}n` : (label ?? 'Symbol()');
            return { name, value: text, type: kind, variablesReference: 0 };
        }
        const reference = kind === 'proxy' ? 0 : this.reference({ kind: 'value', handle: value });
        if (kind === 'proxy') this.engine?.free(value);
        switch (kind) {
            case 'array':
                return {
                    name,
                    value: `${label ?? 'Array'}(${detail ?? 0})`,
                    type: label ?? 'Array',
                    variablesReference: reference,
                    indexedVariables: typeof detail === 'number' ? detail : 0
                };
            case 'function':
                return {
                    name,
                    value: `function ${label ?? ''}`.trimEnd(),
                    type: 'function',
                    variablesReference: reference
                };
            case 'error':
                return {
                    name,
                    value:
                        detail === undefined || detail === '' ? (label ?? 'Error') : `${label ?? 'Error'}: ${detail}`,
                    type: label ?? 'Error',
                    variablesReference: reference
                };
            default:
                return { name, value: label ?? 'Object', type: label ?? 'object', variablesReference: reference };
        }
    }

    private reference(reference: Reference): number {
        const id = this.nextReference++;
        this.references.set(id, reference);
        return id;
    }

    /** Frees every handle the stop handed out; references last only until the script goes on. */
    private releaseReferences(): void {
        for (const reference of this.references.values()) {
            if (reference.kind === 'value') this.engine?.free(reference.handle);
        }
        this.references = new Map();
        this.nextReference = 1;
    }

    private respond(request: ForwardedRequest, body: unknown): void {
        this.channel.send({ type: 'response', request_seq: request.request_seq, body });
    }

    private event(event: DebuggerEvent): void {
        this.channel.send({ type: 'event', event });
    }
}
