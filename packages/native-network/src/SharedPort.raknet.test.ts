import { spawnSync } from 'node:child_process';
import dgram from 'node:dgram';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
    allocateDatagramRings,
    ClientSocket,
    Frame,
    FrameReliability,
    RingDatagramSource,
    ServerName,
    ServerSocket,
    UnconnectedPing
} from '@jsprismarine/raknet';

import { SharedPort } from './SharedPort';
import { loadNative, nativeLibraryAvailable } from './testing/native.test.helper';
import { runLoopback } from './testing/loopback';

const logger = { info: () => {}, warn: () => {}, error: () => {}, verbose: () => {}, debug: () => {}, silly: () => {} };

/** A Bun to run the same check under: `JSP_BUN`, or `bun` on the path. */
const bun = (): string | undefined => {
    const candidate = process.env.JSP_BUN ?? 'bun';
    return spawnSync(candidate, ['--version']).status === 0 ? candidate : undefined;
};

const newServerName = () =>
    new ServerName(
        { getConfig: () => ({ getMotd: () => 'shared', getGamemode: () => 'survival', getMaxPlayers: () => 10 }) },
        { protocolVersion: 0, minecraftVersions: ['0.0.0'] }
    );

/** A UDP port nothing holds right now, on both families. */
const freePort = async (): Promise<number> => {
    const socket = dgram.createSocket('udp6');
    socket.bind(0, '::');
    await once(socket, 'listening');
    const { port } = socket.address();
    socket.close();
    return port;
};

const ping = (timestamp: bigint): Buffer => {
    const packet = new UnconnectedPing();
    packet.timestamp = timestamp;
    packet.clientGUID = 42n;
    packet.encode();
    return packet.getBuffer();
};

describe.skipIf(!nativeLibraryAvailable())('RakNet on a port it shares with NetherNet', async () => {
    const network = await loadNative();

    it('answers pings on both families and carries a data channel on the same port at once', async () => {
        const port = await freePort();
        const shared = SharedPort.open(network, port);
        const sources: RingDatagramSource[] = [];
        const servers: ServerSocket[] = [];
        // One RakNet listener per family, as a wildcard server runs, both on the shared port.
        for (const family of [4, 6] as const) {
            const rings = allocateDatagramRings(1 << 16);
            const source = new RingDatagramSource(rings, family, port, (wakePort) =>
                shared.attach(family, rings, wakePort)
            );
            const server = new ServerSocket(10, false, newServerName(), logger, {}, 'copy', undefined, source);
            const listening = once(server, 'listening');
            server.start(family === 4 ? '0.0.0.0' : '::', port);
            await listening;
            sources.push(source);
            servers.push(server);
        }
        const v4 = dgram.createSocket('udp4');
        const v6 = dgram.createSocket('udp6');
        try {
            const pongs: { family: string; from: number; id: number }[] = [];
            for (const socket of [v4, v6]) {
                socket.on('message', (message, from) =>
                    pongs.push({ family: from.family, from: from.port, id: message[0]! })
                );
            }
            const exchange = runLoopback(
                network,
                { enableIceUdpMux: true, portRangeBegin: port, portRangeEnd: port },
                200,
                1000
            );
            for (let index = 0; index < 10; index++) {
                v4.send(ping(BigInt(index)), port, '127.0.0.1');
                v6.send(ping(BigInt(index)), port, '::1');
            }
            const result = await exchange;
            const deadline = Date.now() + 5_000;
            while (pongs.length < 20 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));

            // Every byte through the data channel, and a pong from the shared port for every ping.
            expect(result.bytesReceived).toBe(result.bytesSent);
            expect(pongs).toHaveLength(20);
            expect(pongs.every((pong) => pong.id === 0x1c && pong.from === port)).toBe(true);
            expect(pongs.filter((pong) => pong.family === 'IPv6')).toHaveLength(10);
            // RakNet got the RakNet datagrams and nothing else; libjuice got the WebRTC ones.
            expect(sources.map((source) => source.received)).toStrictEqual([10, 10]);
            const stats = shared.stats();
            expect(stats.raknet).toBe(20);
            expect(stats.passed).toBeGreaterThan(0);
            expect(stats.unhandledToRakNet).toBe(0);
            expect(stats.sent).toBe(20);
            // Every batch of pings cost far fewer wakes than pings.
            expect(sources[0]!.wakes + sources[1]!.wakes).toBeLessThanOrEqual(20);
        } finally {
            v4.close();
            v6.close();
            for (const server of servers) server.kill();
            shared.close();
        }
    });

    it('carries a whole RakNet session, handshake to frames and acknowledgments, without libjuice seeing any of it', async () => {
        const port = await freePort();
        const shared = SharedPort.open(network, port);
        const rings = allocateDatagramRings(1 << 16);
        const source = new RingDatagramSource(rings, 4, port, (wakePort) => shared.attach(4, rings, wakePort));
        const server = new ServerSocket(10, false, newServerName(), logger, {}, 'copy', undefined, source);
        const listening = once(server, 'listening');
        server.start('0.0.0.0', port);
        await listening;
        const client = new ClientSocket(logger);
        try {
            const received: number[] = [];
            server.on('encapsulated', (frame: Frame) => received.push(frame.content[1]!));
            const session = await client.connect('127.0.0.1', port);
            for (let id = 0; id < 50; id++) {
                const frame = new Frame();
                frame.reliability = FrameReliability.RELIABLE_ORDERED;
                frame.orderChannel = 0;
                frame.content = Buffer.from([0xfe, id]);
                session.sendFrame(frame);
            }
            session.sendFrameQueue();
            const deadline = Date.now() + 5_000;
            while (received.length < 50 && Date.now() < deadline)
                await new Promise((resolve) => setTimeout(resolve, 10));

            expect(received).toStrictEqual(Array.from({ length: 50 }, (_, id) => id));
            const stats = shared.stats();
            // Offline requests, frame sets and ACKs all went to RakNet; nothing reached libjuice's lookup.
            expect(stats.raknet).toBeGreaterThan(0);
            expect(stats.raknet).toBe(source.received);
            expect(stats.passed).toBe(0);
            expect(stats.ringFull + stats.noRing).toBe(0);
        } finally {
            client.kill();
            server.kill();
            shared.close();
        }
    });

    it.skipIf(bun() === undefined)('answers a ping on the shared port under Bun', async () => {
        const port = await freePort();
        const script = fileURLToPath(new URL('./testing/shared-port-main.ts', import.meta.url));
        const run = spawnSync(bun()!, [script, String(port)], { encoding: 'utf8', timeout: 60_000 });

        expect(run.status, run.stderr).toBe(0);
        expect(JSON.parse(run.stdout.trim())).toStrictEqual({ runtime: 'bun', id: 0x1c, from: port, port });
    });
});
