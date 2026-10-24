/**
 * What this runtime reports instead of throwing. Loading a pack, compiling a
 * function and running one are all best-effort: a broken file or a tripped
 * limit produces a diagnostic and the rest of the work continues, the way the
 * Java server logs a function it could not load and keeps the server running.
 */

/** How serious a diagnostic is. An error means the affected function did not load or did not run. */
export type DiagnosticSeverity = 'error' | 'warning';

/** The problems this package reports. */
export type DiagnosticCode =
    /** A line started with `//`, which is not a comment marker in mcfunction. */
    | 'line.double-slash-comment'
    /** A line started with `/`, which mcfunction does not use. */
    | 'line.leading-slash'
    /** A line was longer than {@link MAX_COMMAND_LENGTH}. */
    | 'line.too-long'
    /** The file ended with a line continuation that had nothing to continue into. */
    | 'line.dangling-continuation'
    /** A macro line was malformed: a bad variable name, an unterminated `$(`, or no substitution at all. */
    | 'macro.invalid'
    /** A macro function was called without the arguments its substitutions need. */
    | 'macro.missing-arguments'
    /** A `function` line named a function that is not registered. */
    | 'call.unknown-function'
    /** A `function` line named a tag that the tag lookup does not know. */
    | 'call.unknown-tag'
    /** A `function` line carried an argument compound that could not be parsed. */
    | 'call.invalid-arguments'
    /** The command runner threw while running a line. */
    | 'command.failed'
    /** A function tag referenced itself through a chain of tags. */
    | 'tag.cycle'
    /** A tag entry named a required function or tag that does not exist. */
    | 'tag.missing-entry'
    /** Execution stopped because it reached `maxCommandSequenceLength`. */
    | 'limit.command-sequence-length'
    /** Execution stopped because it reached `maxCommandForks`. */
    | 'limit.command-forks'
    /** A file under `function/` could not be decoded or routed to an identifier. */
    | 'load.invalid-file';

/** One reported problem, carrying enough location to find it in a pack. */
export interface Diagnostic {
    severity: DiagnosticSeverity;
    code: DiagnosticCode;
    message: string;
    /** The namespaced id of the function the problem is in, when there is one. */
    functionId?: string;
    /** The 1-based line number inside that function, when the problem has one. */
    line?: number;
    /** The name of the pack the file came from, for problems found while loading. */
    pack?: string;
}

/** Collects diagnostics in report order. */
export class DiagnosticCollector {
    /** Everything reported so far, in the order it was reported. */
    public readonly diagnostics: Diagnostic[] = [];

    /** Records one diagnostic. */
    public add(diagnostic: Diagnostic): void {
        this.diagnostics.push(diagnostic);
    }

    /** Whether any recorded diagnostic is an error. */
    public get hasErrors(): boolean {
        return this.diagnostics.some((diagnostic) => diagnostic.severity === 'error');
    }
}
