import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import Identifiers from '../Identifiers';
import LevelChunkPacket from './LevelChunkPacket';

/**
 * Encodes the packet, consumes the header the way `DataPacket.encodeHeader` writes it, and
 * hands back the payload bytes that follow.
 *
 * Expected bytes below are written by hand in the docs' wire order. ZigZag(n) is
 * (n << 1) ^ (n >> 31): -3 gives -6 ^ -1 = 5 (0x05), 7 gives 14 (0x0e), 1 gives 2 (0x02),
 * 9 gives 18 (0x12), 0 gives 0 (0x00).
 */
const payloadOf = (packet: LevelChunkPacket): number[] => {
    packet.encode();

    const stream = new BinaryStream(packet.getBuffer());
    expect(stream.readUnsignedVarInt()).toBe(Identifiers.LevelChunkPacket);

    const payload = [...stream.readRemaining()];
    expect(stream.feof()).toBe(true);

    return payload;
};

describe('network', () => {
    describe('packet', () => {
        describe('LevelChunkPacket', () => {
            it('writes the plain-mode envelope in docs order', () => {
                const pk = new LevelChunkPacket();
                pk.chunkX = -3;
                pk.chunkZ = 7;
                pk.dimension = 1;
                pk.subChunkCount = 5;
                pk.clientSubChunkRequestsEnabled = false;
                pk.data = Buffer.from([0x2a, 0x2b, 0x2c]);

                expect(payloadOf(pk)).toEqual([
                    0x05, // Chunk Position X, ZigZag(-3)
                    0x0e, // Chunk Position Z, ZigZag(7)
                    0x02, // Dimension Id, ZigZag(1)
                    0x05, // Sub-chunks Count
                    0x00, // Client Request SubChunk Limit absent
                    0x00, // Cache Enabled false
                    0x00, // Cache Metadata, empty
                    0x03, // Serialized Chunk Data length
                    0x2a,
                    0x2b,
                    0x2c
                ]);
            });

            it('writes a zero count and the limit when the client requests sub-chunks', () => {
                const pk = new LevelChunkPacket();
                pk.chunkX = -3;
                pk.chunkZ = 7;
                pk.dimension = 1;
                pk.subChunkCount = 9;
                pk.clientSubChunkRequestsEnabled = true;
                pk.data = Buffer.from([0x2a, 0x2b, 0x2c]);

                expect(payloadOf(pk)).toEqual([
                    0x05, // Chunk Position X, ZigZag(-3)
                    0x0e, // Chunk Position Z, ZigZag(7)
                    0x02, // Dimension Id, ZigZag(1)
                    0x00, // Sub-chunks Count, always 0 in request mode
                    0x01, // Client Request SubChunk Limit present
                    0x12, // Client Request SubChunk Limit, ZigZag(9)
                    0x00, // Cache Enabled false
                    0x00, // Cache Metadata, empty
                    0x03, // Serialized Chunk Data length
                    0x2a,
                    0x2b,
                    0x2c
                ]);
            });

            it('defaults the dimension to the Overworld', () => {
                const pk = new LevelChunkPacket();
                pk.chunkX = 0;
                pk.chunkZ = 0;
                pk.subChunkCount = 0;
                pk.data = Buffer.alloc(0);

                expect(payloadOf(pk)).toEqual([
                    0x00, // Chunk Position X
                    0x00, // Chunk Position Z
                    0x00, // Dimension Id, ZigZag(0), the Overworld
                    0x00, // Sub-chunks Count
                    0x00, // Client Request SubChunk Limit absent
                    0x00, // Cache Enabled false
                    0x00, // Cache Metadata, empty
                    0x00 // Serialized Chunk Data length
                ]);
            });

            it('uses the network id the client expects', () => {
                expect(LevelChunkPacket.NetID).toBe(0x3a);
            });
        });
    });
});
