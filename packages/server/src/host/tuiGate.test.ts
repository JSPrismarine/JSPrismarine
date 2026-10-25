import { describe, expect, it } from 'vitest';
import type { TuiGateInput } from './tuiGate';
import { decideMode } from './tuiGate';

const terminal = (overrides: Partial<TuiGateInput> = {}): TuiGateInput => ({
    noTui: false,
    env: {},
    stdinIsTTY: true,
    stdoutIsTTY: true,
    term: 'xterm-256color',
    ffiAvailable: async () => true,
    ...overrides
});

describe('decideMode', () => {
    it('picks the TUI on an interactive terminal with FFI', async () => {
        await expect(decideMode(terminal())).resolves.toEqual({ mode: 'tui' });
    });

    it.each([
        ['stdin is not a TTY', { stdinIsTTY: false }],
        ['stdout is not a TTY', { stdoutIsTTY: undefined }],
        ['TERM is dumb', { term: 'dumb' }],
        ['CI is set', { env: { CI: 'true' } }],
        ['JSP_NO_TUI is set', { env: { JSP_NO_TUI: '1' } }],
        ['--no-tui was passed', { noTui: true }]
    ] satisfies [string, Partial<TuiGateInput>][])(
        'falls back to plain mode quietly when %s',
        async (_name, overrides) => {
            const decision = await decideMode(terminal(overrides));

            expect(decision.mode).toBe('plain');
            expect(decision.reason).toBeUndefined();
        }
    );

    it('explains the fallback when node:ffi cannot be loaded', async () => {
        const decision = await decideMode(terminal({ ffiAvailable: async () => false }));

        expect(decision.mode).toBe('plain');
        expect(decision.reason).toMatch(/node:ffi/);
        expect(decision.reason).toMatch(/line console/);
    });

    it('does not probe FFI when an earlier check already failed', async () => {
        let probed = false;
        await decideMode(
            terminal({
                env: { CI: '1' },
                ffiAvailable: async () => {
                    probed = true;
                    return true;
                }
            })
        );

        expect(probed).toBe(false);
    });
});
