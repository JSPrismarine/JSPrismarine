import { once } from 'node:events';
import { createConnection, createServer } from 'node:net';
import type { Server, Socket } from 'node:net';
import { DebuggerTransportError } from '@jsprismarine/errors/script-host';
import { afterEach, describe, expect, it } from 'vitest';

import { PortDebuggerChannel } from './channel';
import { FrameDecoder, encodeFrame } from './framing';
import { DebuggerThread } from './thread';
import type { DebuggerThreadConnection } from './thread';

/** The thread's events, as promises a test awaits in order, with no timer. */
class Events {
    public readonly connections: DebuggerThreadConnection[] = [];
    public activity = 0;
    private waiters: (() => void)[] = [];

    public readonly handlers = {
        connected: (connection: DebuggerThreadConnection): void => {
            this.connections.push(connection);
            this.wake();
        },
        activity: (): void => {
            this.activity += 1;
            this.wake();
        }
    };

    /** Resolves once `ready` holds, checking after each event. */
    public async until(ready: () => boolean): Promise<void> {
        while (!ready()) await new Promise<void>((resolve) => this.waiters.push(resolve));
    }

    private wake(): void {
        for (const waiter of this.waiters.splice(0)) waiter();
    }
}

/** The frames a socket receives, decoded, and a promise for the next one. */
const framesOf = (socket: Socket) => {
    const decoder = new FrameDecoder();
    const frames: unknown[] = [];
    let waiting: (() => void) | undefined;
    socket.on('data', (chunk: Buffer) => {
        frames.push(...decoder.push(chunk));
        waiting?.();
    });
    return {
        frames,
        next: async (): Promise<unknown> => {
            while (frames.length === 0) await new Promise<void>((resolve) => (waiting = resolve));
            return frames.shift();
        }
    };
};

const threads: DebuggerThread[] = [];
const servers: Server[] = [];
const sockets: Socket[] = [];
const channels: PortDebuggerChannel[] = [];
afterEach(async () => {
    for (const channel of channels.splice(0)) channel.close();
    for (const socket of sockets.splice(0)) socket.destroy();
    for (const server of servers.splice(0)) server.close();
    await Promise.all(threads.splice(0).map((thread) => thread.terminate()));
});

const start = (): { thread: DebuggerThread; events: Events } => {
    const events = new Events();
    const thread = new DebuggerThread(events.handlers);
    threads.push(thread);
    return { thread, events };
};

// Each test starts a worker that loads TypeScript source, which a busy host can take a while to
// do; the budget guards against a hang, not a slow machine.
describe('the debugger thread', { timeout: 120_000 }, () => {
    it('listens on its own thread and hands a connection to this thread as a channel', async () => {
        const { thread, events } = start();
        const port = await thread.listen({ port: 0 });
        const socket = createConnection({ host: '127.0.0.1', port });
        sockets.push(socket);
        const extension = framesOf(socket);

        await events.until(() => events.connections.length === 1);
        const [connection] = events.connections;
        expect(connection).toMatchObject({ address: '127.0.0.1', port: socket.localPort });
        if (connection === undefined) throw new Error('no connection');
        const channel = new PortDebuggerChannel(connection.endpoint);
        channels.push(channel);

        socket.write(encodeFrame({ type: 'resume' }));
        await events.until(() => events.activity > 0);
        expect(channel.poll()).toEqual({ type: 'resume' });

        channel.send({ type: 'event', event: { type: 'ThreadEvent', reason: 'new', thread: 1 } });
        expect(await extension.next()).toEqual({
            type: 'event',
            event: { type: 'ThreadEvent', reason: 'new', thread: 1 }
        });
    });

    it('refuses to listen beyond loopback without a passcode, with BDS’s message', async () => {
        const { thread } = start();

        await expect(thread.listen({ port: 0, address: '0.0.0.0' })).rejects.toThrow(
            /^Refusing to start script debugger listener on non-loopback address \[0\.0\.0\.0\] without a passcode\.$/
        );
    });

    it('connects to a debugger that listens, and reports a connection that fails', async () => {
        const { thread, events } = start();
        const server = createServer();
        servers.push(server);
        const accepted = once(server, 'connection');
        server.listen(0, '127.0.0.1');
        await once(server, 'listening');
        const address = server.address();
        if (address === null || typeof address === 'string') throw new Error('no TCP address');

        await thread.connect({ host: '127.0.0.1', port: address.port });
        const [socket] = (await accepted) as [Socket];
        sockets.push(socket);
        expect(events.connections).toMatchObject([{ address: '127.0.0.1', port: address.port }]);

        // A server closes once its connections have, so the extension hangs up first.
        socket.destroy();
        server.close();
        await once(server, 'close');
        await expect(thread.connect({ host: '127.0.0.1', port: address.port })).rejects.toThrow(DebuggerTransportError);
    });

    it('closes its connection and its listener when asked, and the channel then reads as closed', async () => {
        const { thread, events } = start();
        const port = await thread.listen({ port: 0 });
        const socket = createConnection({ host: '127.0.0.1', port });
        sockets.push(socket);
        await events.until(() => events.connections.length === 1);
        const [connection] = events.connections;
        if (connection === undefined) throw new Error('no connection');
        const channel = new PortDebuggerChannel(connection.endpoint);
        channels.push(channel);
        const socketClosed = once(socket, 'close');

        await thread.close();

        await socketClosed;
        expect(channel.closed).toBe(true);
        expect(channel.receive()).toBeUndefined();
    });

    it('tells this thread when the extension goes away', async () => {
        const { thread, events } = start();
        const port = await thread.listen({ port: 0 });
        const socket = createConnection({ host: '127.0.0.1', port });
        await events.until(() => events.connections.length === 1);
        const [connection] = events.connections;
        if (connection === undefined) throw new Error('no connection');
        const channel = new PortDebuggerChannel(connection.endpoint);
        channels.push(channel);
        const before = events.activity;

        socket.destroy();

        await events.until(() => events.activity > before && channel.closed);
        expect(channel.closed).toBe(true);
    });
});
