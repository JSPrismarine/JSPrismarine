/**
 * The report shape this package uses.
 *
 * It matches `@jsprismarine/packs`, so a caller can concatenate a load report
 * and a resolve report into one list, but this package declares it rather than
 * importing it. A domain can build its types from generated Java data with no
 * pack involved, so the content runtime must not depend on the pack loader.
 */

/**
 * How much a finding matters. An error means content was dropped; a warning
 * means it loaded with something unhandled. A strict resolve fails on either,
 * which is what `@jsprismarine/packs` does too.
 */
export type DiagnosticSeverity = 'error' | 'warning';

/** One finding reported while resolving content. */
export interface Diagnostic {
    severity: DiagnosticSeverity;
    /** A stable machine-readable code, such as `component.unknown` or `tag.cycle`. */
    code: string;
    /** The name of the pack the finding belongs to. */
    pack: string;
    /** The file within the pack, when the finding concerns one file. */
    path?: string;
    message: string;
}
