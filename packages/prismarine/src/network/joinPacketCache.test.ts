import { describe, expect, it, vi } from 'vitest';

import { BatchCodec } from '@jsprismarine/protocol';
import AnimatePacket from '@jsprismarine/protocol/packet/AnimatePacket';
import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import type { ServerContent } from '../content/ServerContent';
import type MinecraftSession from './MinecraftSession';
import { stub } from '../testing/stub.test.helper';
import { encodePacketBatch } from './encodePacketBatch';
import { encodePacketBatchBySize } from './encodePacketBatch';
import Codec2193 from './codec/Codec2193';
import Codec2225 from './codec/Codec2225';
import { cachedJoinPacketBatch, sendCachedJoinPacket } from './joinPacketCache';

const animate = () => {
    const packet = new AnimatePacket();
    packet.action = 1;
    packet.runtimeEntityId = 300n;
    packet.swingSource = 'attack';
    return packet;
};

describe('join packet cache', () => {
    it('shares final batch bytes per content, codec, and recipe-limit key', async () => {
        const content = stub<ServerContent>();
        const encode = vi.spyOn(BatchCodec.prototype, 'encode');
        const first = cachedJoinPacketBatch(
            content,
            Codec2193,
            'join:limit=1',
            PacketCompressionAlgorithm.ZLIB,
            1,
            256,
            [animate()]
        );
        const duplicate = cachedJoinPacketBatch(
            content,
            Codec2193,
            'join:limit=1',
            PacketCompressionAlgorithm.ZLIB,
            1,
            256,
            [animate()]
        );

        expect(duplicate).toBe(first);
        const cached2193 = await first;
        expect(encode).toHaveBeenCalledOnce();
        expect(cached2193.content).toStrictEqual(
            encodePacketBatch([animate()], Codec2193, {
                compressionAlgorithm: PacketCompressionAlgorithm.ZLIB,
                compressionLevel: 1,
                compressionThreshold: 256
            }).content
        );

        const cached2225 = await cachedJoinPacketBatch(
            content,
            Codec2225,
            'join:limit=1',
            PacketCompressionAlgorithm.ZLIB,
            1,
            256,
            [animate()]
        );
        expect(cached2225.content).toStrictEqual(
            encodePacketBatch([animate()], Codec2225, {
                compressionAlgorithm: PacketCompressionAlgorithm.ZLIB,
                compressionLevel: 1,
                compressionThreshold: 256
            }).content
        );

        const changedLimit = cachedJoinPacketBatch(
            content,
            Codec2193,
            'join:limit=2',
            PacketCompressionAlgorithm.ZLIB,
            1,
            256,
            [animate()]
        );
        const changedCompression = cachedJoinPacketBatch(
            content,
            Codec2193,
            'join:limit=1',
            PacketCompressionAlgorithm.ZLIB,
            7,
            256,
            [animate()]
        );
        const changedAlgorithm = cachedJoinPacketBatch(
            content,
            Codec2193,
            'join:limit=1',
            PacketCompressionAlgorithm.SNAPPY,
            1,
            256,
            [animate()]
        );
        const changedThreshold = cachedJoinPacketBatch(
            content,
            Codec2193,
            'join:limit=1',
            PacketCompressionAlgorithm.ZLIB,
            1,
            512,
            [animate()]
        );
        const changedContent = cachedJoinPacketBatch(
            stub<ServerContent>(),
            Codec2193,
            'join:limit=1',
            PacketCompressionAlgorithm.ZLIB,
            1,
            256,
            [animate()]
        );
        expect(changedLimit).not.toBe(first);
        expect(changedCompression).not.toBe(first);
        expect(changedAlgorithm).not.toBe(first);
        expect(changedThreshold).not.toBe(first);
        expect(changedContent).not.toBe(first);
        await Promise.all([changedLimit, changedCompression, changedAlgorithm, changedThreshold, changedContent]);
        encode.mockRestore();
    });

    it('uses asynchronous compression only above the uncompressed body threshold', async () => {
        const encodeAsync = vi.spyOn(BatchCodec.prototype, 'encodeAsync');
        const small = encodePacketBatchBySize([animate()], Codec2193, { compressionLevel: 1 });
        expect(small).not.toBeInstanceOf(Promise);
        expect(encodeAsync).not.toHaveBeenCalled();

        const largePacket = new AnimatePacket();
        largePacket.action = 1;
        largePacket.runtimeEntityId = 300n;
        largePacket.swingSource = 'x'.repeat(70 * 1024);
        const large = encodePacketBatchBySize([largePacket], Codec2193, { compressionLevel: 1 });
        expect(large).toBeInstanceOf(Promise);
        const encoded = await large;
        expect(encodeAsync).toHaveBeenCalledOnce();
        expect(encoded.content).toStrictEqual(
            encodePacketBatch([largePacket], Codec2193, { compressionLevel: 1 }).content
        );
        encodeAsync.mockRestore();
    });

    it('keeps repeated packet classes separate when their static definitions differ', async () => {
        const content = stub<ServerContent>();
        const sent: Buffer[] = [];
        const session = stub<
            Pick<
                MinecraftSession,
                'codec' | 'compressionAlgorithm' | 'compressionThreshold' | 'sendDataPacket' | 'sendSharedBatchAsync'
            >
        >({
            codec: Codec2193,
            compressionAlgorithm: PacketCompressionAlgorithm.ZLIB,
            compressionThreshold: 256,
            sendDataPacket: async () => {},
            sendSharedBatchAsync: async (batch) => {
                sent.push((await batch).content);
            }
        });

        await Promise.all([
            sendCachedJoinPacket(session, content, -1, 7, animate(), 'minecraft:cat'),
            sendCachedJoinPacket(session, content, -1, 7, animateWithSwing('minecraft:cat'), 'minecraft:dog')
        ]);

        expect(sent).toHaveLength(2);
        expect(sent[0]).not.toStrictEqual(sent[1]);
    });
});

const animateWithSwing = (swingSource: string): AnimatePacket => {
    const packet = animate();
    packet.swingSource = swingSource;
    return packet;
};
