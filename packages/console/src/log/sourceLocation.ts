import { columns } from '../text';

/** A source file and the one-based editor position recorded in a log line. */
export interface SourceLocation {
    /** Absolute or source-root-relative file path. */
    path: string;
    /** One-based line number. */
    line: number;
    /** One-based column number. */
    column: number;
}

const SOURCE_REFERENCE = /(?:[A-Za-z]:[\\/]|\/)?(?:[\w.@+%-]+[\\/])*[\w.@+%-]+\.[\w-]+:\d+:\d+/g;
const LOCATION_SUFFIX = /^(.*\.[\w-]+):(\d+):(\d+)$/;

/** Returns the source location in a namespace when verbose logging supplied one. */
export function sourceLocationFromNamespace(namespace: string): SourceLocation | undefined {
    const match = LOCATION_SUFFIX.exec(namespace);
    if (!match?.[1] || !match[2] || !match[3]) return undefined;
    return { path: match[1], line: Number(match[2]), column: Number(match[3]) };
}

/**
 * The name the namespace column shows: the file's name without its extension when verbose
 * logging made the namespace a location such as `world/World.js:412:17`, which would otherwise
 * be cut before anything that tells two rows apart. Other namespaces show as they are.
 */
export function namespaceLabel(namespace: string): string {
    const location = sourceLocationFromNamespace(namespace);
    if (location === undefined) return namespace;
    const file = location.path.slice(location.path.replaceAll('\\', '/').lastIndexOf('/') + 1);
    return file.replace(/\.[\w-]+$/, '') || namespace;
}

/**
 * The location a {@link SOURCE_REFERENCE} match names. A match inside a `file://` URL, as a
 * stack frame writes paths, has its percent escapes decoded, so `my%20project` opens `my project`.
 */
function referenceLocation(text: string, match: RegExpExecArray | RegExpMatchArray): SourceLocation | undefined {
    const location = sourceLocationFromNamespace(match[0]);
    if (location === undefined || !text.slice(0, match.index).endsWith('file://')) return location;
    try {
        return { ...location, path: decodeURIComponent(location.path) };
    } catch {
        return location;
    }
}

/** Finds a source location only when the clicked terminal column falls on its rendered path. */
export function sourceLocationAtColumn(text: string, column: number): SourceLocation | undefined {
    for (const match of text.matchAll(SOURCE_REFERENCE)) {
        const start = columns(text.slice(0, match.index));
        const end = start + columns(match[0]);
        if (column < start || column >= end) continue;
        return referenceLocation(text, match);
    }
    return undefined;
}

/** The first source location written anywhere in `text`, such as the file of a stack frame. */
export function sourceLocationIn(text: string): SourceLocation | undefined {
    for (const match of text.matchAll(SOURCE_REFERENCE)) {
        const location = referenceLocation(text, match);
        if (location !== undefined) return location;
    }
    return undefined;
}
