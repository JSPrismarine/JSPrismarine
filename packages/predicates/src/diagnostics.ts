/** How much a diagnostic matters to the caller. */
export type DiagnosticSeverity = 'error' | 'warning';

/** One problem found while parsing or evaluating a predicate, modifier or provider. */
export interface Diagnostic {
    readonly severity: DiagnosticSeverity;
    /** Dotted path to the offending JSON member, for example `terms[1].predicate`. */
    readonly path: string;
    readonly message: string;
}

/**
 * Gathers problems instead of throwing, so a malformed datapack reports every
 * fault in one pass. Parse faults and evaluation faults share one collector,
 * because a host usually wants both in the same report.
 */
export class DiagnosticCollector {
    /** Every diagnostic reported so far, in the order it was reported. */
    public readonly entries: Diagnostic[] = [];

    /** Records a fault that makes the parsed value unusable or an evaluation give up. */
    public error(path: string, message: string): void {
        this.entries.push({ severity: 'error', path, message });
    }

    /** Records a fault the evaluator recovered from, such as a grammar member it does not implement. */
    public warn(path: string, message: string): void {
        this.entries.push({ severity: 'warning', path, message });
    }

    /** The subset of {@link entries} with `error` severity. */
    public get errors(): readonly Diagnostic[] {
        return this.entries.filter((entry) => entry.severity === 'error');
    }
}
