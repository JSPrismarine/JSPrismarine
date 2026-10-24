import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import SerializableVoxelShape from './SerializableVoxelShape';

/** A 2 by 1 by 1 grid with only its first cell solid, splitting the block at x 0.5 and y 0.5. */
const HALF = new SerializableVoxelShape(
    { xSize: 2, ySize: 1, zSize: 1, storage: [0x01] },
    [0, 0.5, 1],
    [0, 0.5],
    [0, 1]
);

/** `HALF` on the wire, written by hand in the order the docs list the fields. */
const HALF_BYTES = Buffer.from([
    ...[0x02, 0x01, 0x01], // Cells: X Size 2, Y Size 1, Z Size 1
    0x01, // Storage count, a varuint32
    0x01, // Storage: cell 0 solid, cell 1 empty
    0x03, // X Coordinates count
    ...[0x00, 0x00, 0x00, 0x00], // X Coordinates[0] 0, little-endian float
    ...[0x00, 0x00, 0x00, 0x3f], // X Coordinates[1] 0.5
    ...[0x00, 0x00, 0x80, 0x3f], // X Coordinates[2] 1
    0x02, // Y Coordinates count
    ...[0x00, 0x00, 0x00, 0x00], // Y Coordinates[0] 0
    ...[0x00, 0x00, 0x00, 0x3f], // Y Coordinates[1] 0.5
    0x02, // Z Coordinates count
    ...[0x00, 0x00, 0x00, 0x00], // Z Coordinates[0] 0
    ...[0x00, 0x00, 0x80, 0x3f] // Z Coordinates[1] 1
]);

/** The docs' empty shape: no cells and a single boundary at 0 on each axis. */
const EMPTY = new SerializableVoxelShape();

/** `EMPTY` on the wire. */
const EMPTY_BYTES = Buffer.from([
    ...[0x00, 0x00, 0x00], // Cells: X Size, Y Size, Z Size all 0
    0x00, // Storage count
    ...[0x01, 0x00, 0x00, 0x00, 0x00], // X Coordinates: one boundary, 0
    ...[0x01, 0x00, 0x00, 0x00, 0x00], // Y Coordinates: one boundary, 0
    ...[0x01, 0x00, 0x00, 0x00, 0x00] // Z Coordinates: one boundary, 0
]);

describe('SerializableVoxelShape', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const stream = new NetworkBinaryStream();
        HALF.serialize(stream);

        expect([...stream.getBuffer()]).toEqual([...HALF_BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(HALF_BYTES);
        const shape = SerializableVoxelShape.deserialize(stream);

        expect(shape).toEqual(HALF);
        expect(stream.feof()).toBe(true);
    });

    it('writes the default instance as the empty shape', () => {
        const stream = new NetworkBinaryStream();
        EMPTY.serialize(stream);

        expect([...stream.getBuffer()]).toEqual([...EMPTY_BYTES]);
    });

    it('reads the empty shape back with an empty storage list', () => {
        const stream = new NetworkBinaryStream(EMPTY_BYTES);
        const shape = SerializableVoxelShape.deserialize(stream);

        expect(shape).toEqual(EMPTY);
        expect(shape.cells.storage).toEqual([]);
        expect(stream.feof()).toBe(true);
    });
});
