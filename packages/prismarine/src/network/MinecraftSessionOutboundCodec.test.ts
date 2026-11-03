import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { BatchCodec } from '@jsprismarine/protocol';
import NetworkBinaryStream from '@jsprismarine/protocol/NetworkBinaryStream';
import { stub } from '../testing/stub.test.helper';
import MinecraftSession, { broadcastSharedBatches } from './MinecraftSession';
import { OutboundPacketTrace } from './OutboundPacketTrace';
import type { TransportConnection } from './transport/Transport';
import type { ProtocolCodec } from '@jsprismarine/protocol';
import Codec2193 from './codec/Codec2193';
import Codec2225 from './codec/Codec2225';
import AnimatePacket from '@jsprismarine/protocol/packet/AnimatePacket';
import LevelChunkPacket from '@jsprismarine/protocol/packet/LevelChunkPacket';
import StartGamePacket from '@jsprismarine/protocol/packet/StartGamePacket';
import { HandSlot } from '@jsprismarine/protocol';
import { encodePacketBatch } from './encodePacketBatch';

const START_GAME_CAPTURE = readFileSync(
    new URL('../../../protocol/src/packet/__fixtures__/start-game-bds-1.26.51.1.bin', import.meta.url)
);
const START_GAME_DATA = new StartGamePacket().deserialize(new NetworkBinaryStream(START_GAME_CAPTURE), {
    protocolVersion: 2193
});

/**
 * The outbound half of per-session protocol codecs: the session's codec stamps the Protocol
 * packet with its negotiated version before encoding. A 2225 session must put the 2225 layout
 * on the wire while a 2193 session keeps the old one, using the same packet class.
 */
const fakeSession = (
    codec: ProtocolCodec,
    getCompressionLevel?: () => number,
    getCompressionThreshold?: () => number
) => {
    const framed: Buffer[] = [];
    const connection = stub<TransportConnection>({
        token: '127.0.0.1:19132',
        sendFrame: (payload: Buffer) => void framed.push(payload),
        close: () => {}
    });
    const logger = stub<Logger>({ silly: () => {}, error: () => {}, warn: () => {} });

    const session = new MinecraftSession(
        connection,
        logger,
        undefined,
        undefined,
        undefined,
        undefined,
        getCompressionLevel,
        getCompressionThreshold
    );
    session.codec = codec;
    session.setCompressionSettings(PacketCompressionAlgorithm.ZLIB, getCompressionThreshold?.() ?? 1);
    return { framed, session };
};

/** The packets inside an uncompressed batch frame, as raw encoded buffers. */
const unbatch = (frame: Buffer, compressed: boolean): Buffer[] => {
    return compressed
        ? BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB }).decode(frame)
        : BatchCodec.uncompressed().decode(frame);
};

const animate = () => {
    const packet = new AnimatePacket();
    packet.action = 1;
    packet.runtimeEntityId = 300n;
    packet.swingSource = 'attack';
    return packet;
};

const startGame = () => new StartGamePacket(START_GAME_DATA);

/** Hashes each decoded packet buffer across every frame, independent of batch compression. */
const decodedPacketStreamDigest = (frames: readonly Buffer[]): string => {
    const decoder = BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB });
    const packets = frames.flatMap((frame) => decoder.decode(frame));
    return createHash('sha256').update(Buffer.concat(packets)).digest('hex');
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

        it('records framed packet bytes and hashes them by the send tick', async () => {
            const { framed, session } = fakeSession(Codec2193);
            const trace = new OutboundPacketTrace();
            session.setOutboundPacketRecorder(trace, 4, () => 12);

            await session.sendDataPacket(animate(), false);

            const [payload] = unbatch(framed[0]!, false);
            expect(trace.records()).toEqual([
                {
                    connectionId: 4,
                    sequence: 0,
                    tick: 12,
                    protocolVersion: Codec2193.protocolVersion,
                    packetName: 'AnimatePacket',
                    payload
                }
            ]);
            expect(trace.packetDigestsByTick().get(12)).toMatch(/^[a-f0-9]{64}$/);
            expect(trace.getPayloadBytes()).toBe(payload!.byteLength);
        });

        it('records the exact bytes from transient packet encoding', () => {
            const { framed, session } = fakeSession(Codec2193);
            const trace = new OutboundPacketTrace();
            const packet = animate();
            const getBuffer = vi.spyOn(packet, 'getBuffer');
            session.setOutboundPacketRecorder(trace, 4, () => 12);

            session.sendPackets([packet], { compressed: false });

            const [payload] = unbatch(framed[0]!, false);
            expect(trace.records()[0]?.payload).toEqual(payload);
            expect(getBuffer).not.toHaveBeenCalled();
        });

        it('records the tick when async packet framing reaches the transport', async () => {
            const { session } = fakeSession(Codec2193);
            const trace = new OutboundPacketTrace();
            let tick = 12;
            session.setOutboundPacketRecorder(trace, 4, () => tick);

            const sending = session.sendPacketsAsync([animate()]);
            tick = 13;
            await sending;

            expect(trace.records().map((record) => record.tick)).toEqual([13]);
        });

        it('sends a framed packet even when the outbound recorder fails', async () => {
            const framed: Buffer[] = [];
            const errors: unknown[] = [];
            const connection = stub<TransportConnection>({
                token: '127.0.0.1:19132',
                sendFrame: (payload: Buffer) => void framed.push(payload),
                close: () => {}
            });
            const logger = stub<Logger>({
                silly: () => {},
                error: (error: unknown) => void errors.push(error),
                warn: () => {}
            });
            const session = new MinecraftSession(connection, logger);
            session.codec = Codec2193;
            session.setOutboundPacketRecorder(
                {
                    record: () => {
                        throw new Error('trace sink unavailable');
                    }
                },
                4,
                () => 12
            );

            await session.sendDataPacket(animate(), false);

            expect(framed).toHaveLength(1);
            expect(errors).toHaveLength(2);
            expect(String(errors[0])).toContain('Outbound packet recorder failed for AnimatePacket');
            expect(String(errors[1])).toContain('trace sink unavailable');
        });

        it('keeps per-tick output digests stable across unrelated connection scheduling', () => {
            const first = new OutboundPacketTrace();
            const second = new OutboundPacketTrace();
            const records = [
                {
                    connectionId: 2,
                    sequence: 0,
                    tick: 12,
                    protocolVersion: Codec2193.protocolVersion,
                    packetName: 'AnimatePacket',
                    payload: Buffer.from([2])
                },
                {
                    connectionId: 1,
                    sequence: 0,
                    tick: 12,
                    protocolVersion: Codec2193.protocolVersion,
                    packetName: 'AnimatePacket',
                    payload: Buffer.from([1])
                }
            ];
            for (const record of records) first.record(record);
            for (const record of [...records].reverse()) second.record(record);

            expect(first.packetDigestsByTick()).toEqual(second.packetDigestsByTick());
        });

        it('orders one connection by packet sequence when hashing a tick', () => {
            const first = new OutboundPacketTrace();
            const second = new OutboundPacketTrace();
            const earlier = {
                connectionId: 1,
                sequence: 0,
                tick: 12,
                protocolVersion: Codec2193.protocolVersion,
                packetName: 'AnimatePacket',
                payload: Buffer.from([1])
            };
            const later = { ...earlier, sequence: 1, payload: Buffer.from([2]) };

            first.record(later);
            first.record(earlier);
            second.record(earlier);
            second.record(later);

            expect(first.packetDigestsByTick()).toEqual(second.packetDigestsByTick());
        });

        it('a 2225 session sends the versioned StartGame layout through the Protocol packet', async () => {
            const old = fakeSession(Codec2193);
            const next = fakeSession(Codec2225);

            await old.session.sendDataPacket(startGame(), false);
            await next.session.sendDataPacket(startGame(), false);

            const [bytes2193] = unbatch(old.framed[0]!, false);
            const [bytes2225] = unbatch(next.framed[0]!, false);

            // 2225 inserts the Editor Level Migration Version int8 mid-payload.
            expect(bytes2225!.byteLength).toBe(bytes2193!.byteLength + 1);

            const decoded2225 = Codec2225.createPacket(Codec2225.netIdOf('StartGamePacket')!, bytes2225);
            expect(decoded2225).toBeInstanceOf(StartGamePacket);
            decoded2225!.decode();
            expect(decoded2225!.feof()).toBe(true);
            expect(decoded2225!.getPacketData()).toMatchObject({
                serverVersion: '1.26.51',
                levelName: 'capture',
                editorLevelMigrationVersion: 0
            });

            const decoded2193 = Codec2193.createPacket(Codec2193.netIdOf('StartGamePacket')!, bytes2193);
            expect(decoded2193).toBeInstanceOf(StartGamePacket);
            decoded2193!.decode();
            expect(decoded2193!.feof()).toBe(true);
            expect(decoded2193!.getPacketData()).toMatchObject({ serverVersion: '1.26.51', levelName: 'capture' });
        });

        it('the chunk batch path encodes LevelChunkPacket under the session codec', async () => {
            const chunk = () => {
                return new LevelChunkPacket({
                    chunkX: 4,
                    chunkZ: -3,
                    dimension: 0,
                    subChunkCount: 2,
                    clientSubChunkRequestsEnabled: false,
                    cached: false,
                    payload: Buffer.from([1, 2, 3])
                });
            };

            const old = fakeSession(Codec2193);
            const next = fakeSession(Codec2225);

            await old.session.sendPacketsAsync([chunk()], { direct: false });
            await next.session.sendPacketsAsync([chunk()], { direct: false });

            const [bytes2193] = unbatch(old.framed[0]!, true);
            const [bytes2225] = unbatch(next.framed[0]!, true);

            // 2225 appends the Is Client Biome Update boolean, and nothing else.
            expect(bytes2225!.byteLength).toBe(bytes2193!.byteLength + 1);
            expect(bytes2225!.subarray(0, bytes2193!.byteLength)).toStrictEqual(bytes2193!);

            const decoded = Codec2225.createPacket(Codec2225.netIdOf('LevelChunkPacket')!, bytes2225);
            expect(decoded).toBeInstanceOf(LevelChunkPacket);
            decoded!.decode();
            expect(decoded!.feof()).toBe(true);
            expect(decoded!.getPacketData()).toMatchObject({ chunkX: 4, chunkZ: -3, isClientBiomeUpdate: false });
        });

        it('applies the configured compression level to ordinary sends and keeps explicit batch overrides', async () => {
            const configuredLevel = 1;
            const configured = fakeSession(Codec2193, () => configuredLevel);
            const overridden = fakeSession(Codec2193, () => configuredLevel);

            await configured.session.sendDataPacket(animate());
            configured.session.sendPackets([animate()]);
            await configured.session.sendPacketsAsync([animate()]);
            overridden.session.sendPackets([animate()], { compressionLevel: 9 });

            expect(configured.framed).toStrictEqual([
                encodePacketBatch([animate()], Codec2193, { compressionLevel: configuredLevel }).content,
                encodePacketBatch([animate()], Codec2193, { compressionLevel: configuredLevel }).content,
                encodePacketBatch([animate()], Codec2193, { compressionLevel: configuredLevel }).content
            ]);
            expect(overridden.framed).toStrictEqual([
                encodePacketBatch([animate()], Codec2193, { compressionLevel: 9 }).content
            ]);
        });

        it('uses the configured threshold and preserves the decoded packet stream', async () => {
            const thresholded = fakeSession(
                Codec2193,
                () => 7,
                () => 256
            );
            const alwaysCompressed = fakeSession(
                Codec2193,
                () => 7,
                () => 1
            );
            const small = () => animate();
            const large = () => {
                const packet = animate();
                packet.swingSource = 'x'.repeat(512);
                return packet;
            };

            await thresholded.session.sendDataPacket(small());
            await thresholded.session.sendDataPacket(large());
            await alwaysCompressed.session.sendDataPacket(small());
            await alwaysCompressed.session.sendDataPacket(large());

            expect(thresholded.framed[0]![1]).toBe(0xff);
            expect(thresholded.framed[1]![1]).toBe(PacketCompressionAlgorithm.ZLIB);
            expect(decodedPacketStreamDigest(thresholded.framed)).toBe(
                decodedPacketStreamDigest(alwaysCompressed.framed)
            );
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
