import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
    BEDROCK_CURVE,
    HttpSignaling,
    joinStatusJson,
    loadNativeDriver,
    NetherNetIdentity,
    NetherNetServer
} from '@jsprismarine/nethernet';
import type { Connection } from '@jsprismarine/nethernet';
import { BATCH_PACKET_ID } from '@jsprismarine/protocol';

import Random from '../bot/Random';
import { conditionLink } from './LinkConditions';
import NetherNetTransport from './NetherNetTransport';

/** The native WebRTC stack, or undefined on a machine with no build of it. */
const driver = await loadNativeDriver().catch(() => undefined);

/** A NetherNet server joined by address on 127.0.0.1, as Bedrock Dedicated Server is. */
const startServer = async () => {
    const server = new NetherNetServer({ driver: driver! });
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: BEDROCK_CURVE });
    const signaling = new HttpSignaling({
        answerer: server,
        status: () =>
            joinStatusJson({
                motd: 'relay',
                levelName: 'world',
                version: '1',
                protocol: 1,
                playerCount: 0,
                maxPlayers: 1,
                gameType: 0
            }),
        sign: (answer) => new NetherNetIdentity(privateKey).sign(answer),
        logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
    });
    const port = await signaling.listen(0, '127.0.0.1');
    return { server, signaling, port };
};

const batch = (index: number, size: number) => {
    const frame = Buffer.alloc(size, index & 0xff);
    frame[0] = BATCH_PACKET_ID;
    return frame;
};

describe.skipIf(driver === undefined)('the client relay', () => {
    it('carries every byte both ways over a lossy link, as SCTP resends what the link drops', async () => {
        const { server, signaling, port } = await startServer();
        const random = new Random(7);
        const link = conditionLink({ latencyMs: 5, loss: 0.05, random: () => random.next() });
        const transport = new NetherNetTransport({ host: '127.0.0.1', port, driver: driver!, timeoutMs: 30_000 });
        try {
            const opened = new Promise<Connection>((resolve) => server.once('openConnection', resolve));
            await transport.connect();
            const connection = await opened;
            const atServer: Buffer[] = [];
            const atClient: Buffer[] = [];
            server.on('encapsulated', (message: Buffer) => atServer.push(message));
            transport.on('batch', (frame) => atClient.push(frame));

            const frames = Array.from({ length: 40 }, (_, index) => batch(index, 3_000));
            for (const frame of frames) transport.send(frame);
            for (const frame of frames) connection.send(frame.subarray(1));
            const deadline = Date.now() + 30_000;
            while ((atServer.length < frames.length || atClient.length < frames.length) && Date.now() < deadline) {
                await new Promise((resolve) => setTimeout(resolve, 20));
            }

            expect(atServer).toStrictEqual(frames.map((frame) => frame.subarray(1)));
            expect(atClient).toStrictEqual(frames);
            expect(link.dropped).toBeGreaterThan(0);
            expect(transport.relaySockets).toBeGreaterThan(0);
        } finally {
            link.restore();
            transport.close();
            signaling.close();
            server.close();
        }
    }, 60_000);

    it('is not opened when nothing conditions the link', async () => {
        const { server, signaling, port } = await startServer();
        const transport = new NetherNetTransport({ host: '127.0.0.1', port, driver: driver! });
        try {
            await transport.connect();

            expect(transport.relaySockets).toBe(0);
        } finally {
            transport.close();
            signaling.close();
            server.close();
        }
    });
});
