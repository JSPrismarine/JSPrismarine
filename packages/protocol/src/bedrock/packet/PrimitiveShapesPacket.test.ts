import { Dimension } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../../NetworkBinaryStream';
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

/** A text shape and a half-filled arrow, written by hand in the order both docs pages list the fields. */
const TEXT_AND_ARROW: PrimitiveShapes = {
    shapes: [
        new PrimitiveShapeData({
            networkId: 3n,
            shapeType: PrimitiveShapeType.Text,
            dimensionId: Dimension.NETHER,
            extraData: {
                type: PrimitiveShapeExtraDataType.Text,
                text: 'hi',
                useRotation: true,
                backgroundColor: 0xff000000,
                lineGapHeight: 1.5,
                depthTest: true,
                showBackface: false,
                showTextBackface: true
            }
        }),
        new PrimitiveShapeData({
            networkId: 4n,
            shapeType: PrimitiveShapeType.Arrow,
            extraData: { type: PrimitiveShapeExtraDataType.Arrow, endLocation: new Vec3(1, 2, 3), segments: 8 }
        })
    ]
};

const TEXT_AND_ARROW_BYTES = Buffer.from([
    ...HEADER,
    0x02, // shape count
    // Text shape.
    0x03, // NetworkId 3
    ...[0x01, 0x04], // Shape Type present, Text
    ...Array.from({ length: 6 }, () => 0x00), // Location, Scale, Rotation, Total Time Left, Max Render Distance, Color absent
    ...[0x01, 0x02], // Dimension ID present, 1 (Nether) as a ZigZag varint32
    0x00, // Attached To Entity ID absent
    0x02, // Extra Shape Data selector: TextDataPayload
    ...[0x02, 0x68, 0x69], // Text "hi"
    0x01, // UseRotation
    ...[0x01, 0x00, 0x00, 0x00, 0xff], // BackgroundColor present, 0xff000000 little-endian
    ...floatLE(1.5), // LineGapHeight
    0x01, // DepthTest
    0x00, // ShowBackface
    0x01, // ShowTextBackface
    // Arrow shape.
    0x04, // NetworkId 4
    ...[0x01, 0x05], // Shape Type present, Arrow
    ...Array.from({ length: 8 }, () => 0x00), // every other optional absent
    0x01, // Extra Shape Data selector: ArrowDataPayload
    ...[0x01, ...floatLE(1), ...floatLE(2), ...floatLE(3)], // Arrow End Location present
    0x00, // Arrow Head Length absent
    0x00, // Arrow Head Radius absent
    ...[0x01, 0x08] // Num Segments present, 8
]);

describe.each([2193, 2225])('PrimitiveShapesPacket at protocol %i', (protocol) => {
    it('writes the same bytes at both protocols', () => {
        const packet = new PrimitiveShapesPacket(TEXT_AND_ARROW);
        packet.codecProtocol = protocol;

        expect([...packet.serialize(new NetworkBinaryStream())]).toEqual([...TEXT_AND_ARROW_BYTES]);
    });

    it('reads them back to the end', () => {
        const packet = new PrimitiveShapesPacket();
        packet.codecProtocol = protocol;
        const stream = new NetworkBinaryStream(TEXT_AND_ARROW_BYTES);

        expect(packet.deserialize(stream)).toEqual(TEXT_AND_ARROW);
        expect(stream.feof()).toBe(true);
    });
});
