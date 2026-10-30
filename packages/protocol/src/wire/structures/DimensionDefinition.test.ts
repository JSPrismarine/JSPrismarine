import BinaryStream from '@jsprismarine/binaryutils';
import { Generator } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import UUID from '../../structure/UUID';
import { layoutAt } from '../WireLayout';
import { dimensionDefinition, readDimensionDefinition, writeDimensionDefinition } from './DimensionDefinition';

import type { DimensionDefinitionFields } from './DimensionDefinition';

/** One custom sky dimension, clouds drawn at y 192, registered by an all-zero pack id. */
const SKY: DimensionDefinitionFields = {
    minimumY: 0,
    heightRange: 256,
    generatorType: Generator.VOID,
    dimensionType: 1000,
    packId: new UUID(0n, 0n),
    defaultBiome: 'minecraft:the_void',
    cloudHeight: 192,
    renderClouds: true
};

/** `SKY` at protocol 2193, written by hand in the order the schema's ordinals give. */
const BYTES_2193 = Buffer.from([
    0x00, // Minimum Y: 0
    ...[0x80, 0x04], // Height Range: 256 ZigZag varint32 (512)
    0x0a, // Generator Type: Void (5) ZigZag varint32
    ...[0xd0, 0x0f], // Dimension Type: 1000 ZigZag varint32 (2000)
    ...Array.from({ length: 16 }, () => 0x00), // Pack Id: an all-zero uuid
    ...[0x12, ...Buffer.from('minecraft:the_void', 'utf8')] // Default Biome, 18 bytes
]);

/** The two fields 2225 appends, in ordinal order. */
const CLOUD_BYTES = Buffer.from([
    ...[0x80, 0x03], // Cloud Height: 192 ZigZag varint32 (384)
    0x01 // Render Clouds: true
]);

const encodeAt = (protocolVersion: number, value: DimensionDefinitionFields): Buffer => {
    const stream = new BinaryStream();
    writeDimensionDefinition(stream, value, protocolVersion);
    return stream.getBuffer();
};

describe('the declarative DimensionDefinition layout', () => {
    it('puts six fields on the wire at 2193 and eight at 2225', () => {
        expect(layoutAt(dimensionDefinition, 2193).fields.map((field) => field.key)).toEqual([
            'minimumY',
            'heightRange',
            'generatorType',
            'dimensionType',
            'packId',
            'defaultBiome'
        ]);
        expect(layoutAt(dimensionDefinition, 2225).fields.map((field) => field.key)).toEqual([
            'minimumY',
            'heightRange',
            'generatorType',
            'dimensionType',
            'packId',
            'defaultBiome',
            'cloudHeight',
            'renderClouds'
        ]);
    });

    it('writes the 2193 bytes with no cloud fields', () => {
        expect([...encodeAt(2193, SKY)]).toEqual([...BYTES_2193]);
    });

    it('appends exactly Cloud Height and Render Clouds at 2225', () => {
        expect([...encodeAt(2225, SKY)]).toEqual([...Buffer.concat([BYTES_2193, CLOUD_BYTES])]);
    });

    it('reads the 2193 bytes to their end and falls back to no clouds', () => {
        const stream = new BinaryStream(BYTES_2193);

        expect(readDimensionDefinition(stream, 2193)).toEqual({ ...SKY, cloudHeight: 0, renderClouds: false });
        expect(stream.feof()).toBe(true);
    });

    it('reads the 2225 bytes to their end with the clouds', () => {
        const stream = new BinaryStream(Buffer.concat([BYTES_2193, CLOUD_BYTES]));

        expect(readDimensionDefinition(stream, 2225)).toEqual(SKY);
        expect(stream.feof()).toBe(true);
    });

    it('defaults to the 2193 layout when no version is given', () => {
        const stream = new BinaryStream();
        writeDimensionDefinition(stream, SKY);

        expect([...stream.getBuffer()]).toEqual([...BYTES_2193]);
        expect(readDimensionDefinition(new BinaryStream(stream.getBuffer()))).toEqual({
            ...SKY,
            cloudHeight: 0,
            renderClouds: false
        });
    });
});
