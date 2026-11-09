/**
 * GitHub Actions workflow commands, the `::notice file=…::message` lines a job prints to raise an
 * annotation.
 *
 * Values are escaped as the runner expects: a message may not carry `%`, a carriage return or a
 * newline, and a property also may not carry `:` or `,`, which would end it early.
 */
import { isAbsolute, relative } from 'node:path';

/** The annotation a command raises. */
export type AnnotationLevel = 'notice' | 'warning' | 'error';

/** Where an annotation points, and what it is called. */
export interface AnnotationProperties {
    /** The file, absolute or relative to the workspace; made relative so GitHub can link it. */
    readonly file?: string;
    /** The line in `file` the annotation is drawn on. */
    readonly line?: number;
    /** The annotation's heading. */
    readonly title?: string;
}

const escapeData = (value: string): string =>
    value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');

const escapeProperty = (value: string): string => escapeData(value).replaceAll(':', '%3A').replaceAll(',', '%2C');

/** A path as GitHub links it: relative to the workspace, with forward slashes. */
const workspacePath = (file: string): string => {
    const root = process.env.GITHUB_WORKSPACE ?? process.cwd();
    const path = isAbsolute(file) ? relative(root, file) : file;
    return path.replaceAll('\\', '/');
};

/**
 * The command line that raises one annotation.
 *
 * @example
 * ```typescript
 * annotation('error', 'Critical error statement', { file: 'app.js', line: 12 });
 * // '::error file=app.js,line=12::Critical error statement'
 * ```
 */
export const annotation = (level: AnnotationLevel, message: string, properties: AnnotationProperties = {}): string => {
    const fields = [
        properties.file === undefined ? undefined : `file=${escapeProperty(workspacePath(properties.file))}`,
        properties.line === undefined ? undefined : `line=${properties.line}`,
        properties.title === undefined ? undefined : `title=${escapeProperty(properties.title)}`
    ].filter((field) => field !== undefined);
    const head = fields.length === 0 ? `::${level}` : `::${level} ${fields.join(',')}`;
    return `${head}::${escapeData(message)}`;
};
