import type { ConsoleMessage, MessageLink, ServerMessage } from '@jsprismarine/console-protocol';
import { memoryLinkPair, PROTOCOL_VERSION } from '@jsprismarine/console-protocol';
import type { Logger } from '@jsprismarine/logger';
import { setImmediate } from 'node:timers/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type Server from '../Server';
import type { Command } from '../command/Command';
import type { CommandManager } from '../command/CommandManager';
import type { ConsoleSender } from '../command/ConsoleSender';
import type { Chat } from '../chat/Chat';
import { ChatType } from '../chat/Chat';
import type { Config } from '../config/Config';
import { EventEmitter } from '../events/EventEmitter';
import ChatEvent from '../events/chat/ChatEvent';
import type SessionManager from '../SessionManager';
import { stub } from '../testing/stub.test.helper';
import { RemoteConsole } from './RemoteConsole';
import type { FlushableLink } from './RemoteLogTransport';
import { RemoteLogTransport } from './RemoteLogTransport';

const v = PROTOCOL_VERSION;

/** A server double exposing what the remote console reads, with spies on what it drives. */
const fakeServer = (overrides: { dispatchCommand?: () => Promise<boolean>; players?: number } = {}) => {
    const dispatchCommand = vi.fn(overrides.dispatchCommand ?? (async () => true));
    const shutdown = vi.fn(async () => {});
    const info = vi.fn();
    const sender = stub<ConsoleSender>({ getName: () => 'CONSOLE' });
    const commands = new Map<string, Command>([
        ['jsprismarine:help', stub<Command>({ name: 'help' })],
        ['jsprismarine:stop', stub<Command>({ name: 'stop' })],
        ['jsprismarine:say', stub<Command>({ name: 'say' })]
    ]);
    let players = overrides.players ?? 0;
    let tps = 20;
    const events = new EventEmitter();
    const server: Server = stub<Server>({
        getVersion: () => '1.2.3',
        getTPS: () => tps,
        getTickMs: () => 12.5,
        getConsole: () => undefined,
        getConsoleSender: () => sender,
        getCommandManager: () => stub<CommandManager>({ dispatchCommand, getCommands: () => commands }),
        getSessionManager: () => stub<SessionManager>({ getAllPlayers: () => Array.from({ length: players }) }),
        getConfig: () => stub<Config>({ getMaxPlayers: () => 20 }),
        getLogger: () => stub<Logger>({ info }),
        on: (id, callback) => {
            events.on(id, callback);
            return server;
        },
        removeListener: (id, callback) => {
            events.removeListener(id, callback);
            return server;
        },
        shutdown
    });
    return {
        server,
        sender,
        dispatchCommand,
        shutdown,
        info,
        events,
        setPlayers: (count: number) => {
            players = count;
        },
        setTps: (value: number) => {
            tps = value;
        }
    };
};

/** Both ends of a memory link plus a recorder of what reached the console side. */
const linked = () => {
    const [serverEnd, consoleEnd] = memoryLinkPair<ConsoleMessage, ServerMessage>();
    const received: ServerMessage[] = [];
    consoleEnd.onMessage((message) => received.push(message));
    return { serverEnd, consoleEnd, received };
};

const types = (messages: readonly ServerMessage[]) => messages.map((message) => message.type);

describe('RemoteConsole', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('greets the host and reports the lifecycle as the server comes up', async () => {
        const { server } = fakeServer();
        const { serverEnd, received } = linked();
        const remote = new RemoteConsole(server, serverEnd, new RemoteLogTransport(serverEnd));

        await remote.enable();
        remote.markRunning();
        await setImmediate();

        expect(received).toEqual([
            { type: 'hello', v, serverVersion: '1.2.3', pid: process.pid },
            { type: 'lifecycle', v, state: 'starting' },
            { type: 'lifecycle', v, state: 'running' }
        ]);
        await remote.disable();
    });

    it('runs a command as the console sender and answers with its result', async () => {
        const { server, sender, dispatchCommand } = fakeServer();
        const { serverEnd, consoleEnd, received } = linked();
        const remote = new RemoteConsole(server, serverEnd, new RemoteLogTransport(serverEnd));
        await remote.enable();

        consoleEnd.send({ type: 'command', v, id: 'c1', line: 'help' });
        await setImmediate();

        expect(dispatchCommand).toHaveBeenCalledWith(sender, sender, 'help');
        expect(received.at(-1)).toEqual({ type: 'command.result', v, id: 'c1', ok: true });
        await remote.disable();
    });

    it('reports a rejected command as failed with the error text', async () => {
        const { server } = fakeServer({
            dispatchCommand: async () => {
                throw new Error('boom');
            }
        });
        const { serverEnd, consoleEnd, received } = linked();
        const remote = new RemoteConsole(server, serverEnd, new RemoteLogTransport(serverEnd));
        await remote.enable();

        consoleEnd.send({ type: 'command', v, id: 'c2', line: 'explode' });
        await setImmediate();

        expect(received.at(-1)).toEqual({ type: 'command.result', v, id: 'c2', ok: false, error: 'boom' });
        await remote.disable();
    });

    it('answers a command still running at disable as ok, once', async () => {
        // `stop` awaits `server.shutdown()`, which ends in `process.exit`, so its dispatch
        // never settles. The host must still get a result before the channel closes.
        let finish = (_ok: boolean) => {};
        const { server } = fakeServer({ dispatchCommand: () => new Promise<boolean>((resolve) => (finish = resolve)) });
        const { serverEnd, consoleEnd, received } = linked();
        const remote = new RemoteConsole(server, serverEnd, new RemoteLogTransport(serverEnd));
        await remote.enable();

        consoleEnd.send({ type: 'command', v, id: 'c3', line: 'stop' });
        await setImmediate();
        expect(types(received)).not.toContain('command.result');

        await remote.disable();
        await setImmediate();
        const results = () => received.filter((message) => message.type === 'command.result');
        expect(results()).toEqual([{ type: 'command.result', v, id: 'c3', ok: true }]);

        finish(false);
        await setImmediate();
        expect(results()).toHaveLength(1);
    });

    it('completes the text before the cursor against the command names', async () => {
        const { server } = fakeServer();
        const { serverEnd, consoleEnd, received } = linked();
        const remote = new RemoteConsole(server, serverEnd, new RemoteLogTransport(serverEnd));
        await remote.enable();

        consoleEnd.send({ type: 'complete', v, id: 'k1', line: 'st trailing', cursor: 2 });
        await setImmediate();

        expect(received.at(-1)).toEqual({ type: 'complete.result', v, id: 'k1', completions: ['stop'], replace: 'st' });
        await remote.disable();
    });

    it('applies the subscribed level to the log transport', async () => {
        const { server } = fakeServer();
        const { serverEnd, consoleEnd, received } = linked();
        const transport = new RemoteLogTransport(serverEnd);
        const remote = new RemoteConsole(server, serverEnd, transport);
        await remote.enable();

        consoleEnd.send({ type: 'subscribe', v, level: 'warn' });
        await setImmediate();
        transport.log({ level: 'info', message: 'quiet', namespace: '', timestamp: '', formatted: '' });
        transport.log({ level: 'error', message: 'loud', namespace: '', timestamp: '', formatted: '' });
        await setImmediate();

        const logs = received.filter((message) => message.type === 'log');
        expect(logs.map((message) => message.message)).toEqual(['loud']);
        await remote.disable();
    });

    it('shuts the server down when the host asks', async () => {
        const { server, shutdown } = fakeServer();
        const { serverEnd, consoleEnd } = linked();
        const remote = new RemoteConsole(server, serverEnd, new RemoteLogTransport(serverEnd));
        await remote.enable();

        consoleEnd.send({ type: 'shutdown', v });
        await setImmediate();

        expect(shutdown).toHaveBeenCalledTimes(1);
        await remote.disable();
    });

    it('shuts the server down once when the link closes', async () => {
        const { server, shutdown } = fakeServer();
        const { serverEnd, consoleEnd } = linked();
        const remote = new RemoteConsole(server, serverEnd, new RemoteLogTransport(serverEnd));
        await remote.enable();

        consoleEnd.close();
        serverEnd.close();
        await setImmediate();

        expect(shutdown).toHaveBeenCalledTimes(1);
        await remote.disable();
    });

    it('logs chat through the logger when the server has no line console', async () => {
        const { server, info, events } = fakeServer();
        const { serverEnd } = linked();
        const remote = new RemoteConsole(server, serverEnd, new RemoteLogTransport(serverEnd));
        await remote.enable();

        const chat = stub<Chat>({
            getType: () => ChatType.CHAT,
            isNeedsTranslation: () => false,
            getMessage: () => 'hi',
            getSender: () => stub<ConsoleSender>({ getName: () => 'Steve' }),
            getParameters: () => []
        });
        await events.emit('chat', new ChatEvent(chat));
        expect(info).toHaveBeenCalledWith('<Steve> hi');

        const canceled = new ChatEvent(chat);
        canceled.preventDefault();
        await events.emit('chat', canceled);
        expect(info).toHaveBeenCalledTimes(1);

        await remote.disable();
        await events.emit('chat', new ChatEvent(chat));
        expect(info).toHaveBeenCalledTimes(1);
    });

    it('sends status once a second, skipping repeats until the keep-alive gap passes', async () => {
        vi.useFakeTimers();
        const { server, setPlayers } = fakeServer();
        const { serverEnd, received } = linked();
        const remote = new RemoteConsole(server, serverEnd, new RemoteLogTransport(serverEnd), {
            statusIntervalMs: 1000,
            statusKeepAliveMs: 5000
        });
        await remote.enable();

        await vi.advanceTimersByTimeAsync(1000);
        const statuses = () => received.filter((message) => message.type === 'status');
        expect(statuses()).toHaveLength(1);
        // The measured tick duration, not the 50 ms the rate implies.
        expect(statuses()[0]).toMatchObject({ tps: 20, tickMs: 12.5, players: 0, maxPlayers: 20 });
        expect(statuses()[0]?.rssBytes).toBeGreaterThan(0);
        expect(statuses()[0]?.uptimeMs).toBeGreaterThan(0);

        await vi.advanceTimersByTimeAsync(3000);
        expect(statuses()).toHaveLength(1);

        setPlayers(1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(statuses()).toHaveLength(2);
        expect(statuses()[1]).toMatchObject({ players: 1 });

        await vi.advanceTimersByTimeAsync(5000);
        expect(statuses()).toHaveLength(3);

        await remote.disable();
    });

    it('treats a TPS wobble around a whole number as unchanged', async () => {
        vi.useFakeTimers();
        const { server, setTps } = fakeServer();
        const { serverEnd, received } = linked();
        const remote = new RemoteConsole(server, serverEnd, new RemoteLogTransport(serverEnd), {
            statusIntervalMs: 1000,
            statusKeepAliveMs: 5000
        });
        await remote.enable();
        const statuses = () => received.filter((message) => message.type === 'status');

        // A live server's two-decimal TPS moves every second; that is noise, not a change.
        for (const value of [19.98, 20.02, 19.97]) {
            setTps(value);
            await vi.advanceTimersByTimeAsync(1000);
        }
        expect(statuses()).toHaveLength(1);

        setTps(18);
        await vi.advanceTimersByTimeAsync(1000);
        expect(statuses()).toHaveLength(2);
        expect(statuses()[1]).toMatchObject({ tps: 18 });

        await remote.disable();
    });

    it('sends lifecycle stopping once across markStopping and disable', async () => {
        const { server } = fakeServer();
        const { serverEnd, received } = linked();
        const remote = new RemoteConsole(server, serverEnd, new RemoteLogTransport(serverEnd));
        await remote.enable();

        remote.markStopping();
        await remote.disable();
        await setImmediate();

        expect(types(received).filter((type) => type === 'lifecycle')).toHaveLength(2);
        expect(received.at(-1)).toEqual({ type: 'lifecycle', v, state: 'stopping' });
    });

    describe('disable', () => {
        /** A link whose `flush` resolves on demand, standing in for the IPC adapter. */
        const flushableLink = (): {
            link: FlushableLink<ConsoleMessage, ServerMessage>;
            drained: () => void;
            flush: ReturnType<typeof vi.fn>;
        } => {
            let drained = () => {};
            const flush = vi.fn(() => new Promise<void>((resolve) => (drained = resolve)));
            const base: MessageLink<ConsoleMessage, ServerMessage> = {
                send: () => true,
                onMessage: () => () => {},
                onClose: () => () => {},
                close: () => {}
            };
            return { link: { ...base, flush }, drained: () => drained(), flush };
        };

        it('waits for the link to drain before resolving', async () => {
            const { server } = fakeServer();
            const { link, drained, flush } = flushableLink();
            const remote = new RemoteConsole(server, link, new RemoteLogTransport(link));
            await remote.enable();

            let settled = false;
            const disabling = remote.disable().then(() => (settled = true));
            await setImmediate();
            expect(flush).toHaveBeenCalledTimes(1);
            expect(settled).toBe(false);

            drained();
            await disabling;
            expect(settled).toBe(true);
        });

        it('gives up on the drain after the flush timeout', async () => {
            vi.useFakeTimers();
            const { server } = fakeServer();
            const { link } = flushableLink();
            const remote = new RemoteConsole(server, link, new RemoteLogTransport(link), { flushTimeoutMs: 500 });
            await remote.enable();

            let settled = false;
            const disabling = remote.disable().then(() => (settled = true));
            await vi.advanceTimersByTimeAsync(499);
            expect(settled).toBe(false);
            await vi.advanceTimersByTimeAsync(1);
            await disabling;
            expect(settled).toBe(true);
        });
    });
});
