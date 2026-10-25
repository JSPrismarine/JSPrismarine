/**
 * The mcfunction runtime, joined to the command dispatcher.
 *
 * `@jsprismarine/mcfunction` runs functions and implements no command;
 * `@jsprismarine/commands` implements commands and knows nothing of
 * functions. This is the one place that holds both: the executor's
 * `CommandRunner` is the vanilla dispatcher, and the command source a
 * function's lines run with is the one `/function` was typed with, made
 * silent the way Java makes it.
 *
 * Vanilla ships no functions in either edition, so nothing here is on the
 * path of a vanilla server. What it buys is a third-party Java datapack, and
 * that is why [the plan](../../../../../docs/plans/data-driven-vanilla.md)
 * schedules it in phase 5 rather than early.
 */
import type { CommandSource, FunctionOutcome } from '@jsprismarine/commands';
import type { CommandOutcome, Diagnostic, ExecutionLimits, ExecutionReport } from '@jsprismarine/mcfunction';
import { FunctionExecutor, LOAD_FUNCTION_TAG, TICK_FUNCTION_TAG } from '@jsprismarine/mcfunction';

import type { ServerFunctions } from './load';
import { FunctionSchedule } from './schedule';
import type { ScheduleMode } from './schedule';
import { readMacroArguments } from './snbt';

/**
 * How deep a `/function` may nest when the nesting goes back through the
 * dispatcher rather than through the executor's own queue.
 *
 * A `function` line inside a function is control flow the executor reads
 * itself, so it stays on the executor's heap-allocated frame stack and is
 * bounded by `maxCommandSequenceLength`. `execute ... run function` is not:
 * it is a command, so it re-enters this runtime through a command body and
 * each level costs real JavaScript stack. Java has no such split, because
 * its `ExecutionContext` carries both, so this cap exists only to keep a
 * mutually recursive pack from overflowing the host stack before the
 * operation limit can stop it.
 */
export const MAX_NESTED_FUNCTION_DISPATCH = 64;

/** What a call that never reached a function reports. */
const NOTHING_RAN = { commands: 0, result: 0, matched: false } as const;

/**
 * What one call did, which is what `/function` and `execute if function`
 * read, plus the line count a tick reports.
 */
export interface FunctionRunOutcome extends FunctionOutcome {
    /**
     * How many command lines reached the dispatcher. The same as `result`
     * for a function that never reached a `/return`, and the honest number
     * for one that did.
     */
    readonly commands: number;
}

/** How to build a {@link FunctionRuntime}. */
export interface FunctionRuntimeOptions {
    /** The functions and tags the pack stack holds; see {@link loadServerFunctions}. */
    readonly loaded: ServerFunctions;
    /**
     * Runs one command line against a source, which is the server's vanilla
     * dispatcher. Injected rather than imported so the runtime is testable
     * without a dispatcher, and so nothing here depends on how a dispatch
     * reports its results.
     */
    readonly dispatch: (commandLine: string, source: CommandSource) => CommandOutcome;
    /** Where a diagnostic goes. The server sends these to its log. */
    readonly report: (diagnostic: Diagnostic) => void;
    /** Overrides the two gamerule limits; see `DEFAULT_EXECUTION_LIMITS`. */
    readonly limits?: Partial<ExecutionLimits>;
}

/**
 * Runs functions, and remembers the ones `/schedule` put off until later.
 *
 * Built once per content build, because the compiled functions it runs are.
 * A reload replaces it rather than mutating it, which also drops whatever was
 * scheduled against the functions that no longer exist.
 */
export class FunctionRuntime {
    private readonly executor: FunctionExecutor<CommandSource>;

    private readonly schedule = new FunctionSchedule();

    private readonly report: (diagnostic: Diagnostic) => void;

    /** How many `/function` calls are on the JavaScript stack right now. */
    private depth = 0;

    /**
     * What a `/return` on the line being dispatched asked for, waiting to be
     * reported back to the executor.
     *
     * A field rather than a return value because `/return` reaches this
     * runtime through the command host, several frames below the dispatch
     * that is running the line. One field serves every nesting level: the
     * innermost dispatch is the one that clears it, so a `/return` always
     * ends the function whose line it was on.
     */
    private pendingReturn: { readonly value?: number } | undefined;

    public constructor(private readonly options: FunctionRuntimeOptions) {
        this.report = options.report;
        this.executor = new FunctionExecutor<CommandSource>({
            functions: options.loaded.functions,
            tags: options.loaded.tags,
            parseArguments: readMacroArguments,
            ...(options.limits === undefined ? {} : { limits: options.limits }),
            runner: {
                run: (commandLine, context) => {
                    this.pendingReturn = undefined;
                    try {
                        const outcome = options.dispatch(commandLine, context.source);
                        const returned = this.pendingReturn;
                        return returned === undefined ? outcome : { ...outcome, returned };
                    } catch (error: unknown) {
                        // Rethrown rather than swallowed: the executor records
                        // the failure against the function and line it came
                        // from, which is more than this frame knows.
                        throw error instanceof Error ? error : new Error(String(error));
                    } finally {
                        this.pendingReturn = undefined;
                    }
                }
            }
        });

        for (const diagnostic of options.loaded.diagnostics) this.report(diagnostic);
    }

    /** How many functions the stack registered. */
    public get size(): number {
        return this.options.loaded.functions.size;
    }

    /** Every function id the stack registered. */
    public ids(): readonly string[] {
        return this.options.loaded.functions.ids();
    }

    /** Every function tag id the stack declares. */
    public tagIds(): readonly string[] {
        return this.options.loaded.tagIds;
    }

    /** Whether a reference names something that exists: a function, or a declared tag. */
    public has(reference: string): boolean {
        if (reference.startsWith('#')) return this.options.loaded.tags.get(reference.slice(1)) !== undefined;
        return this.options.loaded.functions.get(reference) !== undefined;
    }

    /**
     * Runs one function or one function tag.
     *
     * @param reference - A function id, or a tag written `#namespace:tag`.
     * @param source - What `/function` was typed with. Every line runs with it
     *   made silent, as Java runs a function's output.
     * @param argumentText - The macro argument compound, as SNBT.
     * @returns What `/function` reports and whether `execute if function`
     *   matches. A function that does not exist ran nothing and matched
     *   nothing.
     */
    public run(reference: string, source: CommandSource, argumentText?: string): FunctionRunOutcome {
        if (this.depth >= MAX_NESTED_FUNCTION_DISPATCH) {
            this.report({
                severity: 'error',
                code: 'limit.command-sequence-length',
                message: `${reference} nested more than ${MAX_NESTED_FUNCTION_DISPATCH} functions deep through /execute and was stopped`
            });
            return NOTHING_RAN;
        }

        let macroArguments: Record<string, unknown> | undefined;
        if (argumentText !== undefined && argumentText.trim().length > 0) {
            macroArguments = readMacroArguments(argumentText);
            if (macroArguments === undefined) {
                this.report({
                    severity: 'error',
                    code: 'call.invalid-arguments',
                    message: `the arguments of /function ${reference} are not a compound this runtime can read`
                });
                return NOTHING_RAN;
            }
        }

        this.depth += 1;
        try {
            return this.finish(
                this.executor.run(reference, {
                    source: source.withSilent(true),
                    ...(macroArguments === undefined ? {} : { arguments: macroArguments })
                })
            );
        } finally {
            this.depth -= 1;
        }
    }

    /**
     * Queues a function for later.
     *
     * @returns True always, matching Java: a `/schedule` of a function that
     *   does not exist yet is legal, because a later pack reload may provide
     *   it before the call comes due.
     */
    public queue(reference: string, delayTicks: number, mode: ScheduleMode): boolean {
        this.schedule.add(reference, delayTicks, mode);
        return true;
    }

    /**
     * Drops every pending call of one reference.
     *
     * @returns How many were dropped.
     */
    public clearQueue(reference: string): number {
        return this.schedule.clear(reference);
    }

    /** How many calls are waiting on the schedule. */
    public get queued(): number {
        return this.schedule.size;
    }

    /**
     * Records a `/return`, which ends the function the running line belongs
     * to.
     *
     * @param value - What the function returns, or undefined for the two
     *   forms that end it without a value.
     * @returns What the `/return` line itself reports.
     * @throws {Error} When no function is running. Java refuses a `/return`
     *   typed at a console the same way, and the dispatcher turns this into
     *   the message the sender sees.
     */
    public requestReturn(value: number | undefined): number {
        if (this.depth === 0) throw new Error('/return can only be used inside a function');

        this.pendingReturn = value === undefined ? {} : { value };
        return value ?? 0;
    }

    /**
     * Runs `#minecraft:load`, which a server does once after its packs load.
     *
     * @returns How many command lines ran.
     */
    public runLoad(source: CommandSource): number {
        if (this.options.loaded.tags.get(LOAD_FUNCTION_TAG) === undefined) return 0;
        return this.run(`#${LOAD_FUNCTION_TAG}`, source).commands;
    }

    /**
     * One server tick: whatever `/schedule` put on this tick, then
     * `#minecraft:tick`.
     *
     * Schedules first, which is Java's order. Both are skipped outright when
     * nothing is waiting and no pack declared the tag, so a server with no
     * datapack pays a map lookup per tick and nothing else.
     *
     * @returns How many command lines ran across everything this tick.
     */
    public tick(source: CommandSource): number {
        let commands = 0;
        for (const reference of this.schedule.advance()) commands += this.run(reference, source).commands;
        if (this.options.loaded.tags.get(TICK_FUNCTION_TAG) !== undefined) {
            commands += this.run(`#${TICK_FUNCTION_TAG}`, source).commands;
        }
        return commands;
    }

    /**
     * Reports what a run found and reads the two answers a command wants out
     * of it.
     *
     * `result` follows Java 1.20.3: the `/return` value when a function
     * reached one, and the number of command lines run when none did. A tag
     * whose members each returned contributes their sum, and matches when
     * any of them returned something other than zero.
     */
    private finish(report: ExecutionReport): FunctionRunOutcome {
        for (const diagnostic of report.diagnostics) this.report(diagnostic);

        const returned = report.returnValues;
        return {
            commands: report.commands,
            result: returned.length === 0 ? report.commands : returned.reduce((sum, value) => sum + value, 0),
            matched: returned.some((value) => value !== 0)
        };
    }
}
