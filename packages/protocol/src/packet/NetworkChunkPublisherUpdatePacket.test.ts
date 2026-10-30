import { describe, expect, it } from 'vitest';

import { PacketIdentifier } from '../PacketIdentifier';
import NetworkChunkPublisherUpdatePacket from './NetworkChunkPublisherUpdatePacket';
import type { NetworkChunkPublisherUpdatePayload } from './NetworkChunkPublisherUpdatePacket';

const payload: NetworkChunkPublisherUpdatePayload = {
    position: { x: 1, y: -64, z: 3 },
    radius: 128,
    savedChunks: [{ x: -1, z: 2 }]
};

const wire = [
    0x79, // Header: id 121, no subclient ids.
    0x02, // New position for view X: ZigZag(1)
    0x7f, // New position for view Y: ZigZag(-64)
    0x06, // New position for view Z: ZigZag(3)
    0x80,
    0x01, // New radius for view: 128 as a varuint32
    0x01,
    0x00,
    0x00,
    0x00, // Server Built Chunks List count: uint32 LE, no size compression
    0x01, // ChunkPos X: ZigZag(-1)
    0x04 // ChunkPos Z: ZigZag(2)
];

describe('NetworkChunkPublisherUpdatePacket', () => {
    it('encodes the position, radius, and chunk list in protocol order', () => {
        const packet = new NetworkChunkPublisherUpdatePacket(payload);
        packet.encode();

        expect([...packet.getBuffer()]).toEqual(wire);
    });

    it('writes a four-byte count for an empty list', () => {
        const packet = new NetworkChunkPublisherUpdatePacket({
            position: { x: 0, y: 0, z: 0 },
            radius: 0,
            savedChunks: []
        });
        packet.encode();

        expect([...packet.getBuffer()]).toEqual([0x79, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    });

    it('decodes a packet buffer', () => {
        const packet = new NetworkChunkPublisherUpdatePacket(Buffer.from(wire));
        packet.decode();

        expect(packet.getPacketData()).toEqual(payload);
    });

    it('uses the expected network identifier', () => {
        expect(new NetworkChunkPublisherUpdatePacket(payload).getId()).toBe(
            PacketIdentifier.NETWORK_CHUNK_PUBLISHER_UPDATE
        );
    });
});
