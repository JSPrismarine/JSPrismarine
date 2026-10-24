import { Generator } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import DimensionDefinition from '../structure/DimensionDefinition';
import UUID from '../structure/UUID';
import DimensionDataPacket from './DimensionDataPacket';

import type { DimensionData } from './DimensionDataPacket';

const DATA: DimensionData = {
    definitions: [
        {
            id: 'minecraft:overworld',
            definition: new DimensionDefinition(
                -64,
                384,
                Generator.FLAT,
                0,
                new UUID(0x0011_2233_4455_6677n, 0x8899_aabb_ccdd_eeffn),
                'minecraft:plains'
            )
        },
        {
            id: 'example:sky',
            definition: new DimensionDefinition(0, 256, Generator.VOID, 1000, new UUID(0n, 0n), 'minecraft:the_void')
        }
    ]
};

/** `DATA` on the wire, header included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xb4, 0x01], // packet id header, 180 as a varuint32
    0x02, // Definitions count, a varuint32
    ...[0x13, ...Buffer.from('minecraft:overworld', 'utf8')], // first key, 19 bytes
    0x7f, // Minimum Y: -64 ZigZag varint32
    ...[0x80, 0x06], // Height Range: 384 ZigZag varint32 (768)
    0x04, // Generator Type: Flat (2) ZigZag varint32
    0x00, // Dimension Type: 0 ZigZag varint32
    ...[0x77, 0x66, 0x55, 0x44, 0x33, 0x22, 0x11, 0x00], // Pack Id, Most Significant Bits little-endian
    ...[0xff, 0xee, 0xdd, 0xcc, 0xbb, 0xaa, 0x99, 0x88], // Pack Id, Least Significant Bits little-endian
    ...[0x10, ...Buffer.from('minecraft:plains', 'utf8')], // Default Biome, 16 bytes
    ...[0x0b, ...Buffer.from('example:sky', 'utf8')], // second key, 11 bytes
    0x00, // Minimum Y: 0
    ...[0x80, 0x04], // Height Range: 256 ZigZag varint32 (512)
    0x0a, // Generator Type: Void (5) ZigZag varint32
    ...[0xd0, 0x0f], // Dimension Type: 1000 ZigZag varint32 (2000)
    ...Array.from({ length: 16 }, () => 0x00), // Pack Id: an all-zero uuid
    ...[0x12, ...Buffer.from('minecraft:the_void', 'utf8')] // Default Biome, 18 bytes
]);

/** No data-driven dimensions: the header and a zero count. */
const EMPTY_BYTES = Buffer.from([0xb4, 0x01, 0x00]);

describe('DimensionDataPacket', () => {
    it('writes no definitions as the header and a zero count', () => {
        const buffer = new DimensionDataPacket({ definitions: [] }).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...EMPTY_BYTES]);
    });

    it('reads no definitions to the end of the buffer', () => {
        const stream = new NetworkBinaryStream(EMPTY_BYTES);

        expect(new DimensionDataPacket().deserialize(stream)).toEqual({ definitions: [] });
        expect(stream.feof()).toBe(true);
    });

    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new DimensionDataPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new DimensionDataPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });
});
