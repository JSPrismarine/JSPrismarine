/**
 * The report shape this package uses, declared rather than imported so a
 * caller can concatenate a pack load report, a content resolve report and an
 * entity parse report into one list.
 */

/** How much a finding matters. An error drops content; a warning loads it with something unhandled. */
export type DiagnosticSeverity = 'error' | 'warning';

/** One finding reported while parsing or resolving an entity definition. */
export interface Diagnostic {
    severity: DiagnosticSeverity;
    /** A stable machine-readable code, such as `entity.unknownKey`. */
    code: string;
    /** The name of the pack the finding belongs to, or the identifier when no pack is known. */
    pack: string;
    /** The file within the pack, when the finding concerns one file. */
    path?: string;
    message: string;
}

/** Collects diagnostics and drops exact repeats, so one bad pack reports once. */
export class DiagnosticCollector {
    private readonly seen = new Set<string>();
    private readonly list: Diagnostic[] = [];

    /** Every diagnostic added so far, in order. */
    public get diagnostics(): readonly Diagnostic[] {
        return this.list;
    }

    /** Adds one finding unless the same pack, code and message were already reported. */
    public add(diagnostic: Diagnostic): void {
        const key = `${diagnostic.pack}\u0000${diagnostic.code}\u0000${diagnostic.message}`;
        if (this.seen.has(key)) return;
        this.seen.add(key);
        this.list.push(diagnostic);
    }
}
