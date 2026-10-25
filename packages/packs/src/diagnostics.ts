/** How much a diagnostic matters: an error fails a strict load, a warning never does. */
export type DiagnosticSeverity = 'error' | 'warning';

/** One finding reported while loading a pack stack. */
export interface Diagnostic {
    severity: DiagnosticSeverity;
    /** A stable machine-readable code, such as `manifest.invalid` or `definition.unknown-key`. */
    code: string;
    /** The name of the pack the finding belongs to, or its source path before the manifest is read. */
    pack: string;
    /** The file within the pack, when the finding concerns one file; the first file when several share the finding. */
    path?: string;
    message: string;
    /** How many files the finding covers. Set only on a collapsed diagnostic, so one file reports no count. */
    occurrences?: number;
    /** The first {@link COLLAPSED_PATH_LIMIT} files the finding covers, in report order. Set with `occurrences`. */
    paths?: readonly string[];
}

/** How many file paths a collapsed diagnostic names before it only counts. */
export const COLLAPSED_PATH_LIMIT = 5;

/**
 * Collects diagnostics for one load, collapsing repeats so a pack-wide
 * pattern, such as an unknown component name in every file of a pack, is one
 * line of the report rather than thousands.
 *
 * The collapsing key is the pack, the code and the message, and `path` stays
 * out of it on purpose: a per-file code would otherwise defeat the
 * collapsing, and the file is what repeats. So that a collapsed diagnostic
 * still leads to the files, it carries `occurrences` and the first few
 * `paths`, which is the information a reader needs without making the report
 * length grow with the pack.
 */
export class DiagnosticCollector {
    private readonly byKey = new Map<string, Diagnostic>();
    private readonly collected: Diagnostic[] = [];

    /**
     * Adds a diagnostic. A repeat of a pack, code and message already
     * reported collapses into the first one, raising its `occurrences` and
     * listing its file.
     */
    public add(diagnostic: Diagnostic): void {
        const key = `${diagnostic.pack}\u0000${diagnostic.code}\u0000${diagnostic.message}`;
        const collapsed = this.byKey.get(key);
        if (collapsed) {
            collapsed.occurrences = (collapsed.occurrences ?? 1) + 1;
            collapsed.paths = withPath(collapsed.paths ?? listed(collapsed.path), diagnostic.path);
            return;
        }

        // A copy, because collapsing a later repeat writes to the stored one.
        const stored = { ...diagnostic };
        this.byKey.set(key, stored);
        this.collected.push(stored);
    }

    /** The diagnostics reported so far, in report order. */
    public get diagnostics(): readonly Diagnostic[] {
        return this.collected;
    }
}

const listed = (path: string | undefined): readonly string[] => (path === undefined ? [] : [path]);

/** Adds one more file to a collapsed diagnostic, up to the limit. */
const withPath = (paths: readonly string[], path: string | undefined): readonly string[] => {
    if (path === undefined || paths.includes(path) || paths.length >= COLLAPSED_PATH_LIMIT) return paths;
    return [...paths, path];
};
