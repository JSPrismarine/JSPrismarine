import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ClientSocket from './ClientSocket';
import LoopbackSocket, { LOOPBACK_MTU_SIZE, MAX_FRAME_CONTENT_BYTE_LENGTH } from './LoopbackSocket';
import ServerSocket from './ServerSocket';
import { SessionStatus } from './Session';
import Frame from './protocol/Frame';
import FrameReliability from './protocol/FrameReliability';
import { MessageIdentifiers } from './protocol/MessageIdentifiers';
import type { DatagramSendMode } from './ServerSocket';
import type { SocketBufferOptions } from './SocketBuffers';

/**
 * A loopback pair has to behave exactly as a UDP pair does, because single player is meant
 * to be the same code path as multiplayer rather than a second implementation of it. So
 * most of these run the *same* scenario twice - once over real sockets, once in memory -
 * and assert the two agree.
 */

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), verbose: vi.fn(), debug: vi.fn(), silly: vi.fn() };
const serverName: any = {
    toString: () => 'MCPE;test;748;1.21.40;0;10;',
    setOnlinePlayerCount: vi.fn(),
    setSessionCount: vi.fn(),
    setPort: vi.fn(),
    setServerId: vi.fn()
};

let teardown: Array<() => void> = [];

afterEach(() => {
    teardown.forEach((fn) => fn());
    teardown = [];
});

beforeEach(() => {
    // Vitest reuses workers; another suite's fake clock can stall these real-socket waits.
    vi.useRealTimers();
});

const until = async (predicate: () => boolean, timeoutMs = 3_000) => {
    // These tests need real socket and loopback progress even when another suite has
    // replaced global timers or Date; the Node timer import and hrtime bypass that clock.
    const deadline = process.hrtime.bigint() + BigInt(timeoutMs) * 1_000_000n;
    while (!predicate()) {
        if (process.hrtime.bigint() > deadline) return false;
        await delay(5);
    }
    return true;
};

const gameFrame = (payload: Buffer) => {
    const frame = new Frame();
    frame.reliability = FrameReliability.RELIABLE_ORDERED;
    frame.orderChannel = 0;
    frame.content = payload;
    return frame;
};

/** A Minecraft-shaped payload: 0xfe, then a deterministic body. */
const batch = (size: number, tag: number) => {
    const payload = Buffer.alloc(size);
    payload[0] = 0xfe;
    for (let i = 1; i < size; i++) payload[i] = (i + tag) & 0xff;
    return payload;
};

/** A connected pair over real sockets, and the same over memory. Same shape either way. */
interface Pair {
    serverSession: () => any;
    clientSession: any;
    serverInbox: Buffer[];
    clientInbox: Buffer[];
}

const udpPair = async (
    sendMode: DatagramSendMode = 'copy',
    socketBufferOptions: SocketBufferOptions = {}
): Promise<Pair> => {
    const server = new ServerSocket(10, false, serverName, logger, socketBufferOptions, sendMode);
    server.start('127.0.0.1', 0);
    const port = await new Promise<number>((resolve, reject) => {
        const socket = server['socket'];
        try {
            resolve(socket.address().port);
        } catch {
            socket.once('listening', () => resolve(socket.address().port));
            socket.once('error', reject);
        }
    });

    const client = new ClientSocket(logger, socketBufferOptions);
    teardown.push(() => {
        client.kill();
        server.kill();
    });

    const serverInbox: Buffer[] = [];
    const clientInbox: Buffer[] = [];
    server.on('encapsulated', (frame: Frame) => serverInbox.push(frame.content));
    client.on('encapsulated', (frame: Frame) => clientInbox.push(frame.content));

    const clientSession = await client.connect('127.0.0.1', port);
    const connected = await until(() => server.getSessions()[0]?.getState() === SessionStatus.CONNECTED, 5_000);
    if (!connected) throw new Error('UDP server session did not reach CONNECTED before the pair was returned');

    return { serverSession: () => server.getSessions()[0], clientSession, serverInbox, clientInbox };
};

const loopbackPair = async (): Promise<Pair> => {
    const loopback = new LoopbackSocket(logger);
    teardown.push(() => loopback.kill());

    const serverInbox: Buffer[] = [];
    const clientInbox: Buffer[] = [];
    loopback.server.on('encapsulated', (frame: Frame) => serverInbox.push(frame.content));
    loopback.client.on('encapsulated', (frame: Frame) => clientInbox.push(frame.content));

    const clientSession = await loopback.connect();
    const connected = await until(() => loopback.server.getSession()?.getState() === SessionStatus.CONNECTED);
    if (!connected) throw new Error('Loopback server session did not reach CONNECTED before the pair was returned');

    return { serverSession: () => loopback.server.getSession(), clientSession, serverInbox, clientInbox };
};

describe.each([
    ['over UDP', udpPair],
    ['over UDP with scatter-gather sends', () => udpPair('scatter-gather')],
    ['over loopback', loopbackPair]
])('a connected pair %s', (_name, makePair) => {
    it('completes the handshake on both ends', async () => {
        const pair = await makePair();

        expect(pair.clientSession.getState()).toBe(SessionStatus.CONNECTED);
        expect(await until(() => pair.serverSession()?.getState() === SessionStatus.CONNECTED)).toBe(true);
    });

    it('delivers packets client to server, in order', async () => {
        const pair = await makePair();

        for (const tag of [1, 2, 3]) pair.clientSession.sendFrame(gameFrame(Buffer.from([0xfe, tag])));
        pair.clientSession.sendFrameQueue();

        expect(await until(() => pair.serverInbox.length === 3)).toBe(true);
        expect(pair.serverInbox.map((buffer) => buffer[1])).toEqual([1, 2, 3]);
    });

    it('delivers packets server to client, in order', async () => {
        const pair = await makePair();
        const session = pair.serverSession()!;

        for (const tag of [7, 8]) session.sendFrame(gameFrame(Buffer.from([0xfe, tag])));
        session.sendFrameQueue();

        expect(await until(() => pair.clientInbox.length === 2)).toBe(true);
        expect(pair.clientInbox.map((buffer) => buffer[1])).toEqual([7, 8]);
    });

    it('reassembles a payload far larger than one frame, byte for byte', async () => {
        const pair = await makePair();
        const payload = batch(64_000, 5);

        pair.clientSession.sendFrame(gameFrame(payload));
        pair.clientSession.sendFrameQueue();
        expect(
            await until(() => pair.serverInbox.length === 1, 8_000),
            `server did not reassemble payload; inbox=${pair.serverInbox.length}, state=${pair.serverSession()?.getState()}`
        ).toBe(true);
        expect(pair.serverInbox[0]!.equals(payload)).toBe(true);

        const session = pair.serverSession()!;
        session.sendFrame(gameFrame(payload));
        session.sendFrameQueue();
        expect(
            await until(() => pair.clientInbox.length === 1, 8_000),
            `client did not reassemble payload; inbox=${pair.clientInbox.length}, state=${pair.clientSession.getState()}`
        ).toBe(true);
        expect(pair.clientInbox[0]!.equals(payload)).toBe(true);
    });

    it('never delivers a CONNECTED_PONG to the game layer', async () => {
        const pair = await makePair();

        pair.clientSession.sendConnectedPing();
        pair.clientSession.sendFrameQueue();

        // The response window is real elapsed time, independent of any suite's fake clock.
        await delay(150);
        expect(pair.clientInbox.map((buffer) => buffer[0])).not.toContain(MessageIdentifiers.CONNECTED_PONG);
    });
});

describe('UDP socket buffer burst', () => {
    it(
        'delivers every payload through RakNet reliability with configured buffers',
        {
            tags: ['performance']
        },
        async () => {
            const pair = await udpPair('copy', { recvBufferSize: 256 * 1024, sendBufferSize: 256 * 1024 });
            const payloads = Array.from({ length: 16 }, (_, index) => {
                const payload = Buffer.alloc(24 * 1024, index & 0xff);
                payload[0] = 0xfe;
                payload.writeUInt32LE(index, 1);
                return payload;
            });

            // Each payload fragments into immediate sends, so enqueueing them synchronously
            // gives the OS a burst of hundreds of datagrams before ACKs can be processed.
            for (const payload of payloads) pair.clientSession.sendFrame(gameFrame(payload));
            pair.clientSession.sendFrameQueue();

            expect(await until(() => pair.serverInbox.length === payloads.length, 15_000)).toBe(true);
            expect(pair.serverInbox).toEqual(payloads);
        }
    );
});

describe('LoopbackSocket specifics', () => {
    it('stays inside the frame length field its MTU implies', () => {
        // Frame.toBinary writes the content length in *bits* into an unsigned 16 bit field.
        // A larger loopback MTU would wrap it, and the receiver would silently read a
        // different message than the one sent.
        expect(LoopbackSocket.maxFragmentSize).toBeLessThanOrEqual(MAX_FRAME_CONTENT_BYTE_LENGTH);
        expect(LoopbackSocket.maxFragmentSize).toBeGreaterThan(8_000);
        expect(LOOPBACK_MTU_SIZE).toBeGreaterThan(1492);
    });

    it('fragments a chunk-sized batch far less than the wire would', async () => {
        const pair = await loopbackPair();
        const payload = batch(24_000, 9);

        pair.clientSession.sendFrame(gameFrame(payload));
        pair.clientSession.sendFrameQueue();

        expect(
            await until(() => pair.serverInbox.length === 1),
            `loopback server did not reassemble chunk batch; inbox=${pair.serverInbox.length}, state=${pair.serverSession()?.getState()}`
        ).toBe(true);
        expect(pair.serverInbox[0]!.equals(payload)).toBe(true);
        // 24000 / 8163 is three fragments here, against seventeen at a negotiated 1464.
        expect(Math.ceil(payload.byteLength / LoopbackSocket.maxFragmentSize)).toBe(3);
    });

    it('does not nest deliveries, however conversational the two ends are', async () => {
        // Every packet answered inline used to nest a second delivery inside the first, so
        // a ping-pong of any depth grew the stack. Delivery goes through a microtask now.
        const loopback = new LoopbackSocket(logger);
        teardown.push(() => loopback.kill());

        let depth = 0;
        let maxDepth = 0;
        let exchanges = 0;

        loopback.server.on('encapsulated', () => {
            depth++;
            maxDepth = Math.max(maxDepth, depth);
            if (exchanges++ < 40) {
                const session = loopback.server.getSession()!;
                session.sendFrame(gameFrame(Buffer.from([0xfe, exchanges & 0xff])));
                session.sendFrameQueue();
            }
            depth--;
        });

        loopback.client.on('encapsulated', () => {
            const session = loopback.client.getSession()!;
            session.sendFrame(gameFrame(Buffer.from([0xfe, 0x01])));
            session.sendFrameQueue();
        });

        const clientSession = await loopback.connect();
        clientSession.sendFrame(gameFrame(Buffer.from([0xfe, 0x00])));
        clientSession.sendFrameQueue();

        expect(await until(() => exchanges >= 40)).toBe(true);
        expect(maxDepth).toBe(1);
    });

    it('tells both ends when the session closes', async () => {
        const loopback = new LoopbackSocket(logger);
        teardown.push(() => loopback.kill());

        const closed: string[] = [];
        loopback.server.on('closeConnection', (_address: unknown, reason: string) => closed.push(reason));

        const clientSession = await loopback.connect();
        clientSession.disconnect('leaving');

        expect(
            await until(() => closed.length === 1),
            `close notification count=${closed.length}, client state=${clientSession.getState()}, server state=${loopback.server.getSession()?.getState()}`
        ).toBe(true);
        expect(loopback.client.getSession()).toBeNull();
    });
});
