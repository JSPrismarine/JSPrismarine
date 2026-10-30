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

/** `OVERWORLD` with the vanilla cloud height, which only a 2225 layout carries. */
const OVERWORLD_WITH_CLOUDS = new DimensionDefinition(
    OVERWORLD.minimumY,
    OVERWORLD.heightRange,
    OVERWORLD.generatorType,
    OVERWORLD.dimensionType,
    OVERWORLD.packId,
    OVERWORLD.defaultBiome,
    192,
    true
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

/** `OVERWORLD_WITH_CLOUDS` at protocol 2225: the 2193 bytes, then the two appended fields. */
const BYTES_2225 = Buffer.from([
    ...BYTES,
    ...[0x80, 0x03], // Cloud Height: 192 ZigZag varint32 (384)
    0x01 // Render Clouds: true
]);

describe('DimensionDefinition', () => {
    it('writes the six fields in the order protocol 2193 defines', () => {
        const stream = new NetworkBinaryStream();
        OVERWORLD.serialize(stream);

        expect([...stream.getBuffer()]).toEqual([...BYTES]);
    });

    it('leaves the cloud fields off the wire at 2193', () => {
        const stream = new NetworkBinaryStream();
        OVERWORLD_WITH_CLOUDS.serialize(stream, 2193);

        expect([...stream.getBuffer()]).toEqual([...BYTES]);
    });

    it('appends Cloud Height and Render Clouds at 2225', () => {
        const stream = new NetworkBinaryStream();
        OVERWORLD_WITH_CLOUDS.serialize(stream, 2225);

        expect([...stream.getBuffer()]).toEqual([...BYTES_2225]);
    });

    it('reads a hand-built 2193 buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const definition = DimensionDefinition.deserialize(stream);

        expect(definition).toEqual(OVERWORLD);
        expect(definition.cloudHeight).toBe(0);
        expect(definition.renderClouds).toBe(false);
        expect(stream.feof()).toBe(true);
    });

    it('reads a hand-built 2225 buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES_2225);
        const definition = DimensionDefinition.read(stream, 2225);

        expect(definition).toEqual(OVERWORLD_WITH_CLOUDS);
        expect(stream.feof()).toBe(true);
    });

    it('round-trips through both layouts', () => {
        for (const protocolVersion of [2193, 2225]) {
            const stream = new NetworkBinaryStream();
            OVERWORLD_WITH_CLOUDS.serialize(stream, protocolVersion);

            const read = DimensionDefinition.read(new NetworkBinaryStream(stream.getBuffer()), protocolVersion);
            expect(read).toEqual(protocolVersion >= 2225 ? OVERWORLD_WITH_CLOUDS : OVERWORLD);
        }
    });

    it('constructs an empty definition without arguments', () => {
        const definition = new DimensionDefinition();

        expect(definition.generatorType).toBe(Generator.UNDEFINED);
        expect(definition.packId).toEqual(new UUID(0n, 0n));
        expect(definition.defaultBiome).toBe('');
        expect(definition.cloudHeight).toBe(0);
        expect(definition.renderClouds).toBe(false);
    });
});
