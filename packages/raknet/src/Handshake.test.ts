import BinaryStream from '@jsprismarine/binaryutils';
import Dgram from 'node:dgram';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_MTU_SIZE, MIN_MTU_SIZE, OFFLINE_MESSAGE_DATA_ID } from './Constants';
import ServerSocket from './ServerSocket';
import Frame from './protocol/Frame';
import FrameReliability from './protocol/FrameReliability';
import FrameSet from './protocol/FrameSet';
import { MessageIdentifiers } from './protocol/MessageIdentifiers';

/**
 * Drives a real ServerSocket over loopback UDP with hand-built packets, so the whole
 * offline handshake and the reliability layer are exercised the way a client exercises
 * them - no mocks between the socket and the session.
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

    // ServerSocket.start binds asynchronously; wait for the port to be assigned.
    const port = await new Promise<number>((resolve, reject) => {
        const socket = (server as any).socket as Dgram.Socket;
        try {
            resolve(socket.address().port);
        } catch {
            socket.once('listening', () => resolve(socket.address().port));
            socket.once('error', reject);
        }
    });

    running = { server, client };

    const send = (buffer: Buffer) => client.send(buffer, port, '127.0.0.1');
    const next = async (timeoutMs = 1000): Promise<Buffer> => {
        const deadline = Date.now() + timeoutMs;
        while (inbox.length === 0) {
            if (Date.now() > deadline) throw new Error('timed out waiting for a reply');
            await new Promise((resolve) => setTimeout(resolve, 5));
        }
        return inbox.shift()!;
    };

    return { server, send, next, inbox };
};

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

/** Wraps a payload into a reliable ordered frame inside a datagram. */
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

describe('offline handshake over a real socket', () => {
    it('answers an unconnected ping', async () => {
        const { send, next } = await start();

        const ping = new BinaryStream();
        ping.writeByte(MessageIdentifiers.UNCONNECTED_PING);
        ping.writeLong(1234n);
        ping.write(OFFLINE_MESSAGE_DATA_ID);
        send(ping.getBuffer());

        const reply = await next();
        expect(reply[0]).toBe(MessageIdentifiers.UNCONNECTED_PONG);
    });

    it('ignores a ping carrying the wrong magic', async () => {
        const { send, next } = await start();

        const forged = new BinaryStream();
        forged.writeByte(MessageIdentifiers.UNCONNECTED_PING);
        forged.writeLong(1234n);
        forged.write(Buffer.alloc(OFFLINE_MESSAGE_DATA_ID.byteLength, 0x41));
        send(forged.getBuffer());

        await expect(next(200)).rejects.toThrow('timed out');
    });

    it('re-answers a duplicate OpenConnectionRequest2, but only while the handshake is running', async () => {
        const { server, send, next } = await start();
        const serverPort = (server as any).socket.address().port;

        const opened: any[] = [];
        server.on('openConnection', (session) => opened.push(session));

        send(openConnectionRequest1(1200));
        expect((await next())[0]).toBe(MessageIdentifiers.OPEN_CONNECTION_REPLY_1);
        send(openConnectionRequest2(1200, serverPort));
        expect((await next())[0]).toBe(MessageIdentifiers.OPEN_CONNECTION_REPLY_2);

        // The session exists but nothing has been agreed on it yet, so a repeat is the
        // duplicate of a request whose reply was lost, and gets the same reply again.
        send(openConnectionRequest2(1200, serverPort));
        expect((await next())[0]).toBe(MessageIdentifiers.OPEN_CONNECTION_REPLY_2);

        send(datagram(0, 0, 0, connectionRequest()));
        send(datagram(1, 1, 1, newIncomingConnection(serverPort)));
        for (let i = 0; i < 40 && opened.length === 0; i++) {
            await new Promise((resolve) => setTimeout(resolve, 5));
        }
        expect(opened).toHaveLength(1);

        // Connected now, so the same request must be refused rather than answered: anyone
        // able to spoof a connected client's source address could otherwise talk the server
        // back through its handshake.
        send(openConnectionRequest2(1200, serverPort));

        let refused = false;
        for (let i = 0; i < 20 && !refused; i++) {
            const reply = await next();
            expect(reply[0]).not.toBe(MessageIdentifiers.OPEN_CONNECTION_REPLY_2);
            if (reply[0] === MessageIdentifiers.ALREADY_CONNECTED) refused = true;
        }
        expect(refused).toBe(true);
    });

    it('negotiates an MTU and never trusts the one the client claims', async () => {
        const { server, send, next } = await start();

        send(openConnectionRequest1(1200));
        const reply1 = await next();
        expect(reply1[0]).toBe(MessageIdentifiers.OPEN_CONNECTION_REPLY_1);

        // Claim an impossible MTU: the session must be built with a clamped one.
        send(openConnectionRequest2(9, (server as any).socket.address().port));
        const reply2 = await next();
        expect(reply2[0]).toBe(MessageIdentifiers.OPEN_CONNECTION_REPLY_2);

        const session = server.getSessions()[0]!;
        expect(session).toBeDefined();
        expect(session.getMTU()).toBeGreaterThan(0);
        expect(session.getMTU() + 28).toBeGreaterThanOrEqual(MIN_MTU_SIZE);
        expect(session.getMTU() + 28).toBeLessThanOrEqual(MAX_MTU_SIZE);
    });
});

describe('connected handshake over a real socket', () => {
    it('completes the full handshake and delivers game packets in order', async () => {
        const { server, send, next } = await start();
        const serverPort = (server as any).socket.address().port;

        const opened: any[] = [];
        server.on('openConnection', (session) => opened.push(session));
        const encapsulated: number[] = [];
        server.on('encapsulated', (frame) => encapsulated.push(frame.content[1]));

        send(openConnectionRequest1(1200));
        expect((await next())[0]).toBe(MessageIdentifiers.OPEN_CONNECTION_REPLY_1);
        send(openConnectionRequest2(1200, serverPort));
        expect((await next())[0]).toBe(MessageIdentifiers.OPEN_CONNECTION_REPLY_2);

        // ConnectionRequest -> ConnectionRequestAccepted
        send(datagram(0, 0, 0, connectionRequest()));

        let accepted = false;
        for (let i = 0; i < 20 && !accepted; i++) {
            const reply = await next();
            if ((reply[0]! & 0x80) === 0 || (reply[0]! & 0x60) !== 0) continue; // skip ACK/NACK
            const frameSet = new FrameSet(reply);
            frameSet.decode();
            for (const frame of frameSet.frames) {
                if (frame.content[0] === MessageIdentifiers.CONNECTION_REQUEST_ACCEPTED) {
                    accepted = true;
                    // H6: this must be reliable, otherwise losing it stalls the handshake.
                    expect(frame.isReliable()).toBe(true);
                }
            }
        }
        expect(accepted).toBe(true);

        // NewIncomingConnection completes the handshake.
        send(datagram(1, 1, 1, newIncomingConnection(serverPort)));
        for (let i = 0; i < 40 && opened.length === 0; i++) {
            await new Promise((resolve) => setTimeout(resolve, 5));
        }
        expect(opened).toHaveLength(1);

        // Now the reliability layer proper: send three game packets out of order, with
        // one duplicated, and expect them delivered once each in the right order.
        const game = (payload: number) => Buffer.from([0xfe, payload]);
        send(datagram(4, 4, 4, game(0xc3)));
        send(datagram(2, 2, 2, game(0xc1)));
        send(datagram(3, 3, 3, game(0xc2)));
        send(datagram(5, 3, 3, game(0xc2))); // duplicate of the previous message

        for (let i = 0; i < 60 && encapsulated.length < 3; i++) {
            await new Promise((resolve) => setTimeout(resolve, 5));
        }

        expect(encapsulated).toEqual([0xc1, 0xc2, 0xc3]);
    });

    it('survives a flood of malformed datagrams without dying', async () => {
        const { server, send, next } = await start();
        const serverPort = (server as any).socket.address().port;

        send(openConnectionRequest1(1200));
        await next();
        send(openConnectionRequest2(1200, serverPort));
        await next();

        // Everything the audit found: unknown offline id, empty datagram, negative frame
        // length, hostile ordering channel, truncated ACK, absurd sequence number.
        send(Buffer.from([0x7b]));
        send(Buffer.alloc(0));
        send(Buffer.from([0x84, 0x00, 0x00, 0x00, 0x00, 0xff, 0xe8]));
        send(Buffer.from([0x84, 0x01, 0x00, 0x00, 0x60, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0xc8, 0x15]));
        send(Buffer.from([0xc0, 0xff, 0xff]));
        send(Buffer.from([0x84, 0xff, 0xff, 0xff]));
        send(Buffer.from([0xa0, 0x00, 0x01, 0x01, 0x00, 0x00]));

        await new Promise((resolve) => setTimeout(resolve, 100));

        // Still alive and still serving.
        const ping = new BinaryStream();
        ping.writeByte(MessageIdentifiers.UNCONNECTED_PING);
        ping.writeLong(1234n);
        ping.write(OFFLINE_MESSAGE_DATA_ID);
        send(ping.getBuffer());

        let sawPong = false;
        for (let i = 0; i < 20 && !sawPong; i++) {
            const reply = await next();
            if (reply[0] === MessageIdentifiers.UNCONNECTED_PONG) sawPong = true;
        }
        expect(sawPong).toBe(true);
        expect(server.getSessions().length).toBeGreaterThanOrEqual(0);
    });
});
