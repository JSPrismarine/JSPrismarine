import { describe, expect, it, vi } from 'vitest';

import { BatchCodec } from '@jsprismarine/protocol';
import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import AnimatePacket from '@jsprismarine/protocol/packet/AnimatePacket';
import { BATCH_PACKET_ID } from '@jsprismarine/protocol/BatchCodec';
import Codec2193 from './codec/Codec2193';
import {
    encodePacketBatch,
    encodePacketBatchFromBuffersBySize,
    encodePacketsForCodec,
    FullFlushFragmentCache
} from './encodePacketBatch';

const packetWithPayload = (size: number): AnimatePacket => {
    const packet = new AnimatePacket();
    packet.action = 1;
    packet.runtimeEntityId = 2n;
    packet.swingSource = 'x'.repeat(size);
    return packet;
};

describe('encodePacketBatch compression threshold', () => {
    it('leaves small batches uncompressed', () => {
        const batch = encodePacketBatch([packetWithPayload(24)], Codec2193, { compressionThreshold: 256 });

        expect(batch.content[0]).toBe(BATCH_PACKET_ID);
        expect(batch.content[1]).toBe(0xff);
        expect(
            BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB, threshold: 256 }).decode(batch.content)
        ).toEqual(batch.packets.map((packet) => packet.getBuffer()));
    });

    it('compresses batches at or above the configured threshold', () => {
        const batch = encodePacketBatch([packetWithPayload(512)], Codec2193, { compressionThreshold: 256 });

        expect(batch.content[0]).toBe(BATCH_PACKET_ID);
        expect(batch.content[1]).toBe(PacketCompressionAlgorithm.ZLIB);
        expect(
            BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB, threshold: 256 }).decode(batch.content)
        ).toEqual(batch.packets.map((packet) => packet.getBuffer()));
    });

    it('leaves all batches uncompressed when the threshold is zero', () => {
        const batch = encodePacketBatch([packetWithPayload(512)], Codec2193, { compressionThreshold: 0 });

        expect(batch.content[0]).toBe(BATCH_PACKET_ID);
        expect(batch.content[1]).toBe(0xff);
        expect(
            BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB, threshold: 0 }).decode(batch.content)
        ).toEqual(batch.packets.map((packet) => packet.getBuffer()));
    });

    it('reuses cached full-flush fragments across visibility batches and preserves packet order', () => {
        const encoded = encodePacketsForCodec([packetWithPayload(512), packetWithPayload(768)], Codec2193);
        const cache = new FullFlushFragmentCache();
        const options = {
            compressionLevel: 1,
            compressionThreshold: 256,
            fullFlushFragments: true,
            fragmentCache: cache,
            fragmentCodec: Codec2193
        };
        const fragment = vi.spyOn(BatchCodec.prototype, 'encodeFullFlushFragment');
        try {
            const first = encodePacketBatchFromBuffersBySize(encoded.packets, encoded.buffers, options);
            const second = encodePacketBatchFromBuffersBySize(encoded.packets, encoded.buffers, options);
            if (first instanceof Promise || second instanceof Promise)
                throw new Error('small test batches must be synchronous');

            const decoder = BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB, threshold: 256 });
            expect(decoder.decode(first.content)).toEqual(encoded.buffers);
            expect(decoder.decode(second.content)).toEqual(encoded.buffers);
            expect(second.content).toEqual(first.content);
            expect(fragment).toHaveBeenCalledTimes(encoded.buffers.length);
        } finally {
            vi.restoreAllMocks();
        }
    });

    it('deduplicates concurrent asynchronous fragment compression for cached chunks', async () => {
        const encoded = encodePacketsForCodec([packetWithPayload(70_000)], Codec2193);
        const cache = new FullFlushFragmentCache();
        const payloadKey = Buffer.from('stable serialized chunk payload');
        const options = {
            compressionLevel: 1,
            compressionThreshold: 256,
            fullFlushFragments: true,
            fragmentCache: cache,
            fragmentCodec: Codec2193,
            fragmentKeys: [payloadKey],
            fragmentKeyDiscriminators: ['4:-3:0:24:plain']
        };
        const fragment = vi.spyOn(BatchCodec.prototype, 'encodeFullFlushFragmentAsync');
        try {
            const [first, second] = await Promise.all([
                encodePacketBatchFromBuffersBySize(encoded.packets, encoded.buffers, options),
                encodePacketBatchFromBuffersBySize(encoded.packets, encoded.buffers, options)
            ]);

            const decoder = BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB, threshold: 256 });
            expect(decoder.decode(first.content)).toEqual(encoded.buffers);
            expect(decoder.decode(second.content)).toEqual(encoded.buffers);
            expect(fragment).toHaveBeenCalledTimes(encoded.buffers.length);
        } finally {
            vi.restoreAllMocks();
        }
    });

    it('keeps synchronous sends valid while the same shared fragment is still compressing', async () => {
        const cache = new FullFlushFragmentCache();
        const key = Buffer.from('chunk revision');
        const packet = Buffer.alloc(70_000, 0x3c);
        const pending = cache.getOrCreateAsync(key, '1:2:0:24:plain', packet, Codec2193, 1);
        const synchronous = cache.getOrCreate(key, '1:2:0:24:plain', packet, Codec2193, 1);

        expect(await pending).toEqual(synchronous);
    });
});
