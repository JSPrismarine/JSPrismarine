import type { SourceLocation } from '../log/sourceLocation';
import { sourceLocationIn } from '../log/sourceLocation';

/** One `at ...` line of a stack trace, and the file position it names, if any. */
export interface CrashFrame {
    /** The frame without its indent, such as `at World.tick (file:///.../World.js:812:20)`. */
    text: string;
    location?: SourceLocation;
}

/** What a crashed server last printed about why: the error line and the frames under it. */
export interface Crash {
    /** The error line, such as `RangeError: The chunk at 12, -4 has no reference left to release`. */
    error?: string;
    frames: CrashFrame[];
    /** The error line and every frame, as the server printed them, for copying. */
    trace: string;
}

const FRAME = /^\s+at\s/;
/** The first line of an error as Node prints it, such as `TypeError: ...` or `Uncaught Error`. */
const ERROR_HEAD = /^\s*(?:Uncaught\s+)?[\w.$]*(?:Error|Exception)\b/;
/** A line that reports a failure, as opposed to what Node prints after a trace, such as its version. */
const FAILURE = /error|fatal|fail|exception|uncaught/i;

/**
 * Finds the last stack trace in a crashed server's output and splits it into the error line and
 * its frames. Output without a trace gives its last non-empty line as the error and no frames,
 * so a crash that printed one line of why still says it. A failure reported after the last trace,
 * such as `fatal: configuration file is missing` following a handled error, is the crash's own
 * reason and wins over that earlier trace.
 */
export function parseCrash(lines: readonly string[]): Crash {
    const lastFrame = lines.findLastIndex((line) => FRAME.test(line));
    if (lastFrame === -1) {
        const error = lines.findLast((line) => line.trim() !== '')?.trim();
        return { error, frames: [], trace: error ?? '' };
    }
    const later = lines.slice(lastFrame + 1).findLast((line) => FAILURE.test(line));
    if (later !== undefined) return { error: later.trim(), frames: [], trace: later.trim() };
    let first = lastFrame;
    while (first > 0 && FRAME.test(lines[first - 1] ?? '')) first -= 1;
    const header = errorHeader(lines, first);
    const frames = lines.slice(first, lastFrame + 1).map((line) => {
        const text = line.trim();
        return { text, location: sourceLocationIn(text) };
    });
    const trace = [...header, ...lines.slice(first, lastFrame + 1)].join('\n');
    const error = header.map((line) => line.trim()).join(' ');
    return { error: error === '' ? undefined : error, frames, trace };
}

/**
 * The lines of the error message above the frame at `first`. A message can run over several
 * lines, such as `Error: invalid configuration` and the detail under it, so the header reaches
 * back through the unbroken lines before the frames to the last one that starts an error. Without
 * such a line it is only the line right above the frames, so unrelated output is left out.
 */
function errorHeader(lines: readonly string[], first: number): string[] {
    let end = first;
    while (end > 0 && (lines[end - 1] ?? '').trim() === '') end -= 1;
    if (end === 0) return [];
    let start = end - 1;
    while (start > 0 && (lines[start - 1] ?? '').trim() !== '' && !FRAME.test(lines[start - 1] ?? '')) start -= 1;
    const block = lines.slice(start, end);
    const head = block.findLastIndex((line) => ERROR_HEAD.test(line));
    return head === -1 ? block.slice(-1) : block.slice(head);
}
