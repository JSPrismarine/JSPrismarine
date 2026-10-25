/**
 * The seam between this package and the commands. This package runs functions
 * and never implements a command: every line it does not handle itself goes to
 * a {@link CommandRunner}, which is where the server's Brigadier dispatcher
 * plugs in.
 */

/** What a command is told about the line it was reached from. */
export interface CommandContext<TSource = unknown> {
    /** Whatever the server uses as a command source, passed through untouched. */
    source: TSource;
    /** The namespaced id of the function the line belongs to. */
    functionId: string;
    /** The 1-based line of that function's file. */
    line: number;
}

/** What a command reports back. */
export interface CommandOutcome {
    /** The command's integer result, as Brigadier defines it. Defaults to 0. */
    result?: number;
    /**
     * How many contexts the command created, which is what `maxCommandForks`
     * counts. `execute as @e` with five matching entities reports 5. A command
     * that runs in one context reports nothing.
     */
    forks?: number;
    /**
     * Set when the line ended the function it belongs to, which is what
     * `/return` does. The executor drops that function's remaining lines and
     * carries on with whatever called it.
     *
     * `value` is what the function returns. `/return fail`, and a
     * `/return run` whose command failed, end the function without one, which
     * is the case `execute if function` does not match.
     */
    returned?: { readonly value?: number };
}

/** Runs one command line. The server's dispatcher is the real adapter at this seam. */
export interface CommandRunner<TSource = unknown> {
    /**
     * Runs one command, written without a leading slash.
     *
     * The runtime never calls this with a command the line format already
     * handles, so a `function` line never reaches it. Throwing is allowed: the
     * executor catches it, reports it, and carries on with the next line, the
     * way one failing command does not abort a Java function.
     */
    run(commandLine: string, context: CommandContext<TSource>): CommandOutcome;
}

/** One command a {@link RecordingCommandRunner} was asked to run. */
export interface RecordedCommand<TSource = unknown> {
    commandLine: string;
    context: CommandContext<TSource>;
}

/**
 * A runner that records what it was asked to run instead of running it. It is
 * the second adapter at the command seam: tests and pack authors use it to
 * check what a function would execute without a world to execute it against.
 *
 * @example
 * ```ts
 * const runner = new RecordingCommandRunner();
 * new FunctionExecutor({ functions, runner }).run('pack:greet', { source: console });
 * expect(runner.commandLines).toEqual(['say hello']);
 * ```
 */
export class RecordingCommandRunner<TSource = unknown> implements CommandRunner<TSource> {
    /** Every command handed to the runner, in execution order. */
    public readonly recorded: RecordedCommand<TSource>[] = [];

    public constructor(
        /** Decides what each command reports back. Everything succeeds with no forks by default. */
        private readonly respond: (commandLine: string, context: CommandContext<TSource>) => CommandOutcome = () => ({})
    ) {}

    /** Records the command and returns whatever the configured response says. */
    public run(commandLine: string, context: CommandContext<TSource>): CommandOutcome {
        this.recorded.push({ commandLine, context });
        return this.respond(commandLine, context);
    }

    /** The recorded command text, in execution order. */
    public get commandLines(): readonly string[] {
        return this.recorded.map((entry) => entry.commandLine);
    }

    /** Forgets everything recorded so far. */
    public clear(): void {
        this.recorded.length = 0;
    }
}
