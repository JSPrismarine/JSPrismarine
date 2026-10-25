import type { LogLevel } from '@jsprismarine/logger';
import { createTestRenderer } from '@opentui/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CommandHistory } from '../input/history';
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
    return { ...test, app, store, history, commands, actions };
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

    it('uses short level tokens and no namespace column at 80 columns', async () => {
        const t = await setup({ width: 80, height: 24 });
        dispose = t.dispose;

        t.app.applyServerMessage(logMessage('Listening on 0.0.0.0:19132'));
        await t.renderOnce();

        const frame = t.captureCharFrame();
        expect(frame).toContain('12:00:01 INF Listening on 0.0.0.0:19132');
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

        expect(t.captureCharFrame()).toContain('server restarted (generation 2)');
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

        expect(t.captureCharFrame()).toContain('console error: handler exploded');
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

    it('opens the help overlay with ? and closes it with Esc', async () => {
        const t = await setup({ width: 120, height: 40 });
        dispose = t.dispose;

        await t.mockInput.typeText('?');
        await t.renderOnce();
        expect(t.captureCharFrame()).toContain('Keyboard shortcuts');

        t.mockInput.pressEscape();
        // A lone ESC byte stays pending until the parser's 20 ms timeout fires.
        await new Promise((resolve) => setTimeout(resolve, 30));
        await t.waitForFrame((frame) => !frame.includes('Keyboard shortcuts'));
    });

    it('toggles the side pane with Ctrl+B', async () => {
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
});
