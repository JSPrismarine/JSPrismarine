import { memoryLinkPair } from '@jsprismarine/console-protocol';
import type { ConsoleMessage, ServerMessage, SupervisorEvent } from '@jsprismarine/console-protocol';
import { createTestRenderer } from '@opentui/core/testing';
import type { TestRendererSetup } from '@opentui/core/testing';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { startConsole, TERMINAL_RESET } from './startConsole';
import type { ConsoleHandle, ServerLink } from './startConsole';

function fakeSupervisor() {
    const eventListeners = new Set<(event: SupervisorEvent) => void>();
    const linkListeners = new Set<(link: ServerLink | undefined) => void>();
    return {
        onEvent(listener: (event: SupervisorEvent) => void) {
            eventListeners.add(listener);
            return () => {
                eventListeners.delete(listener);
            };
        },
        onLink(listener: (link: ServerLink | undefined) => void) {
            linkListeners.add(listener);
            return () => {
                linkListeners.delete(listener);
            };
        },
        restart: vi.fn(),
        stop: vi.fn(),
        forceStop: vi.fn(),
        emit(event: SupervisorEvent) {
            for (const listener of eventListeners) listener(event);
        },
        attach(link: ServerLink) {
            for (const listener of linkListeners) listener(link);
        },
        get listenerCount() {
            return eventListeners.size + linkListeners.size;
        }
    };
}

const nextTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function setup(historyFile = join(tmpdir(), `jsp-console-${process.pid}-${Date.now()}`, 'history')) {
    let test: TestRendererSetup | undefined;
    const supervisor = fakeSupervisor();
    const handle = await startConsole({
        supervisor,
        historyFile,
        serverName: 'default',
        version: '0.15.2',
        env: {},
        createRenderer: async () => {
            test = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false });
            return test.renderer;
        }
    });
    if (test === undefined) throw new Error('createRenderer was not called');

    const [consoleEnd, serverEnd] = memoryLinkPair<ServerMessage, ConsoleMessage>();
    const received: ConsoleMessage[] = [];
    serverEnd.onMessage((message) => received.push(message));

    return { test, supervisor, handle, consoleEnd, serverEnd, received, historyFile };
}

describe('startConsole', () => {
    let handle: ConsoleHandle | undefined;

    afterEach(async () => {
        await handle?.close();
        handle = undefined;
    });

    it('subscribes to every level when a server link attaches', async () => {
        const t = await setup();
        handle = t.handle;

        t.supervisor.attach(t.consoleEnd);
        await nextTick();

        expect(t.received).toEqual([{ type: 'subscribe', v: 1, level: 'silly' }]);
    });

    it('sends a typed command and resolves it with the matching result', async () => {
        const t = await setup();
        handle = t.handle;
        t.supervisor.attach(t.consoleEnd);
        await nextTick();

        await t.test.mockInput.typeText('say hi');
        t.test.mockInput.pressEnter();
        await nextTick();

        const command = t.received.find((message) => message.type === 'command');
        expect(command).toMatchObject({ type: 'command', v: 1, line: 'say hi' });
        if (command?.type !== 'command') throw new Error('no command received');

        t.serverEnd.send({ type: 'command.result', v: 1, id: command.id, ok: false, error: 'Unknown command "say"' });
        await t.test.waitForFrame((frame) => frame.includes('Unknown command "say"'));
    });

    it('renders server log messages and supervisor events', async () => {
        const t = await setup();
        handle = t.handle;
        t.supervisor.attach(t.consoleEnd);

        t.serverEnd.send({
            type: 'log',
            v: 1,
            seq: 1,
            level: 'info',
            namespace: 'Server',
            at: Date.now(),
            message: 'Done in 2.14 s',
            formatted: 'Done in 2.14 s'
        });
        t.supervisor.emit({ type: 'supervisor.state', state: 'running', generation: 1 });
        await t.test.waitForFrame((frame) => frame.includes('Done in 2.14 s') && frame.includes('● running'));
    });

    it('keeps the input disabled until a link attaches and after it closes', async () => {
        const t = await setup();
        handle = t.handle;

        await t.test.renderOnce();
        expect(t.test.captureCharFrame()).toContain('server is not running');

        t.supervisor.attach(t.consoleEnd);
        await t.test.waitForFrame((frame) => frame.includes('type a command'));

        t.consoleEnd.close();
        await t.test.waitForFrame((frame) => frame.includes('server is not running'));
    });

    it('undoes every terminal mode the renderer turns on in the reset sequence', () => {
        expect(TERMINAL_RESET).toContain('\x1b[<u');
        expect(TERMINAL_RESET).toContain('\x1b[?1004l');
        expect(TERMINAL_RESET).toContain('\x1b[?2026l');
        expect(TERMINAL_RESET).toContain('\x1b[0m');
        expect(TERMINAL_RESET).toContain('\x1b[?1049l');
        expect(TERMINAL_RESET.endsWith('\x1b[?25h')).toBe(true);
    });

    it('saves history and removes its process handlers on close', async () => {
        const hasHandler = (event: 'exit' | 'uncaughtException' | 'unhandledRejection', name: string) =>
            process.listeners(event).some((listener) => listener.name === name);
        const t = await setup();
        handle = t.handle;
        t.supervisor.attach(t.consoleEnd);
        await nextTick();

        expect(hasHandler('exit', 'restoreTerminal')).toBe(true);
        expect(hasHandler('uncaughtException', 'onUncaught')).toBe(true);
        expect(hasHandler('unhandledRejection', 'onUnhandledRejection')).toBe(true);
        await t.test.mockInput.typeText('list');
        t.test.mockInput.pressEnter();
        await nextTick();

        await t.handle.close();

        expect(await readFile(t.historyFile, 'utf8')).toBe('list\n');
        expect(hasHandler('exit', 'restoreTerminal')).toBe(false);
        expect(hasHandler('uncaughtException', 'onUncaught')).toBe(false);
        expect(hasHandler('unhandledRejection', 'onUnhandledRejection')).toBe(false);
        expect(t.supervisor.listenerCount).toBe(0);
        expect(t.test.renderer.isDestroyed).toBe(true);
    });

    it('rejects with a clear error when the renderer cannot start', async () => {
        await expect(
            startConsole({
                supervisor: fakeSupervisor(),
                env: {},
                historyFile: join(tmpdir(), 'jsp-console-none', 'history'),
                createRenderer: async () => {
                    throw new Error('libopentui.dylib not found');
                }
            })
        ).rejects.toThrow('The console could not start its renderer: libopentui.dylib not found');
    });
});
