import { Dimension } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import { PacketIdentifier } from '../PacketIdentifier';
import PrimitiveShapeData, { PrimitiveShapeExtraDataType, PrimitiveShapeType } from '../structure/PrimitiveShapeData';
import Vec3 from '../structure/Vec3';
import PrimitiveShapesPacket from './PrimitiveShapesPacket';

import type { PrimitiveShapes } from './PrimitiveShapesPacket';

/** Header bytes: 328 as a varuint32, both subclient ids zero. */
const HEADER = [0xc8, 0x02];

const floatLE = (value: number): number[] => {
    const bytes = Buffer.alloc(4);
    bytes.writeFloatLE(value);
    return [...bytes];
};

/** A new line and a removal in one packet. */
const DATA: PrimitiveShapes = {
    shapes: [
        new PrimitiveShapeData({
            networkId: 1n,
            shapeType: PrimitiveShapeType.Line,
            location: new Vec3(0, 64, 0),
            color: 0xffff0000,
            dimensionId: Dimension.OVERWORLD,
            extraData: { type: PrimitiveShapeExtraDataType.Line, endLocation: new Vec3(0, 70, 0) }
        }),
        new PrimitiveShapeData({ networkId: 2n, extraData: { type: PrimitiveShapeExtraDataType.None } })
    ]
};

/** `DATA` on the wire, header included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...HEADER,
    0x02, // shape count, a varuint32
    // First shape: a red line from y 64 to y 70.
    0x01, // NetworkId 1
    ...[0x01, 0x00], // Shape Type present, Line
    ...[0x01, ...floatLE(0), ...floatLE(64), ...floatLE(0)], // Location present, then X, Y, Z
    0x00, // Scale absent
    0x00, // Rotation absent
    0x00, // Total Time Left absent
    0x00, // Maximum Render Distance absent
    ...[0x01, 0x00, 0x00, 0xff, 0xff], // Color present, ARGB 0xffff0000 as a little-endian int32
    ...[0x01, 0x00], // Dimension ID present, 0 (Overworld)
    0x00, // Attached To Entity ID absent
    0x04, // Extra Shape Data selector: LineDataPayload is alternative 4
    ...[...floatLE(0), ...floatLE(70), ...floatLE(0)], // Line End Location
    // Second shape: remove shape 2.
    0x02, // NetworkId 2
    ...Array.from({ length: 9 }, () => 0x00), // every optional absent
    0x00 // Extra Shape Data selector: null
]);

/** An empty list: the header and a zero count. */
const EMPTY_BYTES = Buffer.from([...HEADER, 0x00]);

describe('PrimitiveShapesPacket', () => {
    it('uses packet id 328', () => {
        expect(new PrimitiveShapesPacket().id).toBe(PacketIdentifier.PRIMITIVE_SHAPES);
        expect(new PrimitiveShapesPacket().id).toBe(328);
    });

    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new PrimitiveShapesPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new PrimitiveShapesPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('writes an empty list as the header and a zero count', () => {
        const buffer = new PrimitiveShapesPacket({ shapes: [] }).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...EMPTY_BYTES]);
    });

    it('reads an empty list to its end', () => {
        const stream = new NetworkBinaryStream(EMPTY_BYTES);
        const data = new PrimitiveShapesPacket().deserialize(stream);

        expect(data).toEqual({ shapes: [] });
        expect(stream.feof()).toBe(true);
    });
});
