import type Dgram from 'node:dgram';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ClientSocket from './ClientSocket';
import LoopbackSocket, { LOOPBACK_MTU_SIZE, MAX_FRAME_CONTENT_BYTE_LENGTH } from './LoopbackSocket';
import ServerSocket from './ServerSocket';
import { SessionStatus } from './Session';
import Frame from './protocol/Frame';
import FrameReliability from './protocol/FrameReliability';
import { MessageIdentifiers } from './protocol/MessageIdentifiers';

/**
 * A loopback pair has to behave exactly as a UDP pair does, because single player is meant
 * to be the same code path as multiplayer rather than a second implementation of it. So
 * most of these run the *same* scenario twice - once over real sockets, once in memory -
 * and assert the two agree.
 */

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), verbose: vi.fn(), debug: vi.fn(), silly: vi.fn() };
const serverName: any = { toString: () => 'MCPE;test;748;1.21.40;0;10;', setOnlinePlayerCount: vi.fn() };

let teardown: Array<() => void> = [];

afterEach(() => {
    teardown.forEach((fn) => fn());
    teardown = [];
});

const until = async (predicate: () => boolean, timeoutMs = 3_000) => {
    const deadline = Date.now() + timeoutMs;
    while (!predicate()) {
        if (Date.now() > deadline) return false;
        await new Promise((resolve) => setTimeout(resolve, 5));
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

const udpPair = async (): Promise<Pair> => {
    const server = new ServerSocket(10, false, serverName, logger);
    server.start('127.0.0.1', 0);
    const port = await new Promise<number>((resolve, reject) => {
        const socket = (server as any).socket as Dgram.Socket;
        try {
            resolve(socket.address().port);
        } catch {
            socket.once('listening', () => resolve(socket.address().port));
            socket.once('error', reject);
        }
    });

    const client = new ClientSocket(logger);
    teardown.push(() => {
        client.kill();
        server.kill();
    });

    const serverInbox: Buffer[] = [];
    const clientInbox: Buffer[] = [];
    server.on('encapsulated', (frame: Frame) => serverInbox.push(frame.content));
    client.on('encapsulated', (frame: Frame) => clientInbox.push(frame.content));

    const clientSession = await client.connect('127.0.0.1', port);
    await until(() => server.getSessions().length === 1);

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

    return { serverSession: () => loopback.server.getSession(), clientSession, serverInbox, clientInbox };
};

describe.each([
    ['over UDP', udpPair],
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
        expect(await until(() => pair.serverInbox.length === 1, 8_000)).toBe(true);
        expect(pair.serverInbox[0]!.equals(payload)).toBe(true);

        const session = pair.serverSession()!;
        session.sendFrame(gameFrame(payload));
        session.sendFrameQueue();
        expect(await until(() => pair.clientInbox.length === 1, 8_000)).toBe(true);
        expect(pair.clientInbox[0]!.equals(payload)).toBe(true);
    });

    it('never delivers a CONNECTED_PONG to the game layer', async () => {
        const pair = await makePair();

        pair.clientSession.sendConnectedPing();
        pair.clientSession.sendFrameQueue();

        await new Promise((resolve) => setTimeout(resolve, 150));
        expect(pair.clientInbox.map((buffer) => buffer[0])).not.toContain(MessageIdentifiers.CONNECTED_PONG);
    });
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

        expect(await until(() => pair.serverInbox.length === 1)).toBe(true);
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

        expect(await until(() => closed.length === 1)).toBe(true);
        expect(loopback.client.getSession()).toBeNull();
    });
});
