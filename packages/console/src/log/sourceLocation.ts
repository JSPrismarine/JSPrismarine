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

const SOURCE_REFERENCE = /(?:[A-Za-z]:[\\/]|\/)?(?:[\w.@+-]+[\\/])*[\w.@+-]+\.[\w-]+:\d+:\d+/g;
const LOCATION_SUFFIX = /^(.*\.[\w-]+):(\d+):(\d+)$/;

/** Returns the source location in a namespace when verbose logging supplied one. */
export function sourceLocationFromNamespace(namespace: string): SourceLocation | undefined {
    const match = LOCATION_SUFFIX.exec(namespace);
    if (!match?.[1] || !match[2] || !match[3]) return undefined;
    return { path: match[1], line: Number(match[2]), column: Number(match[3]) };
}

/** Finds a source location only when the clicked terminal column falls on its rendered path. */
export function sourceLocationAtColumn(text: string, column: number): SourceLocation | undefined {
    for (const match of text.matchAll(SOURCE_REFERENCE)) {
        const start = columns(text.slice(0, match.index));
        const end = start + columns(match[0]);
        if (column < start || column >= end) continue;
        return sourceLocationFromNamespace(match[0]);
    }
    return undefined;
}
