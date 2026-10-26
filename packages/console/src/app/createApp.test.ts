import type { LogLevel } from '@jsprismarine/logger';
import { createTestRenderer } from '@opentui/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CommandHistory } from '../input/history';
import { COMMAND_CATALOG } from '../keymap/catalog';
import type { CommandId, KeyBinding } from '../keymap/catalog';
import { LogStore } from '../log/logStore';
import { defaultTheme } from '../theme';
import { createApp } from './createApp';
import type { AppProps, CommandOutcome } from './createApp';

const AT = new Date(2026, 0, 1, 12, 0, 1).getTime();

const logMessage = (message: string, level: LogLevel = 'info') =>
    ({ type: 'log', v: 1, seq: 1, level, namespace: 'Server', at: AT, message, formatted: message }) as const;

async function setup(size: { width: number; height: number }, overrides: Partial<AppProps> = {}) {
    const test = await createTestRenderer({ ...size, exitOnCtrlC: false });
    const commands: string[] = [];
    const actions = { restart: vi.fn(), stop: vi.fn(), forceStop: vi.fn() };
    const store = new LogStore();
    const history = new CommandHistory();
    const app = createApp(
        { renderer: test.renderer, theme: defaultTheme, store, history, now: () => AT },
        {
            onCommand: async (line): Promise<CommandOutcome> => {
                commands.push(line);
                return { ok: true };
            },
            onComplete: async () => ({ completions: [], replace: '' }),
            actions,
            serverName: 'default',
            version: '0.15.2',
            ...overrides
        }
    );
    app.focus();
    await test.renderOnce();
    /** Disposes the app before the renderer so no toast timer outlives the native scene. */
    const dispose = async (): Promise<void> => {
        app.dispose();
        await test.dispose();
    };
    return { ...test, dispose, app, store, history, commands, actions };
}

describe('createApp', () => {
    let dispose: (() => Promise<void>) | undefined;

    afterEach(async () => {
        await dispose?.();
        dispose = undefined;
    });

    it('draws the title, prompt, status bar, and side pane at 120x40', async () => {
        const t = await setup({ width: 120, height: 40 });
        dispose = t.dispose;

        const frame = t.captureCharFrame();
        expect(frame).toContain('JSPrismarine 0.15.2 · default');
        expect(frame).toContain('> type a command, ? for help');
        expect(frame).toContain('● starting');
        expect(frame).toContain('info · all · ? help');
        expect(frame).toContain('Players');
    });

    it('drops the title bar and side pane at 80x24', async () => {
        const t = await setup({ width: 80, height: 24 });
        dispose = t.dispose;

        const frame = t.captureCharFrame();
        expect(frame).not.toContain('JSPrismarine 0.15.2');
        expect(frame).not.toContain('Players');
        expect(frame).toContain('> type a command');
    });

    it('shows a log message in the log pane', async () => {
        const t = await setup({ width: 120, height: 40 });
        dispose = t.dispose;

        t.app.applyServerMessage(logMessage('Listening on 0.0.0.0:19132'));
        await t.renderOnce();

        const frame = t.captureCharFrame();
        expect(frame).toContain('12:00:01 INFO    Server       Listening on 0.0.0.0:19132');
    });

    it('uses one-letter level tokens and no namespace column at 80 columns', async () => {
        const t = await setup({ width: 80, height: 24 });
        dispose = t.dispose;

        t.app.applyServerMessage(logMessage('Listening on 0.0.0.0:19132'));
        await t.renderOnce();

        const frame = t.captureCharFrame();
        expect(frame).toContain('12:00:01 I Listening on 0.0.0.0:19132');
        expect(frame).not.toContain('Server ');
    });

    it('updates the status bar and side pane from a status message', async () => {
        const t = await setup({ width: 120, height: 40 });
        dispose = t.dispose;

        t.app.applyServerMessage({
            type: 'status',
            v: 1,
            tps: 20,
            tickMs: 4.1,
            players: 2,
            maxPlayers: 20,
            rssBytes: 212 * 1024 * 1024,
            uptimeMs: 340_000
        });
        await t.renderOnce();

        const frame = t.captureCharFrame();
        expect(frame).toContain('● starting · TPS 20.00 · 2/20 · 4.1 ms · 212 MB · up 00:05:40');
        expect(frame).toMatch(/online\s+2\/20/);
    });

    it('moves the state segment to running on a lifecycle message', async () => {
        const t = await setup({ width: 120, height: 40 });
        dispose = t.dispose;

        t.app.applyServerMessage({ type: 'lifecycle', v: 1, state: 'running' });
        await t.renderOnce();

        expect(t.captureCharFrame()).toContain('● running');
    });

    it('shows a toast and the state segment when the supervisor reports a crash', async () => {
        const t = await setup({ width: 120, height: 40 });
        dispose = t.dispose;

        t.app.applySupervisorEvent({ type: 'supervisor.state', state: 'crashed', code: 1, generation: 1 });
        await t.renderOnce();

        const frame = t.captureCharFrame();
        expect(frame).toContain('server crashed (exit 1)');
        expect(frame).toContain('● crashed');
    });

    it('appends child output as raw lines', async () => {
        const t = await setup({ width: 120, height: 40 });
        dispose = t.dispose;

        t.app.applySupervisorEvent({ type: 'supervisor.output', stream: 'stderr', text: 'node: warning\n' });
        await t.renderOnce();

        expect(t.captureCharFrame()).toContain('node: warning');
        expect(t.store.visible().map((record) => record.kind)).toEqual(['raw']);
    });

    it('inserts a generation separator when a later generation starts', async () => {
        const t = await setup({ width: 120, height: 40 });
        dispose = t.dispose;

        t.app.applySupervisorEvent({ type: 'supervisor.state', state: 'starting', generation: 2 });
        await t.renderOnce();

        const frame = t.captureCharFrame();
        expect(frame).toContain('server restarted (generation 2)');
        expect(frame).not.toContain('(generation 2) (generation 2)');
        expect(t.store.generation).toBe(2);
    });

    it('shows the dev badge in the title bar once the supervisor watches', async () => {
        const t = await setup({ width: 120, height: 40 });
        dispose = t.dispose;

        t.app.applySupervisorEvent({ type: 'supervisor.watching', root: '/repo/packages' });
        await t.renderOnce();

        const frame = t.captureCharFrame();
        expect(frame.split('\n')[0]).toContain('dev ● watching packages');
        expect(frame).toContain('restarts 0');
    });

    it('sends a typed command to onCommand', async () => {
        const t = await setup({ width: 120, height: 40 });
        dispose = t.dispose;

        await t.mockInput.typeText('say hi');
        t.mockInput.pressEnter();
        await t.renderOnce();

        expect(t.commands).toEqual(['say hi']);
    });

    it('shows a toast when the command fails', async () => {
        const t = await setup(
            { width: 120, height: 40 },
            { onCommand: async () => ({ ok: false, error: 'Unknown command' }) }
        );
        dispose = t.dispose;

        await t.mockInput.typeText('nope');
        t.mockInput.pressEnter();
        await t.renderOnce();
        await t.renderOnce();

        expect(t.captureCharFrame()).toContain('Unknown command');
    });

    it('turns a throwing handler into a toast instead of an exception', async () => {
        const t = await setup(
            { width: 120, height: 40 },
            {
                onCommand: () => {
                    throw new Error('handler exploded');
                }
            }
        );
        dispose = t.dispose;

        await t.mockInput.typeText('boom');
        t.mockInput.pressEnter();
        await t.renderOnce();

        const frame = t.captureCharFrame();
        // The translucent toast lets cells from the log behind it appear in the character frame.
        expect(frame).toContain('[x]');
        expect(frame).toContain('handler');
        expect(frame).toContain('exploded');
        expect(
            t.store.visible().some((record) => record.kind === 'raw' && record.message.includes('handler exploded'))
        ).toBe(true);
    });

    it('cycles the level filter with Ctrl+F', async () => {
        const t = await setup({ width: 120, height: 40 });
        dispose = t.dispose;

        t.mockInput.pressKey('f', { ctrl: true });
        await t.renderOnce();
        expect(t.captureCharFrame()).toContain('all · all · ? help');

        t.mockInput.pressKey('f', { ctrl: true });
        await t.renderOnce();
        expect(t.captureCharFrame()).toContain('error · all · ? help');
    });

    it('closes the help overlay with Esc', async () => {
        const t = await setup({ width: 120, height: 40 });
        dispose = t.dispose;

        t.mockInput.pressKey('?');
        await t.renderOnce();
        expect(t.captureCharFrame()).toContain('Keyboard shortcuts');

        t.mockInput.pressEscape();
        // A lone ESC byte stays pending until the parser's 20 ms timeout fires.
        await new Promise((resolve) => setTimeout(resolve, 30));
        await t.waitForFrame((frame) => !frame.includes('Keyboard shortcuts'));
    });

    it('toggles the side pane back with a second Ctrl+B', async () => {
        const t = await setup({ width: 120, height: 40 });
        dispose = t.dispose;

        t.mockInput.pressKey('b', { ctrl: true });
        await t.renderOnce();
        expect(t.captureCharFrame()).not.toContain('Players');

        t.mockInput.pressKey('b', { ctrl: true });
        await t.renderOnce();
        expect(t.captureCharFrame()).toContain('Players');
    });

    it('calls stop after two Ctrl+C presses on an empty line and shows the hint', async () => {
        const t = await setup({ width: 120, height: 40 });
        dispose = t.dispose;

        t.mockInput.pressCtrlC();
        await t.renderOnce();
        expect(t.captureCharFrame()).toContain('press Ctrl+C again to stop the server');

        t.mockInput.pressCtrlC();
        await t.renderOnce();
        expect(t.actions.stop).toHaveBeenCalledOnce();
    });

    it('force stops on one Ctrl+C while the server is stopping', async () => {
        const t = await setup({ width: 120, height: 40 });
        dispose = t.dispose;

        t.app.applyServerMessage({ type: 'lifecycle', v: 1, state: 'stopping' });
        t.mockInput.pressCtrlC();
        await t.renderOnce();

        expect(t.actions.forceStop).toHaveBeenCalledOnce();
        expect(t.actions.stop).not.toHaveBeenCalled();
    });

    it('sends /name to the server when name is a known command and searches otherwise', async () => {
        const t = await setup(
            { width: 120, height: 40 },
            { onComplete: async (line) => ({ completions: line === '' ? ['stop', 'list'] : [], replace: line }) }
        );
        dispose = t.dispose;
        t.app.applyServerMessage({ type: 'hello', v: 1, serverVersion: '0.15.2', pid: 1 });
        await t.renderOnce();

        await t.mockInput.typeText('/stop');
        t.mockInput.pressEnter();
        await t.renderOnce();
        expect(t.commands).toEqual(['/stop']);

        await t.mockInput.typeText('/listening');
        t.mockInput.pressEnter();
        await t.renderOnce();
        await t.renderOnce();
        expect(t.commands).toEqual(['/stop']);
        expect(t.captureCharFrame()).toContain('no matches for "listening"');
    });

    it('re-lays out when the terminal shrinks', async () => {
        const t = await setup({ width: 120, height: 40 });
        dispose = t.dispose;

        t.resize(80, 24);
        await t.renderOnce();
        await t.renderOnce();

        const frame = t.captureCharFrame();
        expect(frame).not.toContain('Players');
        expect(frame).not.toContain('JSPrismarine 0.15.2');
    });

    describe('command catalog', () => {
        type Harness = Awaited<ReturnType<typeof setup>>;
        const NAMED_KEYS: Readonly<Record<string, string>> = {
            pageup: '\u001B[5~',
            pagedown: '\u001B[6~',
            home: 'HOME',
            end: 'END'
        };

        /** Ctrl+Shift+letter only exists in the kitty keyboard protocol; `CSI code;6u` is ctrl+shift. */
        const kittyCtrlShift = (letter: string): string => `\u001B[${letter.charCodeAt(0)};6u`;

        const press = (t: Harness, binding: KeyBinding): void => {
            const named = NAMED_KEYS[binding.name];
            if (named !== undefined) {
                t.mockInput.pressKey(named, { shift: binding.shift, ctrl: binding.ctrl, meta: binding.meta });
                return;
            }
            if (binding.ctrl && binding.shift && !binding.meta) {
                t.mockInput.pressKey(kittyCtrlShift(binding.name));
                return;
            }
            t.mockInput.pressKey(binding.shift ? binding.name.toUpperCase() : binding.name, {
                ctrl: binding.ctrl,
                meta: binding.meta
            });
        };

        const fill = (t: Harness, count: number): void => {
            for (let i = 1; i <= count; i += 1) t.app.applyServerMessage(logMessage(`line ${i}`));
        };

        /** Top row of the log pane; the title bar is row 0 at 120x40. */
        const topLogRow = (t: Harness) => t.captureCharFrame().split('\n')[1] ?? '';
        const count = (frame: string, text: string) => frame.split(text).length - 1;

        /** One press per binding; each check also fails when the command ran twice. */
        const effects: Record<CommandId, (t: Harness) => Promise<void>> = {
            'input.historySearch': async (t) => {
                expect(count(t.captureCharFrame(), 'no history entry matches')).toBe(1);
            },
            'log.pageUp': async (t) => {
                expect(topLogRow(t)).toContain('line 28');
            },
            'log.pageDown': async (t) => {
                expect(topLogRow(t)).toContain('line 37');
            },
            'log.top': async (t) => {
                expect(topLogRow(t)).toContain('line 1 ');
            },
            'log.bottom': async (t) => {
                const frame = t.captureCharFrame();
                expect(frame).toContain('line 100');
                expect(frame).not.toContain('new lines');
            },
            'log.search': async (t) => {
                expect(t.captureCharFrame()).toContain('> /');
            },
            'log.searchNext': async (t) => {
                expect(count(t.captureCharFrame(), 'no search; type /text to search')).toBe(1);
            },
            'log.searchPrev': async (t) => {
                expect(count(t.captureCharFrame(), 'no search; type /text to search')).toBe(1);
            },
            'log.nextError': async (t) => {
                expect(count(t.captureCharFrame(), 'no earlier errors')).toBe(1);
            },
            'log.nextWarning': async (t) => {
                expect(count(t.captureCharFrame(), 'no earlier warnings')).toBe(1);
            },
            'log.toggleWrap': async (t) => {
                const frame = t.captureCharFrame();
                expect(frame).toContain('wrapping long lines');
                expect(frame).not.toContain('truncating long lines');
            },
            'log.clearView': async (t) => {
                expect(t.captureCharFrame()).not.toMatch(/line \d/);
                expect(t.store.visible()).toHaveLength(100);
                t.app.applyServerMessage(logMessage('after clear'));
                await t.renderOnce();
                expect(topLogRow(t)).toContain('after clear');
            },
            'log.filter': async (t) => {
                expect(t.captureCharFrame()).toContain('all · all · ? help');
            },
            'view.toggleSidePane': async (t) => {
                expect(t.captureCharFrame()).not.toContain('Players');
            },
            'view.help': async (t) => {
                expect(t.captureCharFrame()).toContain('Keyboard shortcuts');
            },
            'view.palette': async (t) => {
                expect(count(t.captureCharFrame(), 'the command palette is not yet available')).toBe(1);
            },
            'server.restart': async (t) => {
                expect(count(t.captureCharFrame(), 'restart is only available with --watch')).toBe(1);
                expect(t.actions.restart).not.toHaveBeenCalled();
            },
            'server.stop': async () => {
                // Bound to no key; two Ctrl+C presses reach it through the input bar.
            }
        };

        /** Commands whose effect needs a scrolled pane: fill it and leave the bottom first. */
        const prepare: Partial<Record<CommandId, (t: Harness) => Promise<void>>> = {
            'log.pageUp': async (t) => fill(t, 100),
            'log.pageDown': async (t) => {
                fill(t, 100);
                await t.renderOnce();
                t.mockInput.pressKey('HOME');
            },
            'log.top': async (t) => fill(t, 100),
            'log.clearView': async (t) => fill(t, 100),
            'log.bottom': async (t) => {
                fill(t, 100);
                await t.renderOnce();
                t.mockInput.pressKey('HOME');
            }
        };

        const cases = COMMAND_CATALOG.flatMap((command) =>
            command.bindings.map((binding) => [command.id, binding] as const)
        );

        it.each(cases)('runs %s once from %o and does not type the key', async (id, binding) => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;

            await prepare[id]?.(t);
            await t.renderOnce();
            press(t, binding);
            await t.renderOnce();
            await t.renderOnce();

            await effects[id](t);
            const promptRow = t.captureCharFrame().split('\n')[38] ?? '';
            expect(promptRow.trimEnd()).toBe(id === 'log.search' ? '> /' : '> type a command, ? for help');
        });

        it('restarts on Ctrl+Shift+R only once the supervisor says it can', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;

            t.app.applySupervisorEvent({ type: 'supervisor.watching', root: '/repo/packages', canRestart: false });
            t.mockInput.pressKey(kittyCtrlShift('r'));
            await t.renderOnce();
            expect(t.actions.restart).not.toHaveBeenCalled();
            expect(t.captureCharFrame()).toContain('restart is only available with --watch');

            t.app.applySupervisorEvent({ type: 'supervisor.watching', root: '/repo/packages', canRestart: true });
            t.mockInput.pressKey(kittyCtrlShift('r'));
            await t.renderOnce();
            expect(t.actions.restart).toHaveBeenCalledTimes(1);
            expect(t.history.entries).toEqual([]);
        });

        it('jumps to the last search match on /text and steps back with N', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;
            fill(t, 100);
            await t.renderOnce();

            await t.mockInput.typeText('/line 5');
            t.mockInput.pressEnter();
            await t.renderOnce();
            await t.renderOnce();
            expect(topLogRow(t)).toContain('line 59');
            expect(t.commands).toEqual([]);

            t.mockInput.pressKey('N');
            await t.renderOnce();
            await t.renderOnce();
            expect(topLogRow(t)).toContain('line 58');
        });

        it('scrolls the latest error into view on Ctrl+E', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;
            fill(t, 9);
            t.app.applyServerMessage(logMessage('boom', 'error'));
            fill(t, 100);
            await t.renderOnce();
            expect(t.captureCharFrame()).not.toContain('boom');

            t.mockInput.pressKey('e', { ctrl: true });
            await t.renderOnce();
            await t.renderOnce();
            expect(topLogRow(t)).toContain('ERROR   Server       boom');
        });

        it('types a bound letter once the line has text', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;

            await t.mockInput.typeText('sa');
            t.mockInput.pressKey('w');
            t.mockInput.pressKey('?');
            await t.renderOnce();

            const frame = t.captureCharFrame();
            expect(frame).toContain('> saw?');
            expect(frame).not.toContain('Keyboard shortcuts');
            expect(frame).not.toContain('wrapping long lines');
        });
    });
});
