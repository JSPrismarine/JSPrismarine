import { describe, expect, it, vi } from 'vitest';
import { completeCommand, writeAbovePrompt } from './Console';
import type { PromptWriter } from './Console';

const CLEAR_ROW = '\x1b[2K\r';

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
