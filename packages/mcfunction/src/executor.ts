/**
 * The executor. Java rewrote function execution in 23w41a from a recursive
 * call path into an explicit queue of frames on the heap, which is what lets
 * it bound work with a counter and stops a tail-recursive pack from
 * exhausting the host stack. This is the same shape: a stack of frames in an
 * array, one loop, and a counter charged per operation.
 */

import type { CompiledFunction, InstantiatedCommand } from './compile';
import type { Diagnostic } from './diagnostics';
import type { FunctionReference } from './identifiers';
import { parseFunctionReference } from './identifiers';
import type { MacroArguments } from './macro';
import type { CommandOutcome, CommandRunner } from './runner';
import type { FunctionTagLookup } from './tags';
import { LOAD_FUNCTION_TAG, TICK_FUNCTION_TAG, resolveFunctionTag } from './tags';

/**
 * The two gamerules that bound a run. They were renamed in 1.21.11 from
 * `maxCommandChainLength` and `maxCommandForkCount`; anything written against
 * the camelCase names is stale.
 */
export interface ExecutionLimits {
    /** `minecraft:max_command_sequence_length`: how many operations one entry point may run. */
    maxCommandSequenceLength: number;
    /** `minecraft:max_command_forks`: how many contexts one entry point may create. */
    maxCommandForks: number;
}

/**
 * The limits a run uses when the caller sets none.
 *
 * Both default to 65536. Mojang has never published either default: the
 * figure has two independent secondary confirmations (minecraft.wiki's
 * gamerule page and Pumpkin's extraction from the 26.3 server jar) and the
 * `GameRules` class holds 65536 in its constant pool, but no Mojang document
 * attributes the value to either rule. Treat it as a well-corroborated
 * default rather than a confirmed one, and configure it when a world says
 * otherwise.
 */
export const DEFAULT_EXECUTION_LIMITS: ExecutionLimits = {
    maxCommandSequenceLength: 65_536,
    maxCommandForks: 65_536
};

/**
 * What Bedrock caps a single `/function` call at, from Mojang's creator
 * documentation. This runtime runs Java functions and does not apply it; a
 * server that wants Bedrock's ceiling passes it as `maxCommandSequenceLength`.
 */
export const BEDROCK_MAX_COMMANDS_PER_FUNCTION = 10_000;

/** Where the executor reads compiled functions from. */
export interface FunctionLookup {
    /** Returns the function registered under a namespaced id. */
    get(id: string): CompiledFunction | undefined;
}

/** How to build a {@link FunctionExecutor}. */
export interface FunctionExecutorOptions<TSource = unknown> {
    functions: FunctionLookup;
    runner: CommandRunner<TSource>;
    /** Resolves `#namespace:tag` references. Without it, a tag reference is reported as unknown. */
    tags?: FunctionTagLookup;
    /** Overrides either limit; anything left out keeps its {@link DEFAULT_EXECUTION_LIMITS} value. */
    limits?: Partial<ExecutionLimits>;
    /**
     * Reads the argument compound of a `function <id> <arguments>` line. The
     * default accepts JSON, because SNBT needs a parser this package does not
     * own; a server with one passes it here.
     */
    parseArguments?: (text: string) => MacroArguments | undefined;
}

/** What one call needs beyond the function to run. */
export interface ExecutionOptions<TSource = unknown> {
    /** The command source every command in the run is given. */
    source: TSource;
    /** The compound a macro function substitutes from. Ignored by a plain function. */
    arguments?: MacroArguments;
}

/** Why a run stopped before it finished. */
export type ExecutionStop = 'max-command-sequence-length' | 'max-command-forks';

/** What one run did. */
export interface ExecutionReport {
    /** Operations charged against `maxCommandSequenceLength`. */
    operations: number;
    /** Contexts charged against `maxCommandForks`. */
    forks: number;
    /** How many command lines reached the runner. */
    commands: number;
    /** How many functions the run invoked, including the entry point. */
    invocations: number;
    /** The deepest the frame stack got. A tail call does not deepen it. */
    maxDepth: number;
    /**
     * The values `/return` produced, one per function the entry point
     * invoked directly that reached one.
     *
     * Empty when every function ran to its last line, which is the case Java
     * calls "returned no value". A tag contributes one entry per member that
     * returned, because `execute if function #tag` matches when any member
     * did. A `/return` deeper in the call tree ends its own function and
     * leaves nothing here, the way Java returns from one function rather
     * than from its caller.
     */
    returnValues: readonly number[];
    /** Set when a limit stopped the run; the matching diagnostic carries the detail. */
    stopped?: ExecutionStop;
    diagnostics: readonly Diagnostic[];
}

/** One function in progress: its remaining commands and where it is in them. */
interface Frame {
    functionId: string;
    commands: readonly InstantiatedCommand[];
    index: number;
    /**
     * Whether the entry point invoked this function itself, which is what
     * decides whose `/return` the run reports. A tail call inherits it: the
     * replacement runs in the frame it replaced, so its return is that
     * function's last act.
     */
    root: boolean;
}

const CALL_PATTERN = /^function[ \t]+(\S+)[ \t]*([\s\S]*)$/;

/** Reads a JSON object as an argument compound; anything else is rejected. */
const parseJsonArguments = (text: string): MacroArguments | undefined => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return undefined;
    }
    // JSON.parse is a parsed-input boundary, so narrow rather than assert.
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
    return { ...parsed };
};

/**
 * Runs functions against a command runner.
 *
 * One executor is reusable: it holds no run state, so a server builds it once
 * at load and calls {@link FunctionExecutor.runTick} every tick.
 *
 * `function <id>` and `function #tag` are the only lines the executor reads
 * itself, because a call is control flow rather than a command: handling it
 * here is what keeps nesting on the queue instead of on the JavaScript stack.
 * Every other line goes to the runner untouched.
 *
 * `/return` is the other half of that split. It is a command, so the runner
 * implements it, but only the executor can act on it: a runner that reports
 * {@link CommandOutcome.returned} ends the function the line came from and
 * the loop carries on with its caller.
 */
export class FunctionExecutor<TSource = unknown> {
    private readonly limits: ExecutionLimits;

    private readonly parseArguments: (text: string) => MacroArguments | undefined;

    public constructor(private readonly options: FunctionExecutorOptions<TSource>) {
        this.limits = { ...DEFAULT_EXECUTION_LIMITS, ...options.limits };
        this.parseArguments = options.parseArguments ?? parseJsonArguments;
    }

    /** Runs `minecraft:load`, which a server does once after its packs load. */
    public runLoad(options: ExecutionOptions<TSource>): ExecutionReport {
        return this.run(`#${LOAD_FUNCTION_TAG}`, options);
    }

    /** Runs `minecraft:tick`, which a server does once per server tick. */
    public runTick(options: ExecutionOptions<TSource>): ExecutionReport {
        return this.run(`#${TICK_FUNCTION_TAG}`, options);
    }

    /**
     * Runs one function or every function in one tag.
     *
     * Everything a call reaches shares one budget, so the report covers the
     * whole tree below the entry point. A limit stops the run and is reported
     * as a diagnostic; nothing here throws, and a command that throws is
     * reported and skipped.
     *
     * @param reference - A function id, or a tag id written `#namespace:tag`.
     */
    public run(reference: string, options: ExecutionOptions<TSource>): ExecutionReport {
        const diagnostics: Diagnostic[] = [];
        const state = { operations: 0, forks: 0, commands: 0, invocations: 0, maxDepth: 0 };
        const stack: Frame[] = [];
        const returnValues: number[] = [];

        const parsed = parseFunctionReference(reference);
        if (!parsed) {
            diagnostics.push({
                severity: 'error',
                code: 'call.unknown-function',
                message: `'${reference}' is not a valid function reference`
            });
            return { ...state, returnValues, diagnostics };
        }

        let stopped: ExecutionStop | undefined;

        /** Charges one operation, reporting and stopping the run at the limit. */
        const charge = (functionId: string, line?: number): boolean => {
            state.operations += 1;
            if (state.operations <= this.limits.maxCommandSequenceLength) return true;
            stopped = 'max-command-sequence-length';
            diagnostics.push({
                severity: 'error',
                code: 'limit.command-sequence-length',
                functionId,
                line,
                message: `the run reached maxCommandSequenceLength (${this.limits.maxCommandSequenceLength}) and stopped`
            });
            return false;
        };

        /** Instantiates one call and pushes its frame, or reports why it could not. */
        const invoke = (
            id: string,
            args: MacroArguments | undefined,
            from: { functionId: string; line?: number },
            root = false
        ): boolean => {
            const compiled = this.options.functions.get(id);
            if (!compiled) {
                diagnostics.push({
                    severity: 'error',
                    code: 'call.unknown-function',
                    functionId: from.functionId,
                    line: from.line,
                    message: `the function ${id} does not exist`
                });
                return true;
            }

            if (!charge(from.functionId, from.line)) return false;
            state.invocations += 1;

            const instantiated = compiled.instantiate(args);
            if (!instantiated.ok) {
                diagnostics.push({
                    severity: 'error',
                    code: 'macro.missing-arguments',
                    functionId: id,
                    line: instantiated.line,
                    message: instantiated.message
                });
                return true;
            }

            // A call made from the last line of a frame replaces that frame
            // instead of stacking on it, so a tail-recursive function runs in
            // constant depth, as Java's rewrite made it in 23w44a.
            const top = stack.at(-1);
            const replaced = top && top.index >= top.commands.length ? stack.pop() : undefined;

            stack.push({
                functionId: id,
                commands: instantiated.commands,
                index: 0,
                root: replaced?.root ?? root
            });
            state.maxDepth = Math.max(state.maxDepth, stack.length);
            return true;
        };

        const entries = parsed.kind === 'function' ? [parsed.id] : this.resolveTag(parsed.id, reference, diagnostics);

        // Frames run from the top of the stack, so the first function of a tag
        // is pushed last.
        for (const id of [...entries].reverse()) {
            if (!invoke(id, options.arguments, { functionId: reference }, true)) break;
        }

        while (stopped === undefined && stack.length > 0) {
            const frame = stack.at(-1);
            if (!frame) break;
            if (frame.index >= frame.commands.length) {
                stack.pop();
                continue;
            }

            const entry = frame.commands[frame.index];
            frame.index += 1;
            if (!entry) continue;
            if (!charge(frame.functionId, entry.line)) break;

            const call = CALL_PATTERN.exec(entry.command);
            if (call) {
                this.handleCall(call, frame, entry, invoke, diagnostics);
                continue;
            }

            state.commands += 1;
            let forks = 0;
            let returned: CommandOutcome['returned'];
            try {
                const outcome = this.options.runner.run(entry.command, {
                    source: options.source,
                    functionId: frame.functionId,
                    line: entry.line
                });
                forks = outcome.forks ?? 0;
                returned = outcome.returned;
            } catch (error) {
                diagnostics.push({
                    severity: 'error',
                    code: 'command.failed',
                    functionId: frame.functionId,
                    line: entry.line,
                    message: error instanceof Error ? error.message : String(error)
                });
            }

            if (returned !== undefined) {
                // `/return` ends this function and no other: its caller's
                // frame is still below and runs on from where it called.
                if (frame.root && returned.value !== undefined) returnValues.push(returned.value);
                if (stack.at(-1) === frame) stack.pop();
            }

            state.forks += forks;
            if (state.forks > this.limits.maxCommandForks) {
                stopped = 'max-command-forks';
                diagnostics.push({
                    severity: 'error',
                    code: 'limit.command-forks',
                    functionId: frame.functionId,
                    line: entry.line,
                    message: `the run reached maxCommandForks (${this.limits.maxCommandForks}) and stopped`
                });
                break;
            }
        }

        return { ...state, returnValues, ...(stopped ? { stopped } : {}), diagnostics };
    }

    /** Expands a tag reference, reporting a tag no pack declared. */
    private resolveTag(id: string, reference: string, diagnostics: Diagnostic[]): readonly string[] {
        if (!this.options.tags) {
            diagnostics.push({
                severity: 'error',
                code: 'call.unknown-tag',
                message: `${reference} is a tag reference, and this executor has no tag lookup`
            });
            return [];
        }

        const resolved = resolveFunctionTag(this.options.tags, id);
        diagnostics.push(...resolved.diagnostics);
        return resolved.functions;
    }

    /** Runs one `function` line: resolves what it names and pushes the frames it invokes. */
    private handleCall(
        call: RegExpExecArray,
        frame: Frame,
        entry: InstantiatedCommand,
        invoke: (id: string, args: MacroArguments | undefined, from: { functionId: string; line?: number }) => boolean,
        diagnostics: Diagnostic[]
    ): void {
        const from = { functionId: frame.functionId, line: entry.line };
        const target: FunctionReference | undefined = parseFunctionReference(call[1] ?? '');
        if (!target) {
            diagnostics.push({
                severity: 'error',
                code: 'call.unknown-function',
                ...from,
                message: `'${call[1] ?? ''}' is not a valid function reference`
            });
            return;
        }

        const argumentText = (call[2] ?? '').trim();
        let args: MacroArguments | undefined;
        if (argumentText.length > 0) {
            args = this.parseArguments(argumentText);
            if (args === undefined) {
                diagnostics.push({
                    severity: 'error',
                    code: 'call.invalid-arguments',
                    ...from,
                    message: `the arguments of '${entry.command}' are not a compound this runtime can read`
                });
                return;
            }
        }

        if (target.kind === 'function') {
            invoke(target.id, args, from);
            return;
        }

        const tags = this.options.tags;
        if (!tags) {
            diagnostics.push({
                severity: 'error',
                code: 'call.unknown-tag',
                ...from,
                message: `#${target.id} cannot be resolved, because this executor has no tag lookup`
            });
            return;
        }

        const resolved = resolveFunctionTag(tags, target.id);
        diagnostics.push(...resolved.diagnostics.map((diagnostic) => ({ ...diagnostic, ...from })));
        if (!resolved.exists) {
            diagnostics.push({
                severity: 'error',
                code: 'call.unknown-tag',
                ...from,
                message: `the function tag #${target.id} does not exist`
            });
            return;
        }

        for (const id of [...resolved.functions].reverse()) {
            if (!invoke(id, args, from)) break;
        }
    }
}
