import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import SerializableVoxelShape from '../structure/SerializableVoxelShape';
import VoxelShapesPacket from './VoxelShapesPacket';

import type { VoxelShapes } from './VoxelShapesPacket';

/** Handle 0: a single solid cell filling the block. */
const UNIT_CUBE = new SerializableVoxelShape({ xSize: 1, ySize: 1, zSize: 1, storage: [0x01] }, [0, 1], [0, 1], [0, 1]);

/** Handle 1: a 2 by 1 by 1 grid with only its first cell solid, added by a pack. */
const HALF = new SerializableVoxelShape(
    { xSize: 2, ySize: 1, zSize: 1, storage: [0x01] },
    [0, 0.5, 1],
    [0, 0.5],
    [0, 1]
);

const DATA: VoxelShapes = {
    shapes: [UNIT_CUBE, HALF],
    nameMap: [
        { name: 'minecraft:unit_cube', handle: 0 },
        { name: 'ns:half', handle: 1 }
    ],
    customShapeCount: 1
};

/** `DATA` on the wire, both header bytes included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xd1, 0x02], // packet id header, varuint32 337
    0x02, // Shapes count, a varuint32
    ...[0x01, 0x01, 0x01], // Shapes[0] Cells: X Size, Y Size, Z Size
    ...[0x01, 0x01], // Shapes[0] Storage: one byte, cell 0 solid
    ...[0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80, 0x3f], // Shapes[0] X Coordinates 0, 1
    ...[0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80, 0x3f], // Shapes[0] Y Coordinates 0, 1
    ...[0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80, 0x3f], // Shapes[0] Z Coordinates 0, 1
    ...[0x02, 0x01, 0x01], // Shapes[1] Cells: X Size, Y Size, Z Size
    ...[0x01, 0x01], // Shapes[1] Storage: one byte, cell 0 solid
    ...[0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x3f, 0x00, 0x00, 0x80, 0x3f], // Shapes[1] X Coordinates 0, 0.5, 1
    ...[0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x3f], // Shapes[1] Y Coordinates 0, 0.5
    ...[0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80, 0x3f], // Shapes[1] Z Coordinates 0, 1
    0x02, // Name Map count, a varuint32
    ...[0x13, ...Buffer.from('minecraft:unit_cube', 'utf8')], // key "minecraft:unit_cube", 19 bytes
    ...[0x00, 0x00], // value: handle 0, little-endian uint16
    ...[0x07, ...Buffer.from('ns:half', 'utf8')], // key "ns:half"
    ...[0x01, 0x00], // value: handle 1, little-endian uint16
    ...[0x01, 0x00] // Custom Shape Count 1, little-endian uint16
]);

/** A registry with nothing in it. */
const EMPTY: VoxelShapes = { shapes: [], nameMap: [], customShapeCount: 0 };

/** `EMPTY` on the wire: the header, two zero counts and a zero uint16. */
const EMPTY_BYTES = Buffer.from([0xd1, 0x02, 0x00, 0x00, 0x00, 0x00]);

describe('VoxelShapesPacket', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new VoxelShapesPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new VoxelShapesPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('writes an empty registry as four payload bytes', () => {
        const buffer = new VoxelShapesPacket(EMPTY).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...EMPTY_BYTES]);
    });

    it('reads an empty registry to the end of the buffer', () => {
        const stream = new NetworkBinaryStream(EMPTY_BYTES);
        const data = new VoxelShapesPacket().deserialize(stream);

        expect(data).toEqual(EMPTY);
        expect(stream.feof()).toBe(true);
    });
});
