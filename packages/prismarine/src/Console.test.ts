import readline from 'node:readline';
import { PassThrough } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';
import { completeCommand, countInterrupts, keepOpenThroughInterrupts, writeAbovePrompt } from './Console';
import type { PromptWriter } from './Console';

const CLEAR_ROW = '\x1b[2K\r';

/** The byte a terminal in raw mode sends for Ctrl+C, in place of raising a signal. */
const CTRL_C = '\x03';

/** A readline stand-in that records everything written to its output. */
const fakeCli = (overrides: Partial<PromptWriter> = {}): PromptWriter & { written: string[] } => {
    const written: string[] = [];
    return {
        written,
        output: { write: (data: string) => written.push(data) },
        line: '',
        prompt: vi.fn(),
        ...overrides
    };
};

describe('Console', () => {
    describe('writeAbovePrompt', () => {
        it('erases the row before writing, so no part of the input survives beside it', () => {
            // The case a naive implementation gets wrong: a log shorter than what was
            // typed. Without erasing, the tail of the typed text stays on screen.
            const cli = fakeCli({ line: '/a-very-long-command-being-typed', _refreshLine: vi.fn() });

            writeAbovePrompt(cli, 'short');

            expect(cli.written[0]).toBe(`${CLEAR_ROW}short\n`);
        });

        it('lets readline redraw itself, and does not print a second prompt', () => {
            // The previous implementation called _refreshLine() *and* prompt(), so the
            // prompt appeared twice.
            const refresh = vi.fn();
            const cli = fakeCli({ _refreshLine: refresh });

            writeAbovePrompt(cli, 'log line');

            expect(refresh).toHaveBeenCalledTimes(1);
            expect(cli.prompt).not.toHaveBeenCalled();
        });

        it('falls back to prompt and an echo when readline has no _refreshLine', () => {
            const cli = fakeCli({ line: '/op someone', _refreshLine: undefined });

            writeAbovePrompt(cli, 'log line');

            expect(cli.prompt).toHaveBeenCalledWith(true); // preserveCursor
            expect(cli.written.join('')).toContain('/op someone'); // the input is not lost
        });

        it('echoes nothing when nothing was typed', () => {
            const cli = fakeCli({ line: '', _refreshLine: undefined });
            writeAbovePrompt(cli, 'log line');
            expect(cli.written.join('')).toBe(`${CLEAR_ROW}log line\n`);
        });

        it('holds up under a burst, as an unfiltered packet log would be', () => {
            const refresh = vi.fn();
            const cli = fakeCli({ line: '/help', _refreshLine: refresh });

            for (let i = 0; i < 50; i++) writeAbovePrompt(cli, `packet ${i}`);

            // One erase plus one message per line, and no prompts piling up.
            expect(cli.written.length).toBe(50);
            expect(cli.written.every((chunk) => chunk.startsWith(CLEAR_ROW))).toBe(true);
            expect(refresh).toHaveBeenCalledTimes(50);
        });
    });

    describe('countInterrupts', () => {
        const bytes = (text: string) => Buffer.from(text, 'latin1');

        it('finds nothing in ordinary typing', () => {
            expect(countInterrupts(bytes('/stop\n'))).toBe(0);
        });

        it('finds one press', () => {
            expect(countInterrupts(bytes(CTRL_C))).toBe(1);
        });

        it('finds every press in a read, which is how a frozen console delivers them', () => {
            // The presses wait in the terminal's buffer while the loop generates terrain and
            // arrive together. Counting the read as one press loses all but the first, and the
            // second press is the one that forces an exit.
            expect(countInterrupts(bytes(CTRL_C + CTRL_C + CTRL_C))).toBe(3);
        });

        it('finds a press among whatever else was typed first', () => {
            expect(countInterrupts(bytes(`/sto${CTRL_C}`))).toBe(1);
        });
    });

    describe('keepOpenThroughInterrupts', () => {
        /**
         * A readline interface over plain streams, which behaves as the terminal one does for
         * everything below: `terminal: true` is what makes readline parse keystrokes, and it
         * does not require a tty to do it.
         */
        const terminal = () => {
            const input = new PassThrough();
            const output = new PassThrough();
            output.resume();

            const cli = readline.createInterface({ input, output, terminal: true, prompt: '> ' });
            const state = { closed: false, lines: [] as string[] };
            cli.on('close', () => {
                state.closed = true;
            });
            cli.on('line', (line: string) => state.lines.push(line));

            /** Hands readline the bytes and waits for it to have read them. */
            const type = async (text: string) => {
                input.write(text);
                await new Promise((resolve) => setImmediate(resolve));
            };

            return { cli, state, type };
        };

        it('leaves the console open, so one Ctrl+C does not end input for good', async () => {
            // Left alone, readline answers byte 3 by closing itself, and a closed interface
            // never reads stdin again. That is the reported "input stops working".
            const { cli, state, type } = terminal();
            keepOpenThroughInterrupts(cli);

            await type(CTRL_C);
            await type('/stop\n');

            expect(state.closed).toBe(false);
            expect(state.lines).toEqual(['/stop']);
        });

        it('survives a burst of presses', async () => {
            const { cli, state, type } = terminal();
            keepOpenThroughInterrupts(cli);

            await type(CTRL_C + CTRL_C + CTRL_C);
            await type('/stop\n');

            expect(state.closed).toBe(false);
            expect(state.lines).toEqual(['/stop']);
        });
    });

    describe('completeCommand', () => {
        const names = ['command1', 'command2', 'command3'];

        it('returns every command that starts with the typed text', () => {
            expect(completeCommand(names, 'co')).toEqual([names, 'co']);
            expect(completeCommand(names, 'command1')).toEqual([['command1'], 'command1']);
        });

        it('offers every command when nothing matches', () => {
            expect(completeCommand(names, 'zzz')).toEqual([names, 'zzz']);
        });

        it('drops duplicate names, keeping the last occurrence', () => {
            expect(completeCommand(['a', 'b', 'a'], '')).toEqual([['b', 'a'], '']);
        });
    });
});
