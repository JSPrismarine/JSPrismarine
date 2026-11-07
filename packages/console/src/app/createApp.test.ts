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

async function setup(
    size: { width: number; height: number },
    overrides: Partial<AppProps> = {},
    now: () => number = () => AT
) {
    const test = await createTestRenderer({ ...size, exitOnCtrlC: false });
    const commands: string[] = [];
    const actions = { restart: vi.fn(), stop: vi.fn(), forceStop: vi.fn() };
    const store = new LogStore();
    const history = new CommandHistory();
    const clipboard = {
        copy: vi.fn(async (_text: string) => true),
        read: vi.fn(async (): Promise<string | undefined> => undefined),
        dispose: vi.fn(async () => {})
    };
    const app = createApp(
        { renderer: test.renderer, theme: defaultTheme, store, history, now, clipboard },
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
    return { ...test, dispose, app, store, history, commands, actions, clipboard };
}

type AppHarness = Awaited<ReturnType<typeof setup>>;

async function focusLog(t: AppHarness): Promise<void> {
    t.mockInput.pressEscape();
    await new Promise((resolve) => setTimeout(resolve, 30));
    await t.waitForFrame((frame) => frame.includes('LOG · Esc input'));
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
        expect(frame).toContain('● starting · ERR 0 · WARN 0 · TPS 20.00 · 2/20 · 4.1 ms · 212 MB · up 00:05:40');
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

    it('types shortcut characters while the command input has focus', async () => {
        const t = await setup({ width: 120, height: 40 });
        dispose = t.dispose;

        await t.mockInput.typeText('g/w?n?');
        await t.renderOnce();

        expect(t.captureCharFrame()).toContain('> g/w?n?');
        expect(t.captureCharFrame()).toContain('INPUT · Esc log');
    });

    it('routes a bracketed paste from the log pane into the command input', async () => {
        const t = await setup({ width: 120, height: 40 });
        dispose = t.dispose;

        await t.mockInput.typeText('say ');
        await focusLog(t);
        await t.mockInput.pasteBracketedText('hello');
        await t.renderOnce();

        expect(t.captureCharFrame()).toContain('> say hello');
        expect(t.captureCharFrame()).toContain('INPUT · Esc log');
    });

    describe('clipboard', () => {
        /** Selects `text` in the log with the mouse and returns where it sits. */
        const selectInLog = async (t: AppHarness, text: string): Promise<void> => {
            t.app.applyServerMessage(logMessage(text));
            await t.renderOnce();
            const rows = t.captureCharFrame().split('\n');
            const row = rows.findIndex((line) => line.includes(text));
            const start = rows[row]?.indexOf(text) ?? -1;
            expect(row).toBeGreaterThanOrEqual(0);
            await t.mockMouse.drag(start, row, start + text.length, row);
            await t.renderOnce();
        };
        const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
        /** `CSI code;9u` is a Super-modified key in the kitty keyboard protocol. */
        const cmd = (letter: string) => `\u001B[${letter.charCodeAt(0)};9u`;

        it('copies a selection as soon as the mouse is released', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;

            await selectInLog(t, 'copy me');
            await flush();
            await t.renderOnce();

            expect(t.clipboard.copy).toHaveBeenCalledExactlyOnceWith('copy me');
            expect(t.captureCharFrame()).toContain('copied selection to clipboard');
        });

        it('does not copy again when the notice about a copy is dismissed', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;
            await selectInLog(t, 'copy me');
            await flush();
            await t.renderOnce();
            expect(t.clipboard.copy).toHaveBeenCalledOnce();

            const rows = t.captureCharFrame().split('\n');
            const y = rows.findIndex((row) => row.includes('[x]'));
            expect(y).toBeGreaterThanOrEqual(0);
            const x = rows[y]!.indexOf('[x]');
            await t.mockMouse.click(x + 1, y);
            await flush();
            await t.renderOnce();

            expect(t.clipboard.copy).toHaveBeenCalledOnce();
            expect(t.captureCharFrame()).not.toContain('copied selection to clipboard');
        });

        it('does not copy the text of a notice when it is pressed', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;
            await selectInLog(t, 'copy me');
            await flush();
            await t.renderOnce();
            t.clipboard.copy.mockClear();

            const rows = t.captureCharFrame().split('\n');
            const y = rows.findIndex((row) => row.includes('copied selection'));
            const x = rows[y]!.indexOf('copied selection');
            await t.mockMouse.drag(x, y, x + 'copied selection'.length, y);
            await flush();

            expect(t.clipboard.copy).not.toHaveBeenCalled();
        });

        it('copies the selection again on Ctrl+C when the log pane has focus', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;
            await selectInLog(t, 'copy me');
            t.clipboard.copy.mockClear();

            t.mockInput.pressCtrlC();
            await flush();
            await t.renderOnce();

            expect(t.clipboard.copy).toHaveBeenCalledExactlyOnceWith('copy me');
        });

        it('copies on Cmd+C even when the command line has focus', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;
            await selectInLog(t, 'copy me');
            t.clipboard.copy.mockClear();
            t.app.focus();
            await t.renderOnce();
            expect(t.captureCharFrame()).toContain('INPUT · Esc log');

            t.mockInput.pressKey(cmd('c'));
            await flush();
            await t.renderOnce();

            expect(t.clipboard.copy).toHaveBeenCalledExactlyOnceWith('copy me');
            expect(t.captureCharFrame()).not.toContain('c> ');
        });

        it('copies text selected in the command line on Cmd+C', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;
            await t.mockInput.typeText('say hello');
            t.mockInput.pressArrow('left', { shift: true });
            t.mockInput.pressArrow('left', { shift: true });
            await t.renderOnce();

            t.mockInput.pressKey(cmd('c'));
            await flush();

            expect(t.clipboard.copy).toHaveBeenCalledExactlyOnceWith('lo');
        });

        it('says so when no clipboard could be reached', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;
            t.clipboard.copy.mockResolvedValue(false);

            await selectInLog(t, 'copy me');
            await flush();
            await t.renderOnce();

            expect(t.captureCharFrame()).toContain('could not reach the clipboard');
        });

        it('asks for a selection when there is nothing to copy', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;

            t.mockInput.pressKey(cmd('c'));
            await t.renderOnce();

            expect(t.clipboard.copy).not.toHaveBeenCalled();
            expect(t.captureCharFrame()).toContain('select text to copy');
        });

        it('pastes the clipboard text on Cmd+V into the command line and focuses it', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;
            t.clipboard.read.mockResolvedValue('say pasted');
            await focusLog(t);

            t.mockInput.pressKey(cmd('v'));
            await flush();
            await t.renderOnce();

            const frame = t.captureCharFrame();
            expect(frame).toContain('> say pasted');
            expect(frame).toContain('INPUT · Esc log');
        });

        it('turns a pasted block into one line', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;

            await t.mockInput.pasteBracketedText('say one\nsay two\n');
            await t.renderOnce();

            expect(t.captureCharFrame()).toContain('> say one say two');
        });
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
        await focusLog(t);

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
        await focusLog(t);

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
        await focusLog(t);

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

    describe('TPS page', () => {
        const SPAN_ROW = 'span  1m  5m  15m';

        const reportTps = (t: AppHarness, readings: readonly number[], tickRate?: number): void => {
            for (const tps of readings) {
                t.app.applyServerMessage({
                    type: 'status',
                    v: 1,
                    tps,
                    tickMs: 4.1,
                    tickRate,
                    players: 0,
                    maxPlayers: 20,
                    rssBytes: 100 * 1024 * 1024,
                    uptimeMs: 1000
                });
            }
        };

        /** Column and row of the first occurrence of `text` in the frame. */
        const find = (t: AppHarness, text: string): { x: number; y: number } => {
            const rows = t.captureCharFrame().split('\n');
            const y = rows.findIndex((row) => row.includes(text));
            expect(y, `"${text}" is on screen`).toBeGreaterThanOrEqual(0);
            return { x: rows[y]!.indexOf(text), y };
        };

        it('never shows more than 20 TPS', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;
            await focusLog(t);
            reportTps(t, [20.84, 21.5]);
            t.mockInput.pressKey('t');
            await t.renderOnce();

            const frame = t.captureCharFrame();
            expect(frame).toMatch(/now 20\.00\s+avg 20\.00\s+min 20\.00\s+max 20\.00/);
            expect(frame).toContain('TPS 20.00');
            expect(frame).not.toMatch(/2[1-9]\.\d\d/);
            expect(frame).not.toMatch(/ 2[1-9] [┤└]/);
        });

        it('measures a server with its own tick rate against that rate', async () => {
            let clock = AT;
            const t = await setup({ width: 120, height: 40 }, {}, () => clock);
            dispose = t.dispose;
            await focusLog(t);
            for (const tps of [40.7, 38, 40.2, 40]) {
                reportTps(t, [tps], 40);
                clock += 10_000;
            }
            t.mockInput.pressKey('t');
            await t.renderOnce();

            const frame = t.captureCharFrame();
            expect(frame).toMatch(/now 40\.00\s+avg \d+\.\d\d\s+min 38\.00\s+max 40\.00/);
            expect(frame).toContain('TPS 40.00');
            expect(frame).toMatch(/40 ┤/);
            expect(frame).toContain('38+');
            expect(frame).toContain('30-38');
            expect(frame).not.toMatch(/ 2[0-9] ┤/);
        });

        it('shows the highest rate set in the span on the axis', async () => {
            let clock = AT;
            const t = await setup({ width: 120, height: 40 }, {}, () => clock);
            dispose = t.dispose;
            await focusLog(t);
            reportTps(t, [40], 40);
            clock += 10_000;
            reportTps(t, [20], 20);
            clock += 10_000;
            reportTps(t, [20], 20);
            t.mockInput.pressKey('t');
            await t.renderOnce();

            // The 5 minute span still includes the time at 40, so the page keeps measuring against it.
            expect(t.captureCharFrame()).toContain('38+');

            t.mockInput.pressKey('1');
            clock += 120_000;
            reportTps(t, [20], 20);
            await t.renderOnce();

            // A minute later that rate has left the 1 minute span.
            const frame = t.captureCharFrame();
            expect(frame).not.toContain('38+');
            expect(frame).toContain('19+');
        });

        it('keeps the side pane graph on the tick rate', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;

            reportTps(t, [40, 39], 40);
            await t.renderOnce();

            const frame = t.captureCharFrame();
            expect(frame).toMatch(/40 ┤/);
            expect(frame).toMatch(/20 └/);
        });

        it('opens when the side pane graph is clicked', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;
            reportTps(t, [20, 19.5, 18]);
            await t.renderOnce();
            expect(t.captureCharFrame()).not.toContain(SPAN_ROW);

            const axis = find(t, '15 ┤');
            await t.mockMouse.click(axis.x + 8, axis.y);
            await t.renderOnce();

            const frame = t.captureCharFrame();
            expect(frame).toContain(SPAN_ROW);
            expect(frame).toMatch(/now 18\.00\s+avg/);
        });

        it('opens when the TPS segment in the status bar is clicked and closes on a second click', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;
            reportTps(t, [20]);
            await t.renderOnce();

            const segment = find(t, 'TPS 20.00');
            await t.mockMouse.click(segment.x + 2, segment.y);
            await t.renderOnce();
            expect(t.captureCharFrame()).toContain(SPAN_ROW);

            await t.mockMouse.click(segment.x + 2, segment.y);
            await t.renderOnce();
            expect(t.captureCharFrame()).not.toContain(SPAN_ROW);
        });

        it('opens on T with the log focused, and closes on Esc and hands the input back its focus', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;
            await focusLog(t);

            t.mockInput.pressKey('t');
            await t.renderOnce();
            expect(t.captureCharFrame()).toContain(SPAN_ROW);

            t.mockInput.pressEscape();
            await new Promise((resolve) => setTimeout(resolve, 30));
            await t.waitForFrame((frame) => !frame.includes(SPAN_ROW));
            expect(t.captureCharFrame()).toContain('LOG · Esc input');
        });

        it('restores input focus when it closes after opening from the input', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;
            reportTps(t, [20]);
            await t.renderOnce();

            const segment = find(t, 'TPS 20.00');
            await t.mockMouse.click(segment.x + 2, segment.y);
            await t.renderOnce();
            expect(t.captureCharFrame()).toContain('LOG · Esc input');

            t.mockInput.pressKey('t');
            await t.renderOnce();

            const frame = t.captureCharFrame();
            expect(frame).not.toContain(SPAN_ROW);
            expect(frame).toContain('INPUT · Esc log');
        });

        it('does not type into the command line while it is open', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;
            await focusLog(t);
            t.mockInput.pressKey('t');
            await t.renderOnce();

            await t.mockInput.typeText('abc');
            await t.renderOnce();

            t.mockInput.pressKey('t');
            await t.renderOnce();
            expect(t.captureCharFrame()).toContain('> type a command');
        });

        it('switches the span with the number keys, arrows, and a click', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;
            await focusLog(t);
            t.mockInput.pressKey('t');
            await t.renderOnce();
            expect(t.captureCharFrame()).toContain('-5m');

            t.mockInput.pressKey('3');
            await t.renderOnce();
            expect(t.captureCharFrame()).toContain('-15m');

            t.mockInput.pressArrow('left');
            await t.renderOnce();
            expect(t.captureCharFrame()).toContain('-5m');

            t.mockInput.pressKey('1');
            await t.renderOnce();
            expect(t.captureCharFrame()).toContain('-1m');

            const tab = find(t, ' 15m ');
            await t.mockMouse.click(tab.x + 1, tab.y);
            await t.renderOnce();
            expect(t.captureCharFrame()).toContain('-15m');
        });

        it('draws the summary of the chosen span and follows new readings', async () => {
            let clock = AT;
            const t = await setup({ width: 120, height: 40 }, {}, () => clock);
            dispose = t.dispose;
            await focusLog(t);
            t.mockInput.pressKey('t');
            reportTps(t, [20]);
            clock += 10_000;
            reportTps(t, [16]);
            clock += 10_000;
            reportTps(t, [16]);
            await t.renderOnce();

            expect(t.captureCharFrame()).toMatch(/now 16\.00\s+avg 18\.00\s+min 16\.00\s+max 20\.00/);

            reportTps(t, [12]);
            await t.renderOnce();
            const frame = t.captureCharFrame();
            expect(frame).toMatch(/now 12\.00/);
            expect(frame).toContain('10 └');
        });

        it('says it is waiting before the first reading', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;
            await focusLog(t);

            t.mockInput.pressKey('t');
            await t.renderOnce();

            expect(t.captureCharFrame()).toContain('waiting for the first status update');
        });

        it('closes on the close control', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;
            await focusLog(t);
            t.mockInput.pressKey('t');
            await t.renderOnce();

            const close = find(t, '× close');
            await t.mockMouse.click(close.x + 2, close.y);
            await t.renderOnce();

            expect(t.captureCharFrame()).not.toContain(SPAN_ROW);
        });

        it('leaves the input line and status bar visible and fits a small terminal', async () => {
            const t = await setup({ width: 80, height: 24 });
            dispose = t.dispose;
            reportTps(t, [20, 19]);
            t.mockInput.pressEscape();
            await new Promise((resolve) => setTimeout(resolve, 30));
            t.mockInput.pressKey('t');
            await t.renderOnce();

            const rows = t.captureCharFrame().split('\n').slice(0, 24);
            expect(rows).toHaveLength(24);
            expect(rows[0]).toContain('╭');
            expect(rows[21]).toContain('╰');
            expect(rows[22]).toContain('> type a command');
            expect(rows[23]).toContain('TPS 19.00');
        });

        it('keeps toasts readable above the page', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;
            await focusLog(t);
            t.mockInput.pressKey('t');
            await t.renderOnce();

            t.app.applySupervisorEvent({ type: 'supervisor.state', state: 'crashed', code: 1, generation: 1 });
            await t.renderOnce();

            const frame = t.captureCharFrame();
            expect(frame).toContain(SPAN_ROW);
            expect(frame).toContain('server crashed (exit 1)');
        });

        it('keeps the side pane beside the page', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;
            await focusLog(t);

            t.mockInput.pressKey('t');
            await t.renderOnce();

            const frame = t.captureCharFrame();
            expect(frame).toContain(SPAN_ROW);
            expect(frame).toContain('Performance');
        });
    });

    describe('command catalog', () => {
        type Harness = AppHarness;
        const NAMED_KEYS: Readonly<Record<string, string>> = {
            pageup: '\u001B[5~',
            pagedown: '\u001B[6~',
            home: 'HOME',
            end: 'END'
        };

        /** Ctrl+Shift+letter only exists in the kitty keyboard protocol; `CSI code;6u` is ctrl+shift. */
        const kittyCtrlShift = (letter: string): string => `\u001B[${letter.charCodeAt(0)};6u`;
        /** `CSI code;9u` is a Super-modified key in the kitty keyboard protocol. */
        const kittySuper = (letter: string): string => `\u001B[${letter.charCodeAt(0)};9u`;

        const press = (t: Harness, binding: KeyBinding): void => {
            if (binding.name === 'escape') {
                t.mockInput.pressEscape();
                return;
            }
            const named = NAMED_KEYS[binding.name];
            if (named !== undefined) {
                t.mockInput.pressKey(named, { shift: binding.shift, ctrl: binding.ctrl, meta: binding.meta });
                return;
            }
            if (binding.ctrl && binding.shift && !binding.meta) {
                t.mockInput.pressKey(kittyCtrlShift(binding.name));
                return;
            }
            if (binding.super) {
                t.mockInput.pressKey(kittySuper(binding.name));
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
            'log.copySelection': async (t) => {
                expect(count(t.captureCharFrame(), 'select text to copy')).toBe(1);
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
            'input.paste': async (t) => {
                expect(count(t.captureCharFrame(), 'the clipboard has no text to paste')).toBe(1);
            },
            'view.tpsGraph': async (t) => {
                expect(count(t.captureCharFrame(), 'span  1m  5m  15m')).toBe(1);
            },
            'view.help': async (t) => {
                expect(t.captureCharFrame()).toContain('Keyboard shortcuts');
            },
            'view.toggleFocus': async (t) => {
                await t.waitForFrame((frame) => frame.includes('LOG · Esc input'));
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

            if (id !== 'view.toggleFocus') await focusLog(t);
            await prepare[id]?.(t);
            await t.renderOnce();
            press(t, binding);
            if (binding.name === 'escape') await new Promise((resolve) => setTimeout(resolve, 30));
            await t.renderOnce();
            await t.renderOnce();

            await effects[id](t);
            const promptRow = t.captureCharFrame().split('\n')[38] ?? '';
            expect(promptRow.trimEnd()).toBe(id === 'log.search' ? '> /' : '> type a command, ? for help');
        });

        it('restarts on Ctrl+Shift+R only once the supervisor says it can', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;

            await focusLog(t);
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

            await focusLog(t);
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
