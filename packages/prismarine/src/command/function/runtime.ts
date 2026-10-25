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
import type { CommandSource } from '@jsprismarine/commands';
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
 * each level costs real JavaScript stack. Java has no such split - its
 * `ExecutionContext` carries both - so this cap exists only to keep a
 * mutually recursive pack from overflowing the host stack before the
 * operation limit can stop it.
 */
export const MAX_NESTED_FUNCTION_DISPATCH = 64;

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

    public constructor(private readonly options: FunctionRuntimeOptions) {
        this.report = options.report;
        this.executor = new FunctionExecutor<CommandSource>({
            functions: options.loaded.functions,
            tags: options.loaded.tags,
            parseArguments: readMacroArguments,
            ...(options.limits === undefined ? {} : { limits: options.limits }),
            runner: {
                run: (commandLine, context) => {
                    try {
                        return options.dispatch(commandLine, context.source);
                    } catch (error: unknown) {
                        // Rethrown rather than swallowed: the executor records
                        // the failure against the function and line it came
                        // from, which is more than this frame knows.
                        throw error instanceof Error ? error : new Error(String(error));
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
     * @returns How many command lines ran, which is what `/function` reports
     *   and what `execute store result` captures. Zero means nothing ran,
     *   including when the function does not exist.
     */
    public run(reference: string, source: CommandSource, argumentText?: string): number {
        if (this.depth >= MAX_NESTED_FUNCTION_DISPATCH) {
            this.report({
                severity: 'error',
                code: 'limit.command-sequence-length',
                message: `${reference} nested more than ${MAX_NESTED_FUNCTION_DISPATCH} functions deep through /execute and was stopped`
            });
            return 0;
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
                return 0;
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

    /** Runs `#minecraft:load`, which a server does once after its packs load. */
    public runLoad(source: CommandSource): number {
        if (this.options.loaded.tags.get(LOAD_FUNCTION_TAG) === undefined) return 0;
        return this.run(`#${LOAD_FUNCTION_TAG}`, source);
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
        for (const reference of this.schedule.advance()) commands += this.run(reference, source);
        if (this.options.loaded.tags.get(TICK_FUNCTION_TAG) !== undefined) {
            commands += this.run(`#${TICK_FUNCTION_TAG}`, source);
        }
        return commands;
    }

    /** Reports what a run found and answers with the count a command returns. */
    private finish(report: ExecutionReport): number {
        for (const diagnostic of report.diagnostics) this.report(diagnostic);
        return report.commands;
    }
}
