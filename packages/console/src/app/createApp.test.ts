import type { CommandInfo, SupervisorEvent } from '@jsprismarine/console-protocol';
import type { LogLevel } from '@jsprismarine/logger';
import { BoxRenderable, InputRenderable, TextRenderable, parseColor } from '@opentui/core';
import { createTestRenderer } from '@opentui/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CommandHistory } from '../input/history';
import { COMMAND_CATALOG, KEY_PLATFORMS, bindingsFor, formatBinding } from '../keymap/catalog';
import type { CommandId, KeyBinding } from '../keymap/catalog';
import { LogStore } from '../log/logStore';
import { defaultTheme } from '../theme';
import { createApp } from './createApp';
import type { AppProps, CommandOutcome } from './createApp';
import type { SourceLocation } from '../log/sourceLocation';

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
    let clipboardText: string | undefined;
    const clipboard = {
        copy: vi.fn(async (_text: string) => true),
        read: vi.fn(async (): Promise<string | undefined> => clipboardText),
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
    /** Sets what a read of the clipboard returns. */
    const setClipboard = (text: string | undefined): void => {
        clipboardText = text;
    };
    return { ...test, dispose, app, store, history, commands, actions, clipboard, setClipboard };
}

type AppHarness = Awaited<ReturnType<typeof setup>>;

const byId = (t: AppHarness, id: string) => t.renderer.root.findDescendantById(id);

/** Lets pending promise callbacks, such as a clipboard read, run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** `CSI code;9u` is a Super-modified key in the kitty keyboard protocol. */
const cmd = (letter: string) => `\u001B[${letter.charCodeAt(0)};9u`;

/** Whether the command line has keyboard focus. */
const inputFocused = (t: AppHarness): boolean => byId(t, 'command-input')?.focused === true;

/** Whether the theme color `role` is what the title bar's state tile is painted in. */
function tileIs(t: AppHarness, role: 'ok' | 'warning' | 'danger'): boolean {
    const title = byId(t, 'title-left');
    if (!(title instanceof TextRenderable)) throw new Error('the title bar has no left text');
    return title.content.chunks[0]?.bg?.equals(parseColor(defaultTheme[role])) === true;
}

/** Whether the theme color `role` is the activity line's bullet. */
function activityIs(t: AppHarness, role: 'ok' | 'warning' | 'danger'): boolean {
    const line = byId(t, 'activity-line');
    if (!(line instanceof TextRenderable)) throw new Error('the app has no activity line');
    return line.content.chunks[0]?.fg?.equals(parseColor(defaultTheme[role])) === true;
}

/** Whether the renderable `id` is on screen. */
const shown = (t: AppHarness, id: string): boolean => byId(t, id)?.visible === true;

/** What the command line holds. */
function commandLine(t: AppHarness): string | undefined {
    const input = byId(t, 'command-input');
    return input instanceof InputRenderable ? input.value : undefined;
}

/** The tone of each notice on screen, oldest first. */
function notices(t: AppHarness): string[] {
    const roles = ['ok', 'warning', 'danger', 'muted', 'accent'] as const;
    return (byId(t, 'toast-stack')?.getChildren() ?? []).map((toast) => {
        const border = toast instanceof BoxRenderable ? toast.borderColor : undefined;
        return roles.find((role) => border?.equals(parseColor(defaultTheme[role]))) ?? 'unknown';
    });
}

/** Levels of the log records the view shows. */
/** The level column of each log row the pane paints, top to bottom, lowercased. */
const visibleLevels = (t: AppHarness): string[] => {
    const levels: string[] = [];
    for (let index = 0; ; index += 1) {
        const row = byId(t, `log-row-text-${index}`);
        if (!(row instanceof TextRenderable)) return levels;
        const level = /^\d\d:\d\d:\d\d (\S+)/.exec(row.plainText)?.[1];
        if (level !== undefined) levels.push(level.toLowerCase());
    }
};

async function focusLog(t: AppHarness): Promise<void> {
    t.mockInput.pressEscape();
    await new Promise((resolve) => setTimeout(resolve, 30));
    await t.waitForFrame(() => !inputFocused(t));
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

        expect(byId(t, 'title-bar')?.visible).toBe(true);
        expect(byId(t, 'side-pane')?.visible).toBe(true);
        expect(inputFocused(t)).toBe(true);
        expect(tileIs(t, 'warning')).toBe(true);
        // The title bar's tile carries the state, so the status bar does not repeat it.
        expect(byId(t, 'status-left-state')).toBeUndefined();
        for (const id of ['level-filter', 'namespace-filter', 'help']) {
            expect(byId(t, `status-right-${id}`), id).toBeDefined();
        }
    });

    it('drops the title bar and side pane at 80x24', async () => {
        const t = await setup({ width: 80, height: 24 });
        dispose = t.dispose;

        expect(shown(t, 'title-bar')).toBe(false);
        expect(shown(t, 'side-pane')).toBe(false);
        expect(inputFocused(t)).toBe(true);
    });

    it('shows a log message in the log pane', async () => {
        const t = await setup({ width: 120, height: 40 });
        dispose = t.dispose;

        t.app.applyServerMessage(logMessage('Listening on 0.0.0.0:19132'));
        await t.renderOnce();

        const frame = t.captureCharFrame();
        expect(frame).toContain('12:00:01 INFO    Server          Listening on 0.0.0.0:19132');
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

        // The side pane shows the vitals, so the status bar does not repeat them.
        expect(byId(t, 'side-pane')?.visible).toBe(true);
        for (const id of ['tps', 'players', 'tick', 'memory', 'uptime']) {
            expect(byId(t, `status-left-${id}`), id).toBeUndefined();
        }
    });

    it('shows the vitals in the status bar while the side pane is hidden', async () => {
        const t = await setup({ width: 99, height: 40 });
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

        expect(byId(t, 'side-pane')?.visible).toBe(false);
        for (const id of ['tps', 'players']) expect(byId(t, `status-left-${id}`), id).toBeDefined();
    });

    it('moves the state tile to running on a lifecycle message', async () => {
        const t = await setup({ width: 120, height: 40 });
        dispose = t.dispose;

        t.app.applyServerMessage({ type: 'lifecycle', v: 1, state: 'running' });
        await t.renderOnce();

        expect(tileIs(t, 'ok')).toBe(true);
    });

    it('shows the state in the status bar while the title bar is hidden', async () => {
        const t = await setup({ width: 80, height: 24 });
        dispose = t.dispose;

        t.app.applyServerMessage({ type: 'lifecycle', v: 1, state: 'running' });
        await t.renderOnce();

        expect(byId(t, 'title-bar')?.visible).toBe(false);
        expect(byId(t, 'status-left-state')).toBeDefined();
    });

    it("moves the footer's state to crashed when the supervisor reports a crash", async () => {
        const t = await setup({ width: 80, height: 24 });
        dispose = t.dispose;
        t.app.applyServerMessage({ type: 'lifecycle', v: 1, state: 'running' });

        t.app.applySupervisorEvent({ type: 'supervisor.state', state: 'crashed', code: 1, generation: 1 });
        await t.renderOnce();

        const segment = byId(t, 'status-left-state');
        expect(segment instanceof TextRenderable && segment.fg.equals(parseColor(defaultTheme.danger))).toBe(true);
    });

    it('reports a crash on the state tile and the activity line, without a notice', async () => {
        const t = await setup({ width: 120, height: 40 });
        dispose = t.dispose;

        t.app.applySupervisorEvent({ type: 'supervisor.watching', root: '/repo/packages' });
        t.app.applySupervisorEvent({ type: 'supervisor.state', state: 'crashed', code: 1, generation: 1 });
        await t.renderOnce();

        expect(tileIs(t, 'danger')).toBe(true);
        expect(activityIs(t, 'danger')).toBe(true);
        expect(byId(t, 'toast-stack')?.getChildren()).toHaveLength(0);
    });

    describe('crash card', () => {
        const trace = [
            'RangeError: The chunk at 12, -4 has no reference left to release.',
            '    at ChunkHolder.release (file:///repo/packages/chunkgen/dist/ChunkHolder.js:133:19)',
            '    at ChunkHolderMap.release (file:///repo/packages/chunkgen/dist/ChunkHolderMap.js:73:20)'
        ];

        async function crashed(overrides: Partial<AppProps> = {}) {
            const t = await setup({ width: 120, height: 40 }, overrides);
            t.app.applySupervisorEvent({ type: 'supervisor.watching', root: '/repo/packages', canRestart: true });
            t.app.applySupervisorEvent({ type: 'supervisor.output', stream: 'stderr', text: `${trace.join('\n')}\n` });
            t.app.applySupervisorEvent({ type: 'supervisor.state', state: 'crashed', code: 1, generation: 1 });
            await t.renderOnce();
            return t;
        }

        it('shows the crash and restarts on r', async () => {
            const t = await crashed();
            dispose = t.dispose;
            expect(byId(t, 'crash-card')?.visible).toBe(true);

            t.mockInput.pressKey('r');
            await t.renderOnce();
            expect(t.actions.restart).toHaveBeenCalledOnce();
        });

        it('copies the trace on c and opens the first frame on o', async () => {
            const opened: SourceLocation[] = [];
            const t = await crashed({
                openSourceLocation: async (location) => void opened.push(location)
            });
            dispose = t.dispose;

            t.mockInput.pressKey('c');
            t.mockInput.pressKey('o');
            await t.renderOnce();

            expect(t.clipboard.copy).toHaveBeenCalledWith(trace.join('\n'));
            expect(opened).toEqual([{ path: '/repo/packages/chunkgen/dist/ChunkHolder.js', line: 133, column: 19 }]);
        });

        it('leaves the keys to a line that has text', async () => {
            const t = await crashed();
            dispose = t.dispose;

            await t.mockInput.typeText('sa');
            t.mockInput.pressKey('r');
            await t.renderOnce();

            expect(t.actions.restart).not.toHaveBeenCalled();
        });

        it('goes away on Esc or the next start', async () => {
            const t = await crashed();
            dispose = t.dispose;

            // Escape in the kitty keyboard encoding, which parses at once; a lone ESC byte waits
            // on the parser's timeout.
            t.mockInput.pressKey('\u001B[27u');
            await t.renderOnce();
            expect(byId(t, 'crash-card')?.visible).toBe(false);

            t.app.applySupervisorEvent({ type: 'supervisor.state', state: 'crashed', code: 1, generation: 1 });
            await t.renderOnce();
            expect(byId(t, 'crash-card')?.visible).toBe(true);
            t.app.applySupervisorEvent({ type: 'supervisor.state', state: 'starting', generation: 2 });
            await t.renderOnce();
            expect(byId(t, 'crash-card')?.visible).toBe(false);
            expect(t.actions.restart).not.toHaveBeenCalled();
        });
    });

    it('shows the start steps in the side pane until the server runs', async () => {
        const t = await setup({ width: 120, height: 40 });
        dispose = t.dispose;
        const boot = (step: string, state: 'starting' | 'started') =>
            t.app.applyServerMessage({ type: 'boot', v: 1, step, state });

        t.app.applyServerMessage({ type: 'hello', v: 1, serverVersion: '0.15.2', pid: 1 });
        boot('prismarine:content', 'starting');
        boot('prismarine:content', 'started');
        boot('prismarine:worlds', 'starting');
        await t.renderOnce();
        expect(byId(t, 'side-pane-boot')).toBeDefined();

        t.app.applyServerMessage({ type: 'lifecycle', v: 1, state: 'running' });
        await t.renderOnce();
        expect(byId(t, 'side-pane-boot')).toBeUndefined();
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

    it('shows the activity line once the supervisor watches, taking a row from the log', async () => {
        const t = await setup({ width: 120, height: 40 });
        dispose = t.dispose;
        const logRows = byId(t, 'log-view')!.height;
        expect(byId(t, 'activity-line')?.visible).toBe(false);

        t.app.applySupervisorEvent({ type: 'supervisor.watching', root: '/repo/packages' });
        await t.renderOnce();

        expect(byId(t, 'activity-line')?.visible).toBe(true);
        expect(byId(t, 'log-view')!.height).toBe(logRows - 1);
        // The pane adds restart history only once there is some.
        expect(byId(t, 'side-pane-dev')).toBeUndefined();
    });

    it('moves a restart through the activity line in the tone of each step', async () => {
        const t = await setup({ width: 120, height: 40 });
        dispose = t.dispose;
        t.app.applySupervisorEvent({ type: 'supervisor.watching', root: '/repo/packages' });

        const steps: [SupervisorEvent, 'ok' | 'warning'][] = [
            [{ type: 'supervisor.changed', path: 'packages/prismarine/dist/Server.js' }, 'warning'],
            [{ type: 'supervisor.state', state: 'restarting', generation: 1 }, 'warning'],
            [{ type: 'supervisor.state', state: 'starting', generation: 2 }, 'warning'],
            [{ type: 'supervisor.state', state: 'running', generation: 2 }, 'ok']
        ];
        for (const [event, tone] of steps) {
            t.app.applySupervisorEvent(event);
            await t.renderOnce();
            expect(activityIs(t, tone), event.type).toBe(true);
        }
        expect(byId(t, 'toast-stack')?.getChildren()).toHaveLength(0);
        expect(byId(t, 'side-pane-dev')).toBeDefined();
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

        expect(commandLine(t)).toBe('g/w?n?');
        expect(inputFocused(t)).toBe(true);
    });

    it('routes a bracketed paste from the log pane into the command input', async () => {
        const t = await setup({ width: 120, height: 40 });
        dispose = t.dispose;

        await t.mockInput.typeText('say ');
        await focusLog(t);
        await t.mockInput.pasteBracketedText('hello');
        await t.renderOnce();

        expect(commandLine(t)).toBe('say hello');
        expect(inputFocused(t)).toBe(true);
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
        const reportTps = (t: AppHarness, tps: number): void =>
            t.app.applyServerMessage({
                type: 'status',
                v: 1,
                tps,
                tickMs: 4.1,
                players: 0,
                maxPlayers: 20,
                rssBytes: 100 * 1024 * 1024,
                uptimeMs: 1000
            });

        it('copies a selection as soon as the mouse is released', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;

            await selectInLog(t, 'copy me');
            await flush();
            await t.renderOnce();

            expect(t.clipboard.copy).toHaveBeenCalledExactlyOnceWith('copy me');
            expect(notices(t)).toEqual(['muted']);
        });

        it('does not copy again when the notice about a copy is dismissed', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;
            await selectInLog(t, 'copy me');
            await flush();
            await t.renderOnce();
            expect(t.clipboard.copy).toHaveBeenCalledOnce();

            const [toast] = byId(t, 'toast-stack')!.getChildren();
            const close = byId(t, `${toast!.id}-close`)!;
            await t.mockMouse.click(close.x + 1, close.y);
            await flush();
            await t.renderOnce();

            expect(t.clipboard.copy).toHaveBeenCalledOnce();
            expect(notices(t)).toEqual([]);
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

        it('does not copy when a tab on the TPS page is clicked', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;
            await focusLog(t);
            t.mockInput.pressKey('t');
            await t.renderOnce();

            const rows = t.captureCharFrame().split('\n');
            const y = rows.findIndex((row) => row.includes(' 15m '));
            const x = rows[y]!.indexOf(' 15m ');
            await t.mockMouse.click(x + 1, y);
            await t.mockMouse.drag(x, y, x + 4, y);
            await flush();
            await t.renderOnce();

            expect(t.clipboard.copy).not.toHaveBeenCalled();
            expect(t.captureCharFrame()).toContain('-15m');
        });

        it('does not copy when a status bar item or the details pane is selected', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;
            reportTps(t, 20);
            await t.renderOnce();
            const rows = t.captureCharFrame().split('\n');
            const bar = rows.findIndex((row) => row.includes('WARN 0'));
            const barX = rows[bar]!.indexOf('WARN 0');
            const pane = rows.findIndex((row) => row.includes('Players'));
            const paneX = rows[pane]!.indexOf('Players');

            await t.mockMouse.drag(barX, bar, barX + 6, bar);
            await t.mockMouse.drag(paneX, pane, paneX + 7, pane);
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
            expect(inputFocused(t)).toBe(true);

            t.mockInput.pressKey(cmd('c'));
            await flush();
            await t.renderOnce();

            expect(t.clipboard.copy).toHaveBeenCalledExactlyOnceWith('copy me');
            expect(commandLine(t)).toBe('');
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

            expect(notices(t)).toEqual(['warning']);
        });

        it('asks for a selection when there is nothing to copy', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;

            t.mockInput.pressKey(cmd('c'));
            await t.renderOnce();

            expect(t.clipboard.copy).not.toHaveBeenCalled();
            expect(notices(t)).toEqual(['muted']);
        });

        it('pastes the clipboard text on Cmd+V into the command line and focuses it', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;
            t.clipboard.read.mockResolvedValue('say pasted');
            await focusLog(t);

            t.mockInput.pressKey(cmd('v'));
            await flush();
            await t.renderOnce();

            expect(commandLine(t)).toBe('say pasted');
            expect(inputFocused(t)).toBe(true);
        });

        it('turns a pasted block into one line', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;

            await t.mockInput.pasteBracketedText('say one\nsay two\n');
            await t.renderOnce();

            expect(commandLine(t)).toBe('say one say two');
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

        expect(notices(t)).toEqual(['danger']);
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

        expect(notices(t)).toEqual(['danger']);
        expect(
            t.store.visible().some((record) => record.kind === 'raw' && record.message.includes('handler exploded'))
        ).toBe(true);
    });

    it('cycles the level filter with Ctrl+F', async () => {
        const t = await setup({ width: 120, height: 40 });
        dispose = t.dispose;
        for (const level of ['error', 'warn', 'info', 'debug'] as const) {
            t.app.applyServerMessage(logMessage(level, level));
        }
        await focusLog(t);
        expect(visibleLevels(t)).toEqual(['error', 'warn', 'info']);

        t.mockInput.pressKey('f', { ctrl: true });
        await t.renderOnce();
        expect(visibleLevels(t)).toEqual(['error', 'warn', 'info', 'debug']);

        t.mockInput.pressKey('f', { ctrl: true });
        await t.renderOnce();
        expect(visibleLevels(t)).toEqual(['error']);
    });

    it('closes the help overlay with Esc', async () => {
        const t = await setup({ width: 120, height: 40 });
        dispose = t.dispose;
        await focusLog(t);

        t.mockInput.pressKey('?');
        await t.renderOnce();
        expect(shown(t, 'help-overlay')).toBe(true);

        t.mockInput.pressEscape();
        // A lone ESC byte stays pending until the parser's 20 ms timeout fires.
        await new Promise((resolve) => setTimeout(resolve, 30));
        await t.waitForFrame(() => !shown(t, 'help-overlay'));
    });

    it('toggles the side pane back with a second Ctrl+B', async () => {
        const t = await setup({ width: 120, height: 40 });
        dispose = t.dispose;
        await focusLog(t);

        t.mockInput.pressKey('b', { ctrl: true });
        await t.renderOnce();
        expect(shown(t, 'side-pane')).toBe(false);

        t.mockInput.pressKey('b', { ctrl: true });
        await t.renderOnce();
        expect(shown(t, 'side-pane')).toBe(true);
    });

    it('calls stop after two Ctrl+C presses on an empty line and shows the hint', async () => {
        const t = await setup({ width: 120, height: 40 });
        dispose = t.dispose;

        t.mockInput.pressCtrlC();
        await t.renderOnce();
        expect(t.actions.stop).not.toHaveBeenCalled();
        expect(byId(t, 'status-left-hint')).toBeDefined();

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
        // Not a command, so a search: it stays local, and finding nothing says so.
        expect(t.commands).toEqual(['/stop']);
        expect(notices(t)).toHaveLength(1);
    });

    it('re-lays out when the terminal shrinks', async () => {
        const t = await setup({ width: 120, height: 40 });
        dispose = t.dispose;

        t.resize(80, 24);
        await t.renderOnce();
        await t.renderOnce();

        expect(shown(t, 'side-pane')).toBe(false);
        expect(shown(t, 'title-bar')).toBe(false);
    });

    describe('TPS page', () => {
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
            expect(frame).toMatch(/TPS\s+20\.00/);
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
            expect(frame).toMatch(/TPS\s+40\.00/);
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

        it('opens when the side pane graph is clicked', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;
            reportTps(t, [20, 19.5, 18]);
            await t.renderOnce();
            expect(shown(t, 'tps-page')).toBe(false);

            const graph = byId(t, 'side-pane-graph')!;
            await t.mockMouse.click(graph.x + 2, graph.y);
            await t.renderOnce();

            const frame = t.captureCharFrame();
            expect(shown(t, 'tps-page')).toBe(true);
            expect(frame).toMatch(/now 18\.00\s+avg/);
        });

        it('opens when the TPS segment in the status bar is clicked and closes on a second click', async () => {
            // Narrow enough that the side pane is hidden and the status bar carries TPS.
            const t = await setup({ width: 90, height: 40 });
            dispose = t.dispose;
            reportTps(t, [20]);
            await t.renderOnce();

            const segment = byId(t, 'status-left-tps')!;
            await t.mockMouse.click(segment.x + 2, segment.y);
            await t.renderOnce();
            expect(shown(t, 'tps-page')).toBe(true);

            await t.mockMouse.click(segment.x + 2, segment.y);
            await t.renderOnce();
            expect(shown(t, 'tps-page')).toBe(false);
        });

        it('opens on T with the log focused, and closes on Esc and hands the input back its focus', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;
            await focusLog(t);

            t.mockInput.pressKey('t');
            await t.renderOnce();
            expect(shown(t, 'tps-page')).toBe(true);

            t.mockInput.pressEscape();
            await new Promise((resolve) => setTimeout(resolve, 30));
            await t.waitForFrame(() => !shown(t, 'tps-page'));
            expect(inputFocused(t)).toBe(false);
        });

        it('restores input focus when it closes after opening from the input', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;
            reportTps(t, [20]);
            await t.renderOnce();

            const graph = byId(t, 'side-pane-graph')!;
            await t.mockMouse.click(graph.x + 2, graph.y);
            await t.renderOnce();
            expect(inputFocused(t)).toBe(false);

            t.mockInput.pressKey('t');
            await t.renderOnce();

            expect(shown(t, 'tps-page')).toBe(false);
            expect(inputFocused(t)).toBe(true);
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
            expect(commandLine(t)).toBe('');
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

            expect(shown(t, 'tps-page')).toBe(false);
        });

        it('leaves the input line and status bar visible and fits a small terminal', async () => {
            const t = await setup({ width: 80, height: 24 });
            dispose = t.dispose;
            reportTps(t, [20, 19]);
            t.mockInput.pressEscape();
            await new Promise((resolve) => setTimeout(resolve, 30));
            t.mockInput.pressKey('t');
            await t.renderOnce();

            // The page takes the rows above the input line; the line and the status bar stay.
            const page = byId(t, 'tps-page')!;
            expect(page.y).toBe(0);
            expect(page.y + page.height).toBe(22);
            expect(byId(t, 'command-input')?.y).toBe(22);
            expect(byId(t, 'status-left-tps')?.y).toBe(23);
        });

        it('keeps toasts readable above the page', async () => {
            // The command fails only once the page is open, and a failed command raises a notice.
            let answer: (outcome: CommandOutcome) => void = () => {};
            const t = await setup(
                { width: 120, height: 40 },
                { onCommand: () => new Promise<CommandOutcome>((resolve) => (answer = resolve)) }
            );
            dispose = t.dispose;
            await t.mockInput.typeText('nonsense');
            t.mockInput.pressEnter();
            await focusLog(t);
            t.mockInput.pressKey('t');
            await t.renderOnce();

            answer({ ok: false, error: 'Unknown command' });
            await t.waitForFrame(() => (byId(t, 'toast-stack')?.getChildren().length ?? 0) > 0);
            // The frame that added the notice laid it out; the next one draws it in place.
            await t.renderOnce();

            const [toast] = byId(t, 'toast-stack')!.getChildren();
            expect(toast).toBeDefined();
            expect(byId(t, 'tps-page')?.visible).toBe(true);
            // The notice's top left corner is drawn, not the page under it.
            const row = t.captureCharFrame().split('\n')[toast!.y] ?? '';
            expect([...row][toast!.x]).toBe('╭');
        });

        it('keeps the side pane beside the page', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;
            await focusLog(t);

            t.mockInput.pressKey('t');
            await t.renderOnce();

            expect(shown(t, 'tps-page')).toBe(true);
            expect(shown(t, 'side-pane')).toBe(true);
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
        /** `CSI code;9u` is a Super-modified key in the kitty keyboard protocol, `;10u` adds Shift. */
        const kittySuper = (letter: string, shift = false): string =>
            `\u001B[${letter.charCodeAt(0)};${shift ? 10 : 9}u`;

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
                t.mockInput.pressKey(kittySuper(binding.name, binding.shift));
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

        /** One press per binding; each check also fails when the command ran twice. */
        const effects: Record<CommandId, (t: Harness) => Promise<void>> = {
            'input.historySearch': async (t) => {
                expect(notices(t)).toHaveLength(1);
            },
            'log.pageUp': async (t) => {
                expect(topLogRow(t)).toContain('line 28');
            },
            'log.pageDown': async (t) => {
                expect(topLogRow(t)).toContain('line 37');
            },
            'log.copySelection': async (t) => {
                expect(notices(t)).toHaveLength(1);
            },
            'log.top': async (t) => {
                expect(topLogRow(t)).toContain('line 1 ');
            },
            'log.bottom': async (t) => {
                expect(t.captureCharFrame()).toContain('line 100');
                expect(shown(t, 'log-badge')).toBe(false);
            },
            'log.search': async (t) => {
                expect(commandLine(t)).toBe('/');
            },
            'log.searchNext': async (t) => {
                expect(notices(t)).toHaveLength(1);
            },
            'log.searchPrev': async (t) => {
                expect(notices(t)).toHaveLength(1);
            },
            'log.nextError': async (t) => {
                expect(notices(t)).toHaveLength(1);
            },
            'log.nextWarning': async (t) => {
                expect(notices(t)).toHaveLength(1);
            },
            'log.toggleWrap': async (t) => {
                // Wrap is on by default, so the first toggle turns it off: a long record takes one row.
                t.app.applyServerMessage(logMessage('x'.repeat(300)));
                await t.renderOnce();
                const rows = t.captureCharFrame().split('\n');
                expect(rows.filter((row) => row.includes('x'.repeat(20)))).toHaveLength(1);
                expect(notices(t)).toHaveLength(1);
            },
            'log.clearView': async (t) => {
                expect(t.captureCharFrame()).not.toMatch(/line \d/);
                expect(t.store.visible()).toHaveLength(100);
                t.app.applyServerMessage(logMessage('after clear'));
                await t.renderOnce();
                expect(topLogRow(t)).toContain('after clear');
            },
            'log.filter': async (t) => {
                // From the default of info and up, one press shows every level.
                t.app.applyServerMessage(logMessage('quiet', 'debug'));
                await t.renderOnce();
                expect(visibleLevels(t)).toContain('debug');
            },
            'view.toggleSidePane': async (t) => {
                expect(shown(t, 'side-pane')).toBe(false);
            },
            'input.paste': async (t) => {
                expect(notices(t)).toHaveLength(1);
            },
            'view.tpsGraph': async (t) => {
                expect(shown(t, 'tps-page')).toBe(true);
            },
            'view.help': async (t) => {
                expect(shown(t, 'help-overlay')).toBe(true);
            },
            'view.toggleFocus': async (t) => {
                await t.waitForFrame(() => !inputFocused(t));
            },
            'view.palette': async (t) => {
                expect(byId(t, 'command-palette')?.visible).toBe(true);
            },
            'server.restart': async (t) => {
                expect(notices(t)).toHaveLength(1);
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
            [
                ...new Map(
                    KEY_PLATFORMS.flatMap((platform) => bindingsFor(command, platform)).map((binding) => [
                        formatBinding(binding),
                        binding
                    ])
                ).entries()
            ].map(([label, binding]) => [command.id, label, binding] as const)
        );

        it.each(cases)('runs %s once from %s and does not type the key', async (id, _label, binding) => {
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
            // The key ran its command and was not typed.
            expect(commandLine(t)).toBe(id === 'log.search' ? '/' : '');
        });

        it('opens the palette from the command line and closes it on a second Ctrl+K', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;

            t.mockInput.pressKey('k', { ctrl: true });
            await t.renderOnce();
            const box = byId(t, 'command-palette')!;
            expect(box.visible).toBe(true);
            // Centered inside the terminal, not pushed off its right edge.
            const right = 120 - (box.x + box.width);
            expect(right).toBeGreaterThanOrEqual(0);
            expect(Math.abs(box.x - right)).toBeLessThanOrEqual(1);

            t.mockInput.pressKey('k', { ctrl: true });
            await t.renderOnce();
            expect(byId(t, 'command-palette')?.visible).toBe(false);
        });

        it('sends a paste to the open palette and leaves the command line alone', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;
            expect(byId(t, 'side-pane')?.visible).toBe(true);

            t.mockInput.pressKey('k', { ctrl: true });
            await t.mockInput.pasteBracketedText('side pane');
            t.mockInput.pressEnter();
            await t.renderOnce();

            expect(commandLine(t)).toBe('');
            expect(byId(t, 'side-pane')?.visible).toBe(false);
        });

        it('pastes the clipboard into the open palette on Cmd+V', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;
            t.setClipboard('side pane');

            t.mockInput.pressKey('k', { ctrl: true });
            t.mockInput.pressKey(cmd('v'));
            await flush();
            t.mockInput.pressEnter();
            await t.renderOnce();

            expect(commandLine(t)).toBe('');
            expect(byId(t, 'side-pane')?.visible).toBe(false);
        });

        it('closes the TPS page when the palette puts a command on the line', async () => {
            const t = await setup(
                { width: 120, height: 40 },
                { onComplete: async () => ({ completions: ['op', 'stop'], replace: '' }) }
            );
            dispose = t.dispose;
            t.app.applyServerMessage({ type: 'hello', v: 1, serverVersion: '0.15.2', pid: 1 });
            await focusLog(t);
            t.mockInput.pressKey('t');
            await t.renderOnce();
            expect(byId(t, 'tps-page')?.visible).toBe(true);

            t.mockInput.pressKey('k', { ctrl: true });
            await t.mockInput.typeText('stop');
            t.mockInput.pressEnter();
            await t.mockInput.typeText('now');
            await t.renderOnce();

            expect(byId(t, 'tps-page')?.visible).toBe(false);
            expect(commandLine(t)).toBe('stop now');
        });

        it('keeps the command list of the newest server when an older answer arrives late', async () => {
            const answers: ((commands: readonly CommandInfo[]) => void)[] = [];
            const t = await setup(
                { width: 120, height: 40 },
                { onCommands: () => new Promise((resolve) => answers.push(resolve)) }
            );
            dispose = t.dispose;
            t.app.applyServerMessage({ type: 'hello', v: 1, serverVersion: '0.15.2', pid: 1 });
            t.app.applyServerMessage({ type: 'hello', v: 1, serverVersion: '0.15.2', pid: 2 });
            answers[1]?.([{ name: 'teleport', aliases: [], usage: ['teleport <destination>'] }]);
            answers[0]?.([{ name: 'oldcommand', aliases: [], usage: ['oldcommand'] }]);
            await flush();

            await t.mockInput.typeText('teleport ');
            await t.renderOnce();
            expect(answers).toHaveLength(2);
            expect(byId(t, 'usage-card')?.visible).toBe(true);
        });

        it('runs a console action chosen in the palette', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;
            expect(byId(t, 'side-pane')?.visible).toBe(true);

            t.mockInput.pressKey('k', { ctrl: true });
            await t.mockInput.typeText('side pane');
            t.mockInput.pressEnter();
            await t.renderOnce();

            expect(byId(t, 'command-palette')?.visible).toBe(false);
            expect(byId(t, 'side-pane')?.visible).toBe(false);
        });

        it('puts a chosen server command or player on the command line', async () => {
            const t = await setup(
                { width: 120, height: 40 },
                { onComplete: async () => ({ completions: ['op', 'stop'], replace: '' }) }
            );
            dispose = t.dispose;
            t.app.applyServerMessage({ type: 'hello', v: 1, serverVersion: '0.15.2', pid: 1 });
            t.app.applyServerMessage({
                type: 'status',
                v: 1,
                tps: 20,
                tickMs: 4,
                players: 1,
                playerNames: ['filfat'],
                maxPlayers: 20,
                rssBytes: 0,
                uptimeMs: 0
            });
            await t.renderOnce();
            const line = () => {
                const input = byId(t, 'command-input');
                return input instanceof InputRenderable ? input.value : undefined;
            };

            t.mockInput.pressKey('k', { ctrl: true });
            await t.mockInput.typeText('op');
            t.mockInput.pressEnter();
            await t.renderOnce();
            expect(line()).toBe('op ');

            t.mockInput.pressKey('k', { ctrl: true });
            await t.mockInput.typeText('filf');
            t.mockInput.pressEnter();
            await t.renderOnce();
            expect(line()).toBe('op filfat');
            expect(inputFocused(t)).toBe(true);
        });

        it('shows the forms of the command being typed, and hides them for other lines', async () => {
            const teleport: CommandInfo = {
                name: 'teleport',
                description: 'Teleports entities.',
                aliases: ['tp'],
                usage: ['teleport <destination>', 'teleport <targets> <position>']
            };
            const t = await setup({ width: 120, height: 40 }, { onCommands: async () => [teleport] });
            dispose = t.dispose;
            t.app.applyServerMessage({ type: 'hello', v: 1, serverVersion: '0.15.2', pid: 1 });
            await t.renderOnce();
            const card = () => byId(t, 'usage-card');

            await t.mockInput.typeText('tp ');
            await t.renderOnce();
            expect(card()?.visible).toBe(true);
            // A header row and one row per form.
            expect(card()?.getChildren()).toHaveLength(1 + teleport.usage.length);

            await focusLog(t);
            expect(card()?.visible).toBe(false);

            t.app.focus();
            await t.renderOnce();
            expect(card()?.visible).toBe(true);
            t.mockInput.pressEnter();
            await t.renderOnce();
            expect(card()?.visible).toBe(false);

            await t.mockInput.typeText('nonsense ');
            await t.renderOnce();
            expect(card()?.visible).toBe(false);
        });

        it('restarts on Ctrl+Shift+R only once the supervisor says it can', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;

            await focusLog(t);
            t.app.applySupervisorEvent({ type: 'supervisor.watching', root: '/repo/packages', canRestart: false });
            t.mockInput.pressKey(kittyCtrlShift('r'));
            await t.renderOnce();
            expect(t.actions.restart).not.toHaveBeenCalled();
            expect(notices(t)).toEqual(['muted']);

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
            expect(topLogRow(t)).toContain('ERROR   Server          boom');
        });

        it('types a bound letter once the line has text', async () => {
            const t = await setup({ width: 120, height: 40 });
            dispose = t.dispose;

            await t.mockInput.typeText('sa');
            t.mockInput.pressKey('w');
            t.mockInput.pressKey('?');
            await t.renderOnce();

            expect(commandLine(t)).toBe('saw?');
            expect(shown(t, 'help-overlay')).toBe(false);
            expect(notices(t)).toEqual([]);
        });
    });
});
