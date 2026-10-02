import BinaryStream from '@jsprismarine/binaryutils';
import Dgram from 'node:dgram';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DISCONNECT_LINGER_TIMEOUT_MS, OFFLINE_MESSAGE_DATA_ID, RTO_MAX_MS, SESSION_TIMEOUT_MS } from './Constants';
import ServerSocket from './ServerSocket';
import ACK from './protocol/ACK';
import Frame from './protocol/Frame';
import FrameReliability from './protocol/FrameReliability';
import FrameSet from './protocol/FrameSet';
import { MessageIdentifiers } from './protocol/MessageIdentifiers';
import { monotonicNow } from './utils/Clock';

/**
 * How a session ends, driven over a real socket with hand-built packets.
 *
 * The interesting half of a disconnect is what happens *after* the goodbye goes out, which
 * is precisely what a mock cannot show: whether the session is still there to retransmit it,
 * and whether it is gone once the peer has answered.
 */

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), verbose: vi.fn(), debug: vi.fn(), silly: vi.fn() };
const serverName: any = { toString: () => 'MCPE;test;0;0;0;0;0;', setOnlinePlayerCount: vi.fn() };

const CLIENT_GUID = 0x0123456789abcdefn;

let running: { server: ServerSocket; client: Dgram.Socket } | null = null;

afterEach(() => {
    running?.client.close();
    running?.server.kill();
    running = null;
});

const start = async () => {
    const server = new ServerSocket(10, false, serverName, logger);
    server.start('127.0.0.1', 0);

    const client = Dgram.createSocket('udp4');
    const inbox: Buffer[] = [];
    client.on('message', (msg) => inbox.push(msg));
    await new Promise<void>((resolve) => client.bind(0, '127.0.0.1', resolve));

    const socket = (server as any).socket as Dgram.Socket;
    const port = await new Promise<number>((resolve, reject) => {
        try {
            resolve(socket.address().port);
        } catch {
            socket.once('listening', () => resolve(socket.address().port));
            socket.once('error', reject);
        }
    });

    running = { server, client };

    const send = (buffer: Buffer) => client.send(buffer, port, '127.0.0.1');
    const settle = async (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));
    const until = async <T>(get: () => T | undefined, timeoutMs = 1000): Promise<T> => {
        const deadline = Date.now() + timeoutMs;
        for (;;) {
            const value = get();
            if (value !== undefined) return value;
            if (Date.now() > deadline) throw new Error('timed out waiting');
            await settle(5);
        }
    };

    return { server, port, send, inbox, settle, until };
};

// ---------------------------------------------------------------- packet builders

const openConnectionRequest1 = (mtuProbe: number) => {
    const stream = new BinaryStream();
    stream.writeByte(MessageIdentifiers.OPEN_CONNECTION_REQUEST_1);
    stream.write(OFFLINE_MESSAGE_DATA_ID);
    stream.writeByte(11); // MINECRAFT_PROTOCOL_VERSION
    const header = stream.getBuffer();
    return Buffer.concat([header, Buffer.alloc(Math.max(0, mtuProbe - header.byteLength))]);
};

const openConnectionRequest2 = (mtuSize: number, serverPort: number) => {
    const stream = new BinaryStream();
    stream.writeByte(MessageIdentifiers.OPEN_CONNECTION_REQUEST_2);
    stream.write(OFFLINE_MESSAGE_DATA_ID);
    stream.writeByte(4); // IPv4
    for (const byte of [127, 0, 0, 1]) stream.writeByte(~byte & 0xff);
    stream.writeUnsignedShort(serverPort);
    stream.writeUnsignedShort(mtuSize);
    stream.writeLong(CLIENT_GUID);
    return stream.getBuffer();
};

const datagram = (sequenceNumber: number, reliableIndex: number, orderIndex: number, payload: Buffer) => {
    const frame = new Frame();
    frame.reliability = FrameReliability.RELIABLE_ORDERED;
    frame.orderChannel = 0;
    frame.reliableIndex = reliableIndex;
    frame.orderIndex = orderIndex;
    frame.content = payload;

    const frameSet = new FrameSet();
    frameSet.sequenceNumber = sequenceNumber;
    frameSet.frames = [frame];
    frameSet.encode();
    return frameSet.getBuffer();
};

const connectionRequest = () => {
    const stream = new BinaryStream();
    stream.writeByte(MessageIdentifiers.CONNECTION_REQUEST);
    stream.writeLong(CLIENT_GUID);
    stream.writeLong(BigInt(Date.now()));
    stream.writeByte(0);
    return stream.getBuffer();
};

const newIncomingConnection = (serverPort: number) => {
    const stream = new BinaryStream();
    stream.writeByte(MessageIdentifiers.NEW_INCOMING_CONNECTION);
    const address = () => {
        stream.writeByte(4);
        for (const byte of [127, 0, 0, 1]) stream.writeByte(~byte & 0xff);
        stream.writeUnsignedShort(serverPort);
    };
    address();
    for (let i = 0; i < 20; i++) address();
    stream.writeLong(BigInt(Date.now()));
    stream.writeLong(BigInt(Date.now()));
    return stream.getBuffer();
};

const acknowledge = (sequenceNumber: number) => {
    const packet = new ACK();
    packet.sequenceNumbers = [sequenceNumber];
    packet.encode();
    return packet.getBuffer();
};

// ---------------------------------------------------------------- inbox predicates

const isDataDatagram = (buffer: Buffer) => (buffer[0]! & 0x80) !== 0 && (buffer[0]! & 0x60) === 0;

/** The sequence number of the datagram carrying a goodbye, if this is one. */
const goodbyeSequence = (buffer: Buffer): number | undefined => {
    if (!isDataDatagram(buffer)) return undefined;

    const frameSet = new FrameSet(buffer);
    frameSet.decode();

    return frameSet.frames.some((frame) => frame.content[0] === MessageIdentifiers.DISCONNECTION_NOTIFICATION)
        ? frameSet.sequenceNumber
        : undefined;
};

const goodbyes = (inbox: Buffer[]) => inbox.map(goodbyeSequence).filter((seq) => seq !== undefined);

/** Completes the whole handshake and hands back the server's view of the session. */
const connect = async (harness: Awaited<ReturnType<typeof start>>) => {
    const { server, port, send, inbox, until } = harness;

    send(openConnectionRequest1(1200));
    await until(() => inbox.find((msg) => msg[0] === MessageIdentifiers.OPEN_CONNECTION_REPLY_1));
    send(openConnectionRequest2(1200, port));
    await until(() => inbox.find((msg) => msg[0] === MessageIdentifiers.OPEN_CONNECTION_REPLY_2));

    send(datagram(0, 0, 0, connectionRequest()));
    send(datagram(1, 1, 1, newIncomingConnection(port)));

    const session = await until(() => server.getSessions()[0]);
    await until(() => (server.getSessions().length === 1 ? true : undefined));
    inbox.length = 0;

    return session;
};

describe('hanging up', () => {
    it('holds the session open until the peer acknowledges the goodbye', async () => {
        const harness = await start();
        const { server, send, inbox, settle, until } = harness;

        const closed: string[] = [];
        server.on('closeConnection', (_address, reason) => closed.push(reason));

        const session = await connect(harness);
        session.disconnect('kicked');

        // The goodbye is out, but the session must not be: nothing would retransmit it.
        const sequence = await until(() => goodbyes(inbox)[0]);
        expect(server.getSessions()).toHaveLength(1);
        expect(closed).toHaveLength(0);

        send(acknowledge(sequence));

        await until(() => (server.getSessions().length === 0 ? true : undefined));
        await settle();
        expect(closed).toEqual(['kicked']);
    });

    it('retransmits a goodbye the peer never acknowledged', async () => {
        const harness = await start();
        const { server, inbox, until } = harness;

        const session = await connect(harness);

        const startedAt = monotonicNow();
        session.disconnect('kicked');
        const first = await until(() => goodbyes(inbox)[0]);

        // Driven forward by hand rather than by waiting out a real retransmission timeout,
        // and to a point still inside the linger: the whole claim is that the resend pass
        // reaches a session that has already said goodbye.
        inbox.length = 0;
        session.update(startedAt + RTO_MAX_MS + 50);

        // The same message in a new datagram. A reliable message keeps its identity across
        // retransmissions; only the sequence number carrying it moves on.
        const resent = await until(() => goodbyes(inbox)[0]);
        expect(resent).not.toBe(first);
        expect(server.getSessions()).toHaveLength(1);
    });

    it('gives up on a peer that never acknowledges rather than lingering for ever', async () => {
        const harness = await start();
        const { server } = harness;

        const closed: string[] = [];
        server.on('closeConnection', (_address, reason) => closed.push(reason));

        const session = await connect(harness);
        session.disconnect('kicked');
        expect(server.getSessions()).toHaveLength(1);

        session.update(monotonicNow() + DISCONNECT_LINGER_TIMEOUT_MS + 1);

        expect(server.getSessions()).toHaveLength(0);
        expect(closed).toEqual(['kicked']);
    });

    it('answers the peer goodbye with an acknowledgement and nothing else', async () => {
        const harness = await start();
        const { server, send, inbox, settle, until } = harness;

        const session = await connect(harness);
        expect(session).toBeDefined();

        send(datagram(2, 2, 2, Buffer.from([MessageIdentifiers.DISCONNECTION_NOTIFICATION])));

        await until(() => (server.getSessions().length === 0 ? true : undefined));
        await settle();

        // RakNet acks a DISCONNECTION_NOTIFICATION and says nothing back; a goodbye of our
        // own would only reach an address that has already forgotten us.
        expect(inbox.some((msg) => (msg[0]! & 0x40) !== 0)).toBe(true);
        expect(goodbyes(inbox)).toEqual([]);
    });

    it('tells connected clients when the server itself goes down', async () => {
        const harness = await start();
        const { server, inbox, until } = harness;

        await connect(harness);
        inbox.length = 0;

        // A shutdown used to close the socket and leave every client to work it out from ten
        // seconds of silence. RakNet's own `Shutdown` notifies each system first.
        server.kill();

        await expect(until(() => goodbyes(inbox)[0])).resolves.toBeGreaterThanOrEqual(0);
    });

    it('closes a timed out session without a goodbye', async () => {
        const harness = await start();
        const { server, inbox } = harness;

        const closed: string[] = [];
        server.on('closeConnection', (_address, reason) => closed.push(reason));

        const session = await connect(harness);

        // One pass to clear the activity flag the handshake set, then one past the timeout.
        const now = monotonicNow();
        session.update(now);
        inbox.length = 0;
        session.update(now + SESSION_TIMEOUT_MS + 1);
        await new Promise((resolve) => setTimeout(resolve, 30));

        expect(closed).toEqual(['timeout']);
        expect(server.getSessions()).toHaveLength(0);
        expect(goodbyes(inbox)).toEqual([]);
    });
});

describe('unconnected traffic', () => {
    it('routes a query datagram to the raw listener', async () => {
        const { server, send, until } = await start();

        const raw: Buffer[] = [];
        server.on('raw', (buffer: Buffer) => raw.push(buffer));

        // GameSpy's magic is 0xfe 0xfd, so the id byte carries RakNet's VALID bit and a
        // test on that bit alone used to send the whole thing down the connected path.
        const handshake = new BinaryStream();
        handshake.writeByte(MessageIdentifiers.QUERY);
        handshake.writeByte(0xfd);
        handshake.writeByte(0x09); // handshake
        handshake.writeInt(1);
        send(handshake.getBuffer());

        const received = await until(() => raw[0]);
        expect(received.readUInt16BE(0)).toBe(0xfefd);
    });
});
