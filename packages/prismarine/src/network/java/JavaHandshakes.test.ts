import { connect } from 'node:net';
import type { Socket } from 'node:net';

import { ClientIntent, Intention } from '@jsprismarine/protocol/java/packet/handshake';
import type { JavaPacketDefinition } from '@jsprismarine/protocol/java/packet/JavaPacket';
import { decodeJavaPacket, encodeJavaPacket, readJavaPacketId } from '@jsprismarine/protocol/java/packet/JavaPacket';
import { LoginDisconnect } from '@jsprismarine/protocol/java/packet/login';
import { PingRequest, PongResponse, StatusRequest, StatusResponse } from '@jsprismarine/protocol/java/packet/status';
import { NEWEST_JAVA_RELEASE } from '@jsprismarine/protocol/java/versions/javaReleases';
import { afterEach, describe, expect, it } from 'vitest';

import { ConnectionIds } from '../transport/ConnectionId';
import { framed, TcpFrameReader } from '../transport/tcpFrames';
import { TcpTransport } from '../transport/TcpTransport';
import { JavaHandshakes } from './JavaHandshakes';

/** A Java client on a loopback socket, which reads the server's frames as they arrive. */
const client = async (port: number) => {
    const socket: Socket = connect(port, '127.0.0.1');
    await new Promise<void>((resolve) => socket.once('connect', () => resolve()));
    const reader = new TcpFrameReader();
    const frames: Buffer[] = [];
    const waiting: (() => void)[] = [];
    socket.on('data', (chunk: Buffer) => {
        const read = reader.push(chunk);
        if ('frames' in read) frames.push(...read.frames);
        for (const wake of waiting.splice(0)) wake();
    });
    const closed = new Promise<void>((resolve) => socket.once('close', () => resolve()));

    return {
        closed,
        send: <T>(definition: JavaPacketDefinition<T>, value: T) =>
            socket.write(framed(encodeJavaPacket(definition, value))),
        /** The next frame from the server, decoded as `definition`. */
        receive: async <T>(definition: JavaPacketDefinition<T>): Promise<T> => {
            while (frames.length === 0) await new Promise<void>((resolve) => waiting.push(resolve));
            const { id, body } = readJavaPacketId(frames.shift()!);
            expect(id).toBe(definition.id);
            return decodeJavaPacket(definition, body);
        },
        destroy: () => socket.destroy()
    };
};

const status = { getMotd: () => 'A JSPrismarine server', getOnlinePlayerCount: () => 3, getMaxPlayerCount: () => 20 };

describe('JavaHandshakes', () => {
    let transport: TcpTransport | undefined;
    afterEach(() => transport?.close());

    const listen = async () => {
        transport = new TcpTransport(new ConnectionIds(), { debug: () => {} });
        new JavaHandshakes(transport, status, { debug: () => {} });
        await transport.listen('127.0.0.1', 0);
        return transport.port()!;
    };

    const handshake = (intent: ClientIntent, port: number) => ({
        protocolVersion: NEWEST_JAVA_RELEASE.protocolVersion,
        serverAddress: 'localhost',
        serverPort: port,
        intent
    });

    it('answers a server list ping with the version, the counts and the MOTD, then the pong, and hangs up', async () => {
        const port = await listen();
        const java = await client(port);

        java.send(Intention, handshake(ClientIntent.Status, port));
        java.send(StatusRequest, {});
        const { json } = await java.receive(StatusResponse);
        java.send(PingRequest, { timestamp: 42n });

        expect(JSON.parse(json)).toEqual({
            version: { name: NEWEST_JAVA_RELEASE.minecraftVersion, protocol: NEWEST_JAVA_RELEASE.protocolVersion },
            players: { max: 20, online: 3 },
            description: { text: 'A JSPrismarine server' },
            enforcesSecureChat: false
        });
        expect(await java.receive(PongResponse)).toEqual({ timestamp: 42n });
        await java.closed;
    });

    it('refuses a join with a reason the client shows, and hangs up', async () => {
        const port = await listen();
        const java = await client(port);

        java.send(Intention, handshake(ClientIntent.Login, port));
        // Login Start's first field is the name; the refusal does not read it.
        java.send(StatusRequest, {});

        const { reason } = await java.receive(LoginDisconnect);
        expect(JSON.parse(reason)).toEqual({ text: 'This server does not take Java Edition players yet.' });
        await java.closed;
    });

    it('hangs up on a packet its phase has no place for', async () => {
        const port = await listen();
        const java = await client(port);

        java.send(PingRequest, { timestamp: 1n });

        await java.closed;
    });
});
