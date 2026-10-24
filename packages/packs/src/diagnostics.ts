/** How much a diagnostic matters: an error fails a strict load, a warning never does. */
export type DiagnosticSeverity = 'error' | 'warning';

/** One finding reported while loading a pack stack. */
export interface Diagnostic {
    severity: DiagnosticSeverity;
    /** A stable machine-readable code, such as `manifest.invalid` or `definition.unknown-key`. */
    code: string;
    /** The name of the pack the finding belongs to, or its source path before the manifest is read. */
    pack: string;
    /** The file within the pack, when the finding concerns one file. */
    path?: string;
    message: string;
}

/**
 * Collects diagnostics for one load, deduplicating repeats so a pack-wide
 * pattern, such as an unknown component name, is reported once per pack.
 */
export class DiagnosticCollector {
    private readonly seen = new Set<string>();
    private readonly collected: Diagnostic[] = [];

    /** Adds a diagnostic unless an identical pack, code and message were already reported. */
    public add(diagnostic: Diagnostic): void {
        const key = `${diagnostic.pack}\u0000${diagnostic.code}\u0000${diagnostic.message}`;
        if (this.seen.has(key)) return;
        this.seen.add(key);
        this.collected.push(diagnostic);
    }

    /** The diagnostics reported so far, in report order. */
    public get diagnostics(): readonly Diagnostic[] {
        return this.collected;
    }
}
