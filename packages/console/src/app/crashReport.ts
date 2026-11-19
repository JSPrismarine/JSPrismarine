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

/**
 * Finds the last stack trace in a crashed server's output and splits it into the error line and
 * its frames. Output without a trace gives its last non-empty line as the error and no frames,
 * so a crash that printed one line of why still says it.
 */
export function parseCrash(lines: readonly string[]): Crash {
    const lastFrame = lines.findLastIndex((line) => FRAME.test(line));
    if (lastFrame === -1) {
        const error = lines.findLast((line) => line.trim() !== '')?.trim();
        return { error, frames: [], trace: error ?? '' };
    }
    let first = lastFrame;
    while (first > 0 && FRAME.test(lines[first - 1] ?? '')) first -= 1;
    const header = lines.slice(0, first).findLast((line) => line.trim() !== '');
    const frames = lines.slice(first, lastFrame + 1).map((line) => {
        const text = line.trim();
        return { text, location: sourceLocationIn(text) };
    });
    const trace = [header, ...lines.slice(first, lastFrame + 1)].filter((line) => line !== undefined).join('\n');
    return { error: header?.trim(), frames, trace };
}
