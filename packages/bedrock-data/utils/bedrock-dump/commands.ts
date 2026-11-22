/**
 * What the `commands` capture pass types at the server's console, and how it reads the answers.
 *
 * Each probe is one command line. The server answers every line it reads with one log line: an
 * `INFO` line when the command ran, an `ERROR` line when it refused it. The pass records that
 * line for each probe in `src/jsp/v<protocol>/command_answers.json`, which `packages/parity`
 * compares this server's own answers against.
 */

/**
 * The lines the pass sends, in order. Most are refused at parse time, so the capture shows where
 * the server's syntax error points; the rest are accepted forms of the same commands. None
 * changes anything another probe depends on, apart from the clock and the allow list: its probes
 * run in order on a server whose list starts empty, so each answer shows what the ones before it
 * left behind, such as adding a name twice.
 */
export const COMMAND_PROBES = [
    'time set nonsense',
    'time set',
    'time nonsense',
    'time set 100 extra',
    'time add abc',
    'time   set   nonsense',
    'time set 1.5',
    'time set -5',
    'time set day',
    'give @s diamond abc',
    'tp ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ x',
    'gamerule doDaylightCycle notabool',
    'effect @a speed 10 1 notabool',
    'setblock 0 0 0 stone ["a"=1] replace extra',
    'weather clear abc',
    'difficulty bogus',
    'allowlist list',
    'allowlist add Steve',
    'allowlist add Steve',
    'allowlist add Alex',
    'allowlist list',
    'allowlist remove Steve',
    'allowlist remove Steve',
    'allowlist on',
    'allowlist on',
    'allowlist off',
    'allowlist off',
    'allowlist reload',
    'allowlist add',
    'allowlist remove',
    'allowlist bogus',
    'allowlist list extra',
    'whitelist list',
    'allowlist add "Two Words"',
    'allowlist remove "Two Words"'
] as const;

/** One console answer: whether the server ran the line, and what it printed. */
export interface CommandAnswer {
    /** The line as the pass typed it. */
    readonly command: string;
    /** `INFO` for a line the server ran, `ERROR` for one it refused. */
    readonly level: 'INFO' | 'ERROR';
    /** The text after the log prefix. */
    readonly message: string;
}

/** A console log line: `[2026-11-17 14:20:41:811 ERROR] Syntax error: …`. */
const LOG_LINE = /^\[\d{4}-\d{2}-\d{2} [\d:]+ (INFO|ERROR)\] (.*)$/;

/**
 * Reads a console log line as an answer to `command`.
 *
 * @returns The answer, or `undefined` for a line that is not an `INFO` or `ERROR` log line, such
 *   as a banner or a warning.
 */
export const readCommandAnswer = (command: string, line: string): CommandAnswer | undefined => {
    const match = LOG_LINE.exec(line);
    if (match === null) return undefined;
    return { command, level: match[1] === 'INFO' ? 'INFO' : 'ERROR', message: match[2] ?? '' };
};
