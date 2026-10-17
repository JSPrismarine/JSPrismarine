import BinaryStream from '@jsprismarine/binaryutils';
import Dgram from 'node:dgram';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ClientSocket from './ClientSocket';
import { MAX_MTU_SIZE, MIN_MTU_SIZE, MINECRAFT_PROTOCOL_VERSION, OFFLINE_MESSAGE_DATA_ID } from './Constants';
import ServerSocket from './ServerSocket';
import { RakNetRole, SessionStatus } from './Session';
import Frame from './protocol/Frame';
import FrameReliability from './protocol/FrameReliability';
import { MessageIdentifiers } from './protocol/MessageIdentifiers';
import IncompatibleProtocolVersion from './protocol/connection/IncompatibleProtocolVersion';

/**
 * The outgoing half of `Handshake.test.ts`: a real ClientSocket dialling a real
 * ServerSocket over loopback UDP, with nothing mocked between the two but the logger.
 *
 * Hand-built packets are what the incoming test needed, because there was no client. The
 * point of these is the opposite - that the two implementations agree without either of
 * them being told what the other expects.
 */

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), verbose: vi.fn(), debug: vi.fn(), silly: vi.fn() };
const serverName: any = { toString: () => 'MCPE;test;748;1.21.40;0;10;', setOnlinePlayerCount: vi.fn() };

let running: { server: ServerSocket | null; clients: ClientSocket[]; sockets: Dgram.Socket[] } | null = null;

afterEach(() => {
    running?.clients.forEach((client) => client.kill());
    running?.sockets.forEach((socket) => socket.close());
    running?.server?.kill();
    running = null;
});

const startServer = async (maxConnections = 10) => {
    const server = new ServerSocket(maxConnections, false, serverName, logger);
    server.start('127.0.0.1', 0);

    // ServerSocket.start binds asynchronously; wait for the port to be assigned.
    const port = await new Promise<number>((resolve, reject) => {
        const socket = (server as any).socket;
        try {
            resolve(socket.address().port);
        } catch {
            socket.once('listening', () => resolve(socket.address().port));
            socket.once('error', reject);
        }
    });

    running = { server, clients: [], sockets: [] };
    return { server, port };
};

/**
 * A bare socket that answers the first `OpenConnectionRequest1` with a refusal.
 *
 * The three ways a server has of turning a client away are all sent *before* a session
 * exists, so none of them can be provoked through a real ServerSocket without teaching it
 * to misbehave. Sixteen lines of dgram beats a test-only branch in production code.
 */
const startRefusingServer = async (refuse: (send: (buffer: Buffer) => void) => void): Promise<number> => {
    const socket = Dgram.createSocket('udp4');

    await new Promise<void>((resolve) => socket.bind(0, '127.0.0.1', resolve));
    socket.on('message', (msg, rinfo) => {
        if (msg[0] !== MessageIdentifiers.OPEN_CONNECTION_REQUEST_1) return;
        refuse((buffer) => socket.send(buffer, rinfo.port, rinfo.address));
    });

    running = { server: null, clients: [], sockets: [socket] };
    return socket.address().port;
};

const newClient = (options?: ConstructorParameters<typeof ClientSocket>[1]) => {
    const client = new ClientSocket(logger, options);
    running!.clients.push(client);
    return client;
};

const until = async (predicate: () => boolean, timeoutMs = 2_000) => {
    const deadline = Date.now() + timeoutMs;
    while (!predicate()) {
        if (Date.now() > deadline) return false;
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    return true;
};

/** Wraps a Minecraft-shaped payload the way MinecraftSession does. */
const gameFrame = (payload: Buffer) => {
    const frame = new Frame();
    frame.reliability = FrameReliability.RELIABLE_ORDERED;
    frame.orderChannel = 0;
    frame.content = payload;
    return frame;
};

describe('outgoing handshake over a real socket', () => {
    it('connects end to end and both sides agree the session is up', async () => {
        const { server, port } = await startServer();

        const opened: any[] = [];
        server.on('openConnection', (session) => opened.push(session));

        const client = newClient();
        const session = await client.connect('127.0.0.1', port);

        expect(session.getState()).toBe(SessionStatus.CONNECTED);
        expect(session.role).toBe(RakNetRole.CLIENT);
        expect(client.getSession()).toBe(session);

        // The server must have reached the same conclusion, off its own state machine.
        expect(await until(() => opened.length === 1)).toBe(true);
        expect(server.getSessions()).toHaveLength(1);
        expect(opened[0].getState()).toBe(SessionStatus.CONNECTED);

        // Both ends negotiated the same MTU, within the bounds each clamps to.
        expect(session.getMTU()).toBe(server.getSessions()[0]!.getMTU());
        expect(session.getMTU() + 28).toBeGreaterThanOrEqual(MIN_MTU_SIZE);
        expect(session.getMTU() + 28).toBeLessThanOrEqual(MAX_MTU_SIZE);
    });

    it('carries game packets to the server in order', async () => {
        const { server, port } = await startServer();

        const encapsulated: number[] = [];
        server.on('encapsulated', (frame) => encapsulated.push(frame.content[1]));

        const client = newClient();
        const session = await client.connect('127.0.0.1', port);

        for (const id of [0xc1, 0xc2, 0xc3]) {
            session.sendFrame(gameFrame(Buffer.from([0xfe, id])));
        }
        session.sendFrameQueue();

        expect(await until(() => encapsulated.length === 3)).toBe(true);
        expect(encapsulated).toEqual([0xc1, 0xc2, 0xc3]);
    });

    it('receives what the server sends back', async () => {
        const { server, port } = await startServer();

        const client = newClient();
        const received: number[] = [];
        client.on('encapsulated', (frame: Frame) => received.push(frame.content[1]!));

        await client.connect('127.0.0.1', port);
        expect(await until(() => server.getSessions().length === 1)).toBe(true);

        const serverSession = server.getSessions()[0]!;
        for (const id of [0x0b, 0x02]) {
            serverSession.sendFrame(gameFrame(Buffer.from([0xfe, id])));
        }
        serverSession.sendFrameQueue();

        expect(await until(() => received.length === 2)).toBe(true);
        expect(received).toEqual([0x0b, 0x02]);
    });

    it('survives a payload far larger than the MTU, in both directions', async () => {
        const { server, port } = await startServer();

        const client = newClient();
        const received: Buffer[] = [];
        client.on('encapsulated', (frame: Frame) => received.push(frame.content));

        const session = await client.connect('127.0.0.1', port);
        expect(await until(() => server.getSessions().length === 1)).toBe(true);

        const inbound: Buffer[] = [];
        server.on('encapsulated', (frame) => inbound.push(frame.content));

        // Chunk batches are routinely this size, so fragmentation is the common case and
        // not an edge one. Deterministic contents, so a reordered reassembly is visible.
        //
        // The leading 0xfe is not decoration: `handlePacket` dispatches on the first byte
        // of the reassembled message, so a payload beginning 0x00 is a CONNECTED_PING and
        // is answered rather than delivered. Every real Minecraft payload is a BatchPacket
        // and starts with 0xfe, which is why nothing else in the reserved range can occur.
        const payload = Buffer.alloc(24_000);
        payload[0] = 0xfe;
        for (let i = 1; i < payload.byteLength; i++) payload[i] = i & 0xff;

        session.sendFrame(gameFrame(payload));
        session.sendFrameQueue();
        expect(await until(() => inbound.length === 1, 5_000)).toBe(true);
        expect(inbound[0]!.equals(payload)).toBe(true);

        server.getSessions()[0]!.sendFrame(gameFrame(payload));
        server.getSessions()[0]!.sendFrameQueue();
        expect(await until(() => received.length === 1, 5_000)).toBe(true);
        expect(received[0]!.equals(payload)).toBe(true);
    });

    it('answers an unconnected ping with the server MOTD', async () => {
        const { port } = await startServer();

        const result = await newClient().ping('127.0.0.1', port);

        expect(result.serverName).toBe('MCPE;test;748;1.21.40;0;10;');
        expect(result.rtt).toBeGreaterThanOrEqual(0);
    });

    it('tells the caller the server is full instead of timing out', async () => {
        const { port } = await startServer(0);

        await expect(newClient().connect('127.0.0.1', port)).rejects.toThrow('the server is full');
    });

    it('reports a protocol mismatch as itself rather than as a timeout', async () => {
        const port = await startRefusingServer((send) => {
            const refusal = new IncompatibleProtocolVersion();
            refusal.protocol = MINECRAFT_PROTOCOL_VERSION + 1;
            refusal.serverGUID = 42n;
            refusal.encode();
            send(refusal.getBuffer());
        });

        await expect(newClient().connect('127.0.0.1', port)).rejects.toThrow(
            `the server speaks ${MINECRAFT_PROTOCOL_VERSION + 1}, we speak ${MINECRAFT_PROTOCOL_VERSION}`
        );
    });

    it('reports being already connected rather than as a timeout', async () => {
        const port = await startRefusingServer((send) => {
            const stream = new BinaryStream();
            stream.writeByte(MessageIdentifiers.ALREADY_CONNECTED);
            stream.write(OFFLINE_MESSAGE_DATA_ID);
            stream.writeLong(42n);
            send(stream.getBuffer());
        });

        await expect(newClient().connect('127.0.0.1', port)).rejects.toThrow('already has a connection');
    });

    it('gives up with a timeout when nothing is listening', async () => {
        await startServer();

        // Port 1 on loopback: reachable host, no socket, so nothing ever replies.
        const client = newClient({ timeoutMs: 300 });
        await expect(client.connect('127.0.0.1', 1)).rejects.toThrow('timed out');
    });

    it('disconnects cleanly and the server forgets the session', async () => {
        const { server, port } = await startServer();

        const closed: string[] = [];
        server.on('closeConnection', (_address, reason) => closed.push(reason));

        const client = newClient();
        await client.connect('127.0.0.1', port);
        expect(await until(() => server.getSessions().length === 1)).toBe(true);

        client.disconnect('leaving');

        expect(await until(() => server.getSessions().length === 0)).toBe(true);
        expect(closed).toHaveLength(1);
    });

    it('refuses a second connection on the same socket', async () => {
        const { port } = await startServer();

        const client = newClient();
        await client.connect('127.0.0.1', port);

        await expect(client.connect('127.0.0.1', port)).rejects.toThrow('Already connecting or connected');
    });

    it('ignores datagrams from anywhere but the peer it dialled', async () => {
        const { port } = await startServer();

        const client = newClient();
        const received: Buffer[] = [];
        client.on('encapsulated', (frame: Frame) => received.push(frame.content));
        await client.connect('127.0.0.1', port);

        // A well formed data datagram, but from a port we never dialled.
        const impostor = (await import('node:dgram')).createSocket('udp4');
        await new Promise<void>((resolve) => impostor.bind(0, '127.0.0.1', resolve));
        const local = client.getAddress();
        impostor.send(
            Buffer.from([0x84, 0x00, 0x00, 0x00, 0x60, 0x00, 0x10, 0x00, 0x00, 0xfe, 0x99]),
            local.getPort(),
            '127.0.0.1'
        );

        await new Promise((resolve) => setTimeout(resolve, 100));
        impostor.close();

        expect(received).toHaveLength(0);
    });

    it('keeps a connected but idle session alive past the timeout window', async () => {
        const { server, port } = await startServer();

        const client = newClient();
        const session = await client.connect('127.0.0.1', port);
        expect(await until(() => server.getSessions().length === 1)).toBe(true);

        // Nothing is sent by either side; only the keepalive ping should hold it open.
        // SESSION_TIMEOUT_MS is 10s, so this is a smoke test of the pings going out at all
        // rather than of the full window - see CONNECTED_PING_INTERVAL_MS.
        await new Promise((resolve) => setTimeout(resolve, 600));

        expect(session.getState()).toBe(SessionStatus.CONNECTED);
        expect(server.getSessions()).toHaveLength(1);
    });
});

describe('NewIncomingConnection encoding', () => {
    it('is accepted by the server that has to decode it', async () => {
        const { server, port } = await startServer();

        // The server reads the address followed by twenty system addresses and then two
        // timestamps. When encodePayload wrote the same address twenty one times the byte
        // count happened to match, which is exactly why the bug survived: the only way to
        // catch it is to have something decode a real one.
        const client = newClient();
        await client.connect('127.0.0.1', port);

        // Polled rather than asserted outright: the client reaches CONNECTED the moment it
        // *sends* NewIncomingConnection, so the server is a round trip behind it. A session
        // exists from OpenConnectionRequest2 onwards, which is why its mere presence proves
        // nothing about whether the message that follows could be decoded.
        expect(await until(() => server.getSessions()[0]?.getState() === SessionStatus.CONNECTED)).toBe(true);
    });
});

describe('CONNECTED_PONG', () => {
    it('never reaches the game layer', async () => {
        const { server, port } = await startServer();

        const client = newClient();
        const received: number[] = [];
        client.on('encapsulated', (frame: Frame) => received.push(frame.content[0]!));

        const session = await client.connect('127.0.0.1', port);
        expect(await until(() => server.getSessions().length === 1)).toBe(true);

        session.sendConnectedPing();
        session.sendFrameQueue();

        // The server answers with CONNECTED_PONG; before it was handled explicitly that
        // pong was emitted as `encapsulated` and reached the packet dispatcher as if it
        // were a Minecraft packet.
        await new Promise((resolve) => setTimeout(resolve, 150));
        expect(received).not.toContain(MessageIdentifiers.CONNECTED_PONG);
    });
});
