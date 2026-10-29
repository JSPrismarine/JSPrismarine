import BinaryStream from '@jsprismarine/binaryutils';
import { netIdFor } from '../codec/v2193';
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

            it('round-trips a plain chunk, where the count is a count', () => {
                const pk = new LevelChunkPacket();
                pk.chunkX = -5;
                pk.chunkZ = 12;
                pk.dimension = 1;
                pk.subChunkCount = 6;
                pk.data = Buffer.from([0x2a, 0x2b, 0x2c]);
                pk.encode();

                const decoded = new LevelChunkPacket(pk.getBuffer());
                decoded.decode();

                expect(decoded.chunkX).toBe(-5);
                expect(decoded.chunkZ).toBe(12);
                expect(decoded.dimension).toBe(1);
                expect(decoded.clientSubChunkRequestsEnabled).toBe(false);
                expect(decoded.subChunkCount).toBe(6);
                expect(decoded.data).toEqual(Buffer.from([0x2a, 0x2b, 0x2c]));
                expect(decoded.feof()).toBe(true);
            });

            it('round-trips request mode, where the count becomes the request limit', () => {
                const pk = new LevelChunkPacket();
                pk.chunkX = 3;
                pk.chunkZ = -7;
                pk.subChunkCount = 24;
                pk.clientSubChunkRequestsEnabled = true;
                pk.data = Buffer.alloc(0);
                pk.encode();

                const decoded = new LevelChunkPacket(pk.getBuffer());
                decoded.decode();

                expect(decoded.clientSubChunkRequestsEnabled).toBe(true);
                expect(decoded.subChunkCount).toBe(24);
                expect(decoded.data).toEqual(Buffer.alloc(0));
                expect(decoded.feof()).toBe(true);
            });

            it('uses the network id the client expects', () => {
                expect(netIdFor('LevelChunkPacket')).toBe(0x3a);
            });
        });
    });
});
