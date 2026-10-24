/**
 * The mcfunction file format: one command per line with no leading slash,
 * `#` comments, blank lines, `\` line continuation (1.20.2) and `$` macro
 * lines (1.20.2). Parsing happens once per file at load, which is the point of
 * the format: a non-macro command line is never re-read at run time.
 */

import type { Diagnostic } from './diagnostics';

/**
 * The longest a single command may be, in characters. Java's
 * `CommandFunction` carries 2000000 as its only integer constant and rejects a
 * longer line with "Command too long".
 */
export const MAX_COMMAND_LENGTH = 2_000_000;

/** One command the file declares, after comments, blank lines and continuations are resolved. */
export interface FunctionLine {
    /** The 1-based number of the line the command starts on. */
    line: number;
    /** The command text, without the leading `$` of a macro line. */
    command: string;
    /** Whether the line is a macro line, so its `$(name)` substitutions run per call. */
    macro: boolean;
}

/** What {@link parseFunctionSource} produces. */
export interface ParsedFunction {
    lines: readonly FunctionLine[];
    diagnostics: readonly Diagnostic[];
}

/** Whether a line asks for the next line to be appended to it. */
const continues = (text: string): boolean => text.endsWith('\\');

/**
 * Parses the text of one `.mcfunction` file into its command lines.
 *
 * A line is dropped when it is blank or starts with `#`. A line whose last
 * non-whitespace character is `\` continues into the next line, which is
 * trimmed before being appended. A line whose first non-whitespace character
 * is `$` is a macro line and keeps its substitutions unevaluated.
 *
 * Problems are reported rather than thrown; the caller decides whether a
 * function with errors is registered.
 */
export const parseFunctionSource = (source: string): ParsedFunction => {
    const lines: FunctionLine[] = [];
    const diagnostics: Diagnostic[] = [];
    const sourceLines = source.split(/\r?\n/);
    // A trailing newline is a terminator, not an empty last line, so a file that
    // ends mid-continuation reports the continuation instead of closing it.
    if (sourceLines.at(-1) === '') sourceLines.pop();

    let pending: { line: number; text: string; macro: boolean } | undefined;

    for (const [index, raw] of sourceLines.entries()) {
        const number = index + 1;
        const text = raw.trim();

        if (pending) {
            pending.text += text;
            if (continues(pending.text)) {
                pending.text = pending.text.slice(0, -1);
                continue;
            }
            emit(lines, diagnostics, pending.line, pending.text, pending.macro);
            pending = undefined;
            continue;
        }

        if (text.length === 0 || text.startsWith('#')) continue;

        const macro = text.startsWith('$');
        const command = macro ? text.slice(1).trim() : text;

        if (continues(command)) {
            pending = { line: number, text: command.slice(0, -1), macro };
            continue;
        }

        emit(lines, diagnostics, number, command, macro);
    }

    if (pending) {
        diagnostics.push({
            severity: 'error',
            code: 'line.dangling-continuation',
            line: pending.line,
            message: 'the file ends with a line continuation'
        });
    }

    return { lines, diagnostics };
};

/** Validates one assembled command and records it, or reports why it was rejected. */
const emit = (
    lines: FunctionLine[],
    diagnostics: Diagnostic[],
    line: number,
    command: string,
    macro: boolean
): void => {
    if (command.length === 0) return;

    if (command.startsWith('//')) {
        diagnostics.push({
            severity: 'error',
            code: 'line.double-slash-comment',
            line,
            message: `'${preview(command)}' is not a command; comments use '#', not '//'`
        });
        return;
    }

    if (command.startsWith('/')) {
        diagnostics.push({
            severity: 'error',
            code: 'line.leading-slash',
            line,
            message: `'${preview(command)}' has a leading slash; function commands are written without one`
        });
        return;
    }

    if (command.length > MAX_COMMAND_LENGTH) {
        diagnostics.push({
            severity: 'error',
            code: 'line.too-long',
            line,
            message: `the command is ${command.length} characters, over the ${MAX_COMMAND_LENGTH} character limit`
        });
        return;
    }

    lines.push({ line, command, macro });
};

/** Shortens a command for a diagnostic message. */
const preview = (command: string): string => (command.length <= 40 ? command : `${command.slice(0, 40)}...`);
