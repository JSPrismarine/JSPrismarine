import { Generator } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import DimensionDefinition from './DimensionDefinition';
import UUID from './UUID';

/** The vanilla Overworld shape, flat generator, registered by pack `00112233-4455-6677-8899-aabbccddeeff`. */
const OVERWORLD = new DimensionDefinition(
    -64,
    384,
    Generator.FLAT,
    0,
    new UUID(0x0011_2233_4455_6677n, 0x8899_aabb_ccdd_eeffn),
    'minecraft:plains'
);

/** `OVERWORLD` on the wire, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    0x7f, // Minimum Y: -64 ZigZag varint32
    ...[0x80, 0x06], // Height Range: 384 ZigZag varint32 (768)
    0x04, // Generator Type: Flat (2) ZigZag varint32
    0x00, // Dimension Type: 0 ZigZag varint32
    ...[0x77, 0x66, 0x55, 0x44, 0x33, 0x22, 0x11, 0x00], // Pack Id, Most Significant Bits little-endian
    ...[0xff, 0xee, 0xdd, 0xcc, 0xbb, 0xaa, 0x99, 0x88], // Pack Id, Least Significant Bits little-endian
    ...[0x10, ...Buffer.from('minecraft:plains', 'utf8')] // Default Biome, 16 bytes
]);

describe('DimensionDefinition', () => {
    it('writes the six fields in the order protocol 2193 defines', () => {
        const stream = new NetworkBinaryStream();
        OVERWORLD.serialize(stream);

        expect([...stream.getBuffer()]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const definition = DimensionDefinition.deserialize(stream);

        expect(definition).toEqual(OVERWORLD);
        expect(stream.feof()).toBe(true);
    });

    it('constructs an empty definition without arguments', () => {
        const definition = new DimensionDefinition();

        expect(definition.generatorType).toBe(Generator.UNDEFINED);
        expect(definition.packId).toEqual(new UUID(0n, 0n));
        expect(definition.defaultBiome).toBe('');
    });
});
