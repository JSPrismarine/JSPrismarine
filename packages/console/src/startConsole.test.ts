import { memoryLinkPair } from '@jsprismarine/console-protocol';
import type { ConsoleMessage, ServerMessage } from '@jsprismarine/console-protocol';
import { TextRenderable } from '@opentui/core';
import { createTestRenderer } from '@opentui/core/testing';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { startConsole, TERMINAL_RESET } from './startConsole';
import type { ConsoleHandle } from './startConsole';
import { fakeSupervisor, startTestConsole, tempHistoryFile } from './testing/console.test-utils';

async function setup(historyFile?: string) {
    const { test, supervisor, handle, historyFile: file } = await startTestConsole(undefined, historyFile);
    const [consoleEnd, serverEnd] = memoryLinkPair<ServerMessage, ConsoleMessage>();
    const received: ConsoleMessage[] = [];
    const waiting = new Set<(message: ConsoleMessage) => boolean>();
    serverEnd.onMessage((message) => {
        received.push(message);
        for (const waiter of waiting) if (waiter(message)) waiting.delete(waiter);
    });
    /** Resolves with the first message of `type` the server end receives, now or later. */
    const receivedOf = <T extends ConsoleMessage['type']>(type: T) => {
        type Message = Extract<ConsoleMessage, { type: T }>;
        const matches = (message: ConsoleMessage): message is Message => message.type === type;
        const seen = received.find(matches);
        if (seen !== undefined) return Promise.resolve(seen);
        const { promise, resolve } = Promise.withResolvers<Message>();
        waiting.add((message) => {
            if (!matches(message)) return false;
            resolve(message);
            return true;
        });
        return promise;
    };

    return { test, supervisor, handle, consoleEnd, serverEnd, received, receivedOf, historyFile: file };
}

/**
 * `process.stdout` as seen through a proxy that records writes instead of sending them to the
 * terminal running the tests; every other member is the real stream's.
 */
function recordingStdout() {
    const writes: unknown[] = [];
    const write = (chunk: unknown): boolean => {
        writes.push(chunk);
        return true;
    };
    const stdout = new Proxy(process.stdout, {
        get(target, key) {
            if (key === 'write') return write;
            const value: unknown = Reflect.get(target, key, target);
            return typeof value === 'function' ? value.bind(target) : value;
        }
    });
    return { stdout, writes };
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
        await t.receivedOf('subscribe');

        expect(t.received).toEqual([{ type: 'subscribe', v: 1, level: 'silly' }]);
    });

    it('asks a server that says hello for its commands, and shows their forms while typing', async () => {
        const t = await setup();
        handle = t.handle;
        t.supervisor.attach(t.consoleEnd);
        t.serverEnd.send({ type: 'hello', v: 1, serverVersion: '0.15.2', pid: 1 });

        const request = await t.receivedOf('commands');
        t.serverEnd.send({
            type: 'commands.result',
            v: 1,
            id: request.id,
            commands: [{ name: 'stop', description: 'Stops the server.', aliases: [], usage: ['stop'] }]
        });

        // The card shows for a typed command once the list arrives, whichever comes first.
        await t.test.mockInput.typeText('stop');
        await t.test.waitFor(() => t.test.renderer.root.findDescendantById('usage-card')?.visible === true);
    });

    it('sends a typed command and resolves it with the matching result', async () => {
        const t = await setup();
        handle = t.handle;
        t.supervisor.attach(t.consoleEnd);

        await t.test.mockInput.typeText('say hi');
        t.test.mockInput.pressEnter();

        const command = await t.receivedOf('command');
        expect(command).toMatchObject({ type: 'command', v: 1, line: 'say hi' });

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
        const tileColor = () => {
            const title = t.test.renderer.root.findDescendantById('title-left');
            return title instanceof TextRenderable ? title.content.chunks[0]?.bg : undefined;
        };
        const starting = tileColor();
        expect(starting).toBeDefined();
        t.supervisor.emit({ type: 'supervisor.state', state: 'running', generation: 1 });
        // The supervisor's state reaches the title bar's tile, which changes color.
        await t.test.waitForFrame(
            (frame) => frame.includes('Done in 2.14 s') && tileColor()?.equals(starting!) === false
        );
    });

    it('keeps the input disabled until a link attaches and after it closes', async () => {
        const t = await setup();
        handle = t.handle;

        await t.test.renderOnce();
        expect(t.test.captureCharFrame()).toContain('the server is starting');

        t.supervisor.attach(t.consoleEnd);
        await t.test.waitForFrame((frame) => frame.includes('type a command'));

        t.supervisor.emit({ type: 'supervisor.state', state: 'stopped', generation: 1 });
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

        expect(hasHandler('exit', 'restoreTerminal')).toBe(true);
        expect(hasHandler('uncaughtException', 'onUncaught')).toBe(true);
        expect(hasHandler('unhandledRejection', 'onUnhandledRejection')).toBe(true);
        await t.test.mockInput.typeText('list');
        t.test.mockInput.pressEnter();
        await t.receivedOf('command');

        await t.handle.close();

        expect(await readFile(t.historyFile, 'utf8')).toBe('list\n');
        expect(hasHandler('exit', 'restoreTerminal')).toBe(false);
        expect(hasHandler('uncaughtException', 'onUncaught')).toBe(false);
        expect(hasHandler('unhandledRejection', 'onUnhandledRejection')).toBe(false);
        expect(t.supervisor.listenerCount).toBe(0);
        expect(t.test.renderer.isDestroyed).toBe(true);
    });

    it('only restores the terminal on an uncaught error and leaves printing and exiting to the host', async () => {
        const { stdout, writes } = recordingStdout();
        handle = await startConsole({
            supervisor: fakeSupervisor(),
            env: {},
            stdout,
            historyFile: tempHistoryFile(),
            createRenderer: async () => (await createTestRenderer({ width: 80, height: 24 })).renderer
        });
        // Observers only: a call to either would still print or exit, and Vitest fails a test
        // that calls process.exit.
        const stderr = vi.spyOn(process.stderr, 'write');
        const exit = vi.spyOn(process, 'exit');
        try {
            const onUncaught = process
                .listeners('uncaughtException')
                .find((listener) => listener.name === 'onUncaught');
            if (onUncaught === undefined) throw new Error('onUncaught is not registered');

            onUncaught(new Error('boom'), 'uncaughtException');

            expect(writes).toEqual([TERMINAL_RESET]);
            expect(stderr).not.toHaveBeenCalled();
            expect(exit).not.toHaveBeenCalled();
        } finally {
            stderr.mockRestore();
            exit.mockRestore();
        }
    });

    it('stops writing to a terminal that has gone away', async () => {
        const t = await setup();
        handle = t.handle;
        const hangUp = Object.assign(new Error('write EIO'), { code: 'EIO' });

        // A closed terminal fails every write; unhandled, the failure is an uncaught exception
        // whose reset write fails again, a loop that starves the host of its own shutdown.
        expect(() => process.stdout.emit('error', hangUp)).not.toThrow();
        const write = vi.spyOn(process.stdout, 'write');
        try {
            const onUncaught = process
                .listeners('uncaughtException')
                .find((listener) => listener.name === 'onUncaught');
            if (onUncaught === undefined) throw new Error('onUncaught is not registered');
            onUncaught(hangUp, 'uncaughtException');
            expect(write).not.toHaveBeenCalled();
        } finally {
            write.mockRestore();
        }

        await t.handle.close();
        expect(process.stdout.listeners('error').some((listener) => listener.name === 'onOutputError')).toBe(false);
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
