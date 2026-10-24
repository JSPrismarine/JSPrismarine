/** What a diagnostic reports. */
export type DiagnosticCode = 'syntax-error' | 'unknown-query' | 'unknown-math-function' | 'client-only-resource';

/**
 * A problem found while parsing or binding an expression. The engine raises content errors for
 * these and still evaluates the expression to 0.0; this package mirrors that and reports the
 * problem here instead of throwing.
 */
export interface Diagnostic {
    code: DiagnosticCode;
    message: string;
}
