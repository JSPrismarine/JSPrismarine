import { describe, expect, it } from 'vitest';

import { BatchCodec } from '@jsprismarine/protocol';
import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import AnimatePacket from '@jsprismarine/protocol/packet/AnimatePacket';
import { BATCH_PACKET_ID } from '@jsprismarine/protocol/BatchCodec';
import Codec2193 from './codec/Codec2193';
import { encodePacketBatch } from './encodePacketBatch';

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
});
