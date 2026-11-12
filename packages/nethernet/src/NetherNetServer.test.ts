import dgram from 'node:dgram';
import { once } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

import { SEGMENT_BYTES } from './Connection';
import type { Connection } from './Connection';
import { LanDiscovery } from './LanDiscovery';
import { NetherNetClient } from './NetherNetClient';
import { NetherNetServer } from './NetherNetServer';
import { PortAllocator } from './PortAllocator';
import { SignalStructure, SignalType } from './protocol/Signal';
import { loadDriver, nativeAvailable } from './testing/nativeDriver.test.helper';
import type { PeerConfig, WebRtcDriver } from './WebRtcDriver';

const LOOPBACK: PeerConfig = { bindAddress: '127.0.0.1' };

/** Joins a client to a server in this process, carrying the signals between them directly. */
const join = async (driver: WebRtcDriver, server: NetherNetServer) => {
    const opened = once(server, 'openConnection') as Promise<[Connection]>;
    const client: NetherNetClient = new NetherNetClient({
        driver,
        peerConfig: LOOPBACK,
        signal: (signal) => {
            if (signal.type !== SignalType.ConnectRequest) return;
            void server.handleOffer(new SignalStructure(signal.type, signal.connectionId, signal.data, 7n), (reply) =>
                client.handleSignal(reply)
            );
        }
    });
    const connected = once(client, 'connected');
    await client.connect();
    await connected;
    const [connection] = await opened;
    return { client, connection };
};

/** A UDP port nothing holds right now. */
const freePort = async (): Promise<number> => {
    const socket = dgram.createSocket('udp4');
    socket.bind(0, '127.0.0.1');
    await once(socket, 'listening');
    const { port } = socket.address();
    socket.close();
    return port;
};

describe.skipIf(!nativeAvailable())('NetherNet over the native driver', async () => {
    const driver = await loadDriver();

    it('opens a connection both ways, and carries messages of every size intact', async () => {
        const server = new NetherNetServer({ driver, peerConfig: () => LOOPBACK });
        const { client, connection } = await join(driver, server);
        try {
            const toServer: Buffer[] = [];
            const toClient: Buffer[] = [];
            server.on('encapsulated', (message: Buffer) => toServer.push(message));
            client.on('encapsulated', (message: Buffer) => toClient.push(message));
            // One byte, one segment exactly, one more than a segment, and several segments.
            const sizes = [1, SEGMENT_BYTES, SEGMENT_BYTES + 1, 1_000_000];
            const messages = sizes.map((size, index) => Buffer.alloc(size, index + 1));

            for (const message of messages) client.send(message);
            for (const message of messages) connection.send(message);
            const deadline = Date.now() + 10_000;
            while ((toServer.length < sizes.length || toClient.length < sizes.length) && Date.now() < deadline) {
                await new Promise((resolve) => setTimeout(resolve, 10));
            }

            expect(toServer).toStrictEqual(messages);
            expect(toClient).toStrictEqual(messages);
            expect(server.connections.size).toBe(1);
        } finally {
            client.close();
            server.close();
        }
    });

    it('reports a close from either side with the connection the client picked', async () => {
        const server = new NetherNetServer({ driver, peerConfig: () => LOOPBACK });
        const { client, connection } = await join(driver, server);
        const closed = once(server, 'closeConnection') as Promise<[bigint, string]>;
        const disconnected = once(client, 'disconnect');

        client.close('bye');
        const [id] = await closed;
        await disconnected;

        expect(id).toBe(connection.id);
        expect(server.connections.size).toBe(0);
        server.close();
    });

    it('gathers its answer from the port range a peer is configured with', async () => {
        const port = await freePort();
        const server = new NetherNetServer({
            driver,
            peerConfig: () => ({ ...LOOPBACK, portRangeBegin: port, portRangeEnd: port })
        });
        const answers: string[] = [];
        const client = new NetherNetClient({
            driver,
            peerConfig: LOOPBACK,
            signal: (signal) => {
                if (signal.type !== SignalType.ConnectRequest) return;
                void server.handleOffer(signal, (reply) => {
                    if (reply.type === SignalType.ConnectResponse) answers.push(reply.data);
                    client.handleSignal(reply);
                });
            }
        });
        try {
            const connected = once(client, 'connected');
            await client.connect();
            await connected;

            const ports = [...answers[0]!.matchAll(/^a=candidate:\S+ \d+ udp \d+ \S+ (\d+) typ host/gim)].map(
                ([, candidatePort]) => Number(candidatePort)
            );
            expect(ports.length).toBeGreaterThan(0);
            expect(new Set(ports)).toStrictEqual(new Set([port]));
        } finally {
            client.close();
            server.close();
        }
    });

    it('refuses a channel NetherNet does not open, with an error to the client', async () => {
        const server = new NetherNetServer({ driver, peerConfig: () => LOOPBACK });
        const peer = driver.createPeer(LOOPBACK);
        peer.createDataChannel('SomethingElse');
        const offer = await peer.localDescription();
        const replies: SignalStructure[] = [];
        const closed = once(server, 'closeConnection') as Promise<[bigint, string]>;

        await server.handleOffer(new SignalStructure(SignalType.ConnectRequest, 5n, offer), (reply) => {
            replies.push(reply);
            if (reply.type === SignalType.ConnectResponse) peer.setRemoteDescription('answer', reply.data);
        });
        const [, reason] = await closed;

        expect(reason).toBe('unexpectedchannel:SomethingElse');
        expect(replies.map((reply) => [reply.type, reply.data.length > 0 ? 'data' : ''])).toContainEqual([
            SignalType.ConnectError,
            'data'
        ]);
        peer.close();
        server.close();
    });

    it('gives up on a peer that never opens, after the accept timeout', async () => {
        const server = new NetherNetServer({ driver, peerConfig: () => LOOPBACK, acceptTimeoutMs: 200 });
        const peer = driver.createPeer(LOOPBACK);
        peer.createDataChannel('ReliableDataChannel');
        const offer = await peer.localDescription();
        const replies: string[] = [];
        const closed = once(server, 'closeConnection') as Promise<[bigint, string]>;

        // The answer is never applied, so the client side never connects.
        await server.handleOffer(new SignalStructure(SignalType.ConnectRequest, 6n, offer), (reply) =>
            replies.push(`${reply.type} ${reply.type === SignalType.ConnectError ? reply.data : ''}`)
        );
        const [id, reason] = await closed;

        expect([id, reason]).toStrictEqual([6n, 'connecterror:15']);
        expect(replies).toStrictEqual([`${SignalType.ConnectResponse} `, `${SignalType.ConnectError} 15`]);
        peer.close();
        server.close();
    });

    it('joins over LAN discovery: answers a request, and takes the offer as a discovery message', async () => {
        const lanPort = await freePort();
        const server = new NetherNetServer({ driver, peerConfig: () => LOOPBACK, host: '127.0.0.1', lanPort });
        server.setAdvertisement(Buffer.from('advertisement bytes'));
        await server.listen();
        const discovery = new LanDiscovery({ broadcastAddress: '127.0.0.1', port: lanPort });
        try {
            const found = once(discovery, 'server');
            await discovery.start();
            const [entry] = (await found) as [{ networkId: bigint; advertisement: Buffer }];
            expect(entry.networkId).toBe(server.networkId);
            expect(entry.advertisement).toStrictEqual(Buffer.from('advertisement bytes'));

            const client = new NetherNetClient({
                driver,
                peerConfig: LOOPBACK,
                networkId: discovery.networkId,
                serverNetworkId: server.networkId,
                signal: (signal) => discovery.sendSignal(signal)
            });
            discovery.on('signal', (signal: SignalStructure) => client.handleSignal(signal));
            const opened = once(server, 'openConnection');
            const connected = once(client, 'connected');
            await client.connect();
            await Promise.all([connected, opened]);

            client.close();
        } finally {
            discovery.close();
            server.close();
        }
    });

    /** The local port of the pair a server-side connection selected. */
    const portOfConnection = (connection: Connection): number | undefined => connection.peer.localAddress()?.port;

    /** Whether a UDP port can be bound on 127.0.0.1 right now. */
    const bindable = async (port: number): Promise<boolean> => {
        const socket = dgram.createSocket('udp4');
        try {
            await new Promise<void>((resolve, reject) => {
                socket.once('error', reject);
                socket.bind(port, '127.0.0.1', resolve);
            });
            return true;
        } catch {
            return false;
        } finally {
            socket.close();
        }
    };

    it('serves two peers on one port at once, and frees the port after the last one leaves', async () => {
        const port = await freePort();
        const server = new NetherNetServer({
            driver,
            peerConfig: () => LOOPBACK,
            ports: new PortAllocator({ start: port, end: port })
        });
        const first = await join(driver, server);
        const second = await join(driver, server);
        try {
            expect([portOfConnection(first.connection), portOfConnection(second.connection)]).toStrictEqual([
                port,
                port
            ]);
            expect(await bindable(port)).toBe(false);

            const closed = once(server, 'closeConnection');
            first.client.close();
            await closed;
            expect(await bindable(port)).toBe(false);
            const lastClosed = once(server, 'closeConnection');
            second.client.close();
            await lastClosed;
            await vi.waitFor(async () => expect(await bindable(port)).toBe(true));
        } finally {
            first.client.close();
            second.client.close();
            server.close();
        }
    });

    it('spreads peers over a range by the fewest peers, and reuses its ports once all are in use', async () => {
        const start = await freePort();
        // Two ports in a row; skip the test's luck if the next one is taken.
        if (!(await bindable(start + 1))) return;
        const allocator = new PortAllocator({ start, end: start + 1 });
        const server = new NetherNetServer({ driver, peerConfig: () => LOOPBACK, ports: allocator });
        const joined = [];
        try {
            for (let index = 0; index < 3; index++) joined.push(await join(driver, server));

            expect(joined.map(({ connection }) => portOfConnection(connection))).toStrictEqual([
                start,
                start + 1,
                start
            ]);
            expect(allocator.loads()).toStrictEqual([
                { port: start, peers: 2 },
                { port: start + 1, peers: 1 }
            ]);
        } finally {
            for (const { client } of joined) client.close();
            server.close();
        }
    });
});
