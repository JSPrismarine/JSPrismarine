import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import { Vector3 } from '@jsprismarine/math';
import type Server from '../Server';
import { stub } from '../testing/stub.test.helper';
import GameRuleManager from '../world/GameRuleManager';
import MinecraftSession, { broadcastSharedBatches } from './MinecraftSession';
import type { TransportConnection } from './transport/Transport';
import type { ProtocolCodec } from './codec/ProtocolCodec';
import Codec2193 from './codec/Codec2193';
import Codec2225 from './codec/Codec2225';
import AnimatePacket from './packet/AnimatePacket';
import BatchPacket from './packet/BatchPacket';
import LevelChunkPacket from './packet/LevelChunkPacket';
import LevelChunkPacket2225 from './packet/LevelChunkPacket2225';
import StartGamePacket from './packet/StartGamePacket';
import StartGamePacket2225 from './packet/StartGamePacket2225';
import { HandSlot } from './packet/InventoryTransactionPacket';

/**
 * The outbound half of per-session protocol codecs: gameplay code builds the base (2193)
 * packet classes, and the session's codec decides what actually encodes. A 2225 session must
 * put the 2225 layout on the wire for the packets whose layout changed, while a 2193 session
 * keeps the old one - from the same base instance.
 */
const fakeSession = (codec: ProtocolCodec) => {
    const framed: Buffer[] = [];
    const connection = stub<TransportConnection>({
        token: '127.0.0.1:19132',
        sendFrame: (payload: Buffer) => void framed.push(payload),
        close: () => {}
    });
    const logger = stub<Logger>({ silly: () => {}, error: () => {}, warn: () => {} });

    const session = new MinecraftSession(connection, logger);
    session.codec = codec;
    return { framed, session };
};

/** The packets inside an uncompressed batch frame, as raw encoded buffers. */
const unbatch = (frame: Buffer, compressed: boolean): Buffer[] => {
    const batch = new BatchPacket(frame);
    batch.compressed = compressed;
    batch.decodeHeader();
    batch.decodePayload();
    return batch.getPackets();
};

const animate = () => {
    const packet = new AnimatePacket();
    packet.action = 1;
    packet.runtimeEntityId = 300n;
    packet.swingSource = 'attack';
    return packet;
};

const startGame = () => {
    const packet = new StartGamePacket();
    packet.entityId = -2n;
    packet.runtimeEntityId = 7n;
    packet.gamemode = 1;
    packet.playerPos = new Vector3(0.5, 64, -2);
    packet.pitch = 1;
    packet.yaw = 180;
    packet.seed = 258n;
    packet.worldSpawnPos = new Vector3(8, -60, -16);
    packet.gameRules = new GameRuleManager(stub<Server>());
    packet.time = 6000;
    packet.levelId = 'level-id';
    packet.worldName = 'A world';
    packet.serverIdentifier = 'JSPrismarine';
    packet.scenarioIdentifier = 'scenario';
    packet.worldIdentifier = 'world-id';
    return packet;
};

describe('network', () => {
    describe('MinecraftSession outbound codec', () => {
        it('a 2225 session sends the 2225 AnimatePacket layout, a 2193 session the old one', async () => {
            const old = fakeSession(Codec2193);
            const next = fakeSession(Codec2225);

            await old.session.sendDataPacket(animate(), false);
            await next.session.sendDataPacket(animate(), false);

            const [bytes2193] = unbatch(old.framed[0]!, false);
            const [bytes2225] = unbatch(next.framed[0]!, false);

            // The 2225 layout is the 2193 one plus a trailing Hand byte, and nothing else.
            expect(bytes2225!.byteLength).toBe(bytes2193!.byteLength + 1);
            expect(bytes2225!.subarray(0, bytes2193!.byteLength)).toStrictEqual(bytes2193!);
            expect(bytes2225!.at(-1)).toBe(HandSlot.MAINHAND);

            // And each session's bytes decode cleanly - to the end - under its own codec.
            const decoded2225 = Codec2225.createPacket(Codec2225.netIdOf('AnimatePacket')!, bytes2225);
            expect(decoded2225).toBeInstanceOf(AnimatePacket);
            decoded2225!.decode();
            expect(decoded2225!.feof()).toBe(true);
            expect(decoded2225).toMatchObject({ hand: HandSlot.MAINHAND });

            const decoded2193 = Codec2193.createPacket(Codec2193.netIdOf('AnimatePacket')!, bytes2193);
            expect(decoded2193).toBeInstanceOf(AnimatePacket);
            decoded2193!.decode();
            expect(decoded2193!.feof()).toBe(true);
            expect(decoded2193).toMatchObject({ action: 1, runtimeEntityId: 300n, swingSource: 'attack' });
        });

        it('a 2225 session sends the 2225 StartGamePacket layout from a base instance', async () => {
            const old = fakeSession(Codec2193);
            const next = fakeSession(Codec2225);

            await old.session.sendDataPacket(startGame(), false);
            await next.session.sendDataPacket(startGame(), false);

            const [bytes2193] = unbatch(old.framed[0]!, false);
            const [bytes2225] = unbatch(next.framed[0]!, false);

            // 2225 inserts the Editor Level Migration Version int8 mid-payload.
            expect(bytes2225!.byteLength).toBe(bytes2193!.byteLength + 1);

            const decoded2225 = Codec2225.createPacket(Codec2225.netIdOf('StartGamePacket')!, bytes2225);
            expect(decoded2225).toBeInstanceOf(StartGamePacket2225);
            decoded2225!.decode();
            expect(decoded2225!.feof()).toBe(true);
            expect(decoded2225).toMatchObject({ time: 6000, worldName: 'A world' });

            const decoded2193 = Codec2193.createPacket(Codec2193.netIdOf('StartGamePacket')!, bytes2193);
            expect(decoded2193).not.toBeInstanceOf(StartGamePacket2225);
            decoded2193!.decode();
            expect(decoded2193!.feof()).toBe(true);
        });

        it('the chunk batch path encodes LevelChunkPacket under the session codec', async () => {
            const chunk = () => {
                const packet = new LevelChunkPacket();
                packet.chunkX = 4;
                packet.chunkZ = -3;
                packet.subChunkCount = 2;
                packet.data = Buffer.from([1, 2, 3]);
                return packet;
            };

            const old = fakeSession(Codec2193);
            const next = fakeSession(Codec2225);

            const oldBatch = new BatchPacket();
            oldBatch.addPacket(chunk());
            await old.session.sendBatchAsync(oldBatch, false);

            const nextBatch = new BatchPacket();
            nextBatch.addPacket(chunk());
            await next.session.sendBatchAsync(nextBatch, false);

            const [bytes2193] = unbatch(old.framed[0]!, true);
            const [bytes2225] = unbatch(next.framed[0]!, true);

            // 2225 appends the Is Client Biome Update boolean, and nothing else.
            expect(bytes2225!.byteLength).toBe(bytes2193!.byteLength + 1);
            expect(bytes2225!.subarray(0, bytes2193!.byteLength)).toStrictEqual(bytes2193!);

            const decoded = Codec2225.createPacket(Codec2225.netIdOf('LevelChunkPacket')!, bytes2225);
            expect(decoded).toBeInstanceOf(LevelChunkPacket2225);
            decoded!.decode();
            expect(decoded!.feof()).toBe(true);
        });
    });

    describe('broadcastSharedBatches', () => {
        it('gives a mixed-codec audience each codec its own bytes, shared within the group', () => {
            const a2193 = fakeSession(Codec2193);
            const b2193 = fakeSession(Codec2193);
            const c2225 = fakeSession(Codec2225);

            broadcastSharedBatches([a2193.session, c2225.session, b2193.session], animate(), 1, (error) =>
                expect.unreachable(String(error))
            );

            expect(a2193.framed).toHaveLength(1);
            expect(b2193.framed).toHaveLength(1);
            expect(c2225.framed).toHaveLength(1);

            // One compression serves the whole 2193 group; the 2225 session gets its own.
            expect(a2193.framed[0]).toStrictEqual(b2193.framed[0]);
            expect(c2225.framed[0]).not.toStrictEqual(a2193.framed[0]);

            const [bytes2193] = unbatch(a2193.framed[0]!, true);
            const [bytes2225] = unbatch(c2225.framed[0]!, true);
            expect(bytes2225!.byteLength).toBe(bytes2193!.byteLength + 1);
            expect(bytes2225!.at(-1)).toBe(HandSlot.MAINHAND);

            const decoded = Codec2225.createPacket(Codec2225.netIdOf('AnimatePacket')!, bytes2225);
            expect(decoded).toBeInstanceOf(AnimatePacket);
            decoded!.decode();
            expect(decoded!.feof()).toBe(true);
        });
    });
});
