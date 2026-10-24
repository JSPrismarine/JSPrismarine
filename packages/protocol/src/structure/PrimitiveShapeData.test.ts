import { Dimension } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import PrimitiveShapeData, { PrimitiveShapeExtraDataType, PrimitiveShapeType } from './PrimitiveShapeData';
import Vec2 from './Vec2';
import Vec3 from './Vec3';

import type { PrimitiveShapeExtraData } from './PrimitiveShapeData';

const floatLE = (value: number): number[] => {
    const bytes = Buffer.alloc(4);
    bytes.writeFloatLE(value);
    return [...bytes];
};

/** A text shape with every optional present. */
const TEXT = new PrimitiveShapeData({
    networkId: 300n,
    shapeType: PrimitiveShapeType.Text,
    location: new Vec3(1, 64, -1),
    scale: 2,
    rotation: new Vec3(0, 0.5, 0),
    totalTimeLeft: 10,
    maxRenderDistance: 64,
    color: 0xff112233,
    dimensionId: Dimension.NETHER,
    attachedToEntityId: -2n,
    extraData: {
        type: PrimitiveShapeExtraDataType.Text,
        text: 'hi',
        useRotation: true,
        backgroundColor: 0x80000000,
        lineGapHeight: 0.25,
        depthTest: false,
        showBackface: true,
        showTextBackface: false
    }
});

/** `TEXT` on the wire, written by hand in the order the docs list the fields. */
const TEXT_BYTES = Buffer.from([
    ...[0xac, 0x02], // NetworkId 300, varuint64
    ...[0x01, 0x04], // Shape Type present, Text
    ...[0x01, ...floatLE(1), ...floatLE(64), ...floatLE(-1)], // Location present, then X, Y, Z
    ...[0x01, ...floatLE(2)], // Scale present, 2
    ...[0x01, ...floatLE(0), ...floatLE(0.5), ...floatLE(0)], // Rotation present, then X, Y, Z
    ...[0x01, ...floatLE(10)], // Total Time Left present, 10
    ...[0x01, ...floatLE(64)], // Maximum Render Distance present, 64
    ...[0x01, 0x33, 0x22, 0x11, 0xff], // Color present, ARGB 0xff112233 as a little-endian int32
    ...[0x01, 0x02], // Dimension ID present, 1 (Nether) as ZigZag varint32
    ...[0x01, 0x03], // Attached To Entity ID present, -2 as ZigZag varint64
    0x02, // Extra Shape Data selector: TextDataPayload is alternative 2
    ...[0x02, 0x68, 0x69], // Text "hi"
    0x01, // UseRotation
    ...[0x01, 0x00, 0x00, 0x00, 0x80], // BackgroundColor present, ARGB 0x80000000 little-endian
    ...floatLE(0.25), // LineGapHeight
    0x00, // DepthTest
    0x01, // ShowBackface
    0x00 // ShowTextBackface
]);

/** A removal: the id and nothing else. */
const REMOVAL = new PrimitiveShapeData({ networkId: 7n, extraData: { type: PrimitiveShapeExtraDataType.None } });

const REMOVAL_BYTES = Buffer.from([
    0x07, // NetworkId 7
    ...Array.from({ length: 9 }, () => 0x00), // Shape Type through Attached To Entity ID, all absent
    0x00 // Extra Shape Data selector: null is alternative 0
]);

/** An arrow whose extra data has every optional absent. */
const BARE_ARROW = new PrimitiveShapeData({
    networkId: 1n,
    shapeType: PrimitiveShapeType.Arrow,
    location: new Vec3(0, 0, 0),
    dimensionId: Dimension.OVERWORLD,
    extraData: { type: PrimitiveShapeExtraDataType.Arrow }
});

const BARE_ARROW_BYTES = Buffer.from([
    0x01, // NetworkId 1
    ...[0x01, 0x05], // Shape Type present, Arrow
    ...[0x01, ...floatLE(0), ...floatLE(0), ...floatLE(0)], // Location present, origin
    0x00, // Scale absent
    0x00, // Rotation absent
    0x00, // Total Time Left absent
    0x00, // Maximum Render Distance absent
    0x00, // Color absent
    ...[0x01, 0x00], // Dimension ID present, 0 (Overworld)
    0x00, // Attached To Entity ID absent
    0x01, // Extra Shape Data selector: ArrowDataPayload is alternative 1
    0x00, // Arrow End Location absent
    0x00, // Arrow Head Length absent
    0x00, // Arrow Head Radius absent
    0x00 // Num Segments absent
]);

/** One value of every `Extra Shape Data` alternative, with every optional present. */
const EXTRA_DATA: [string, PrimitiveShapeExtraData][] = [
    ['null', { type: PrimitiveShapeExtraDataType.None }],
    [
        'ArrowDataPayload',
        {
            type: PrimitiveShapeExtraDataType.Arrow,
            endLocation: new Vec3(1, 2, 3),
            headLength: 0.5,
            headRadius: 0.25,
            segments: 8
        }
    ],
    [
        'TextDataPayload',
        {
            type: PrimitiveShapeExtraDataType.Text,
            text: 'label',
            useRotation: false,
            backgroundColor: 0x40ff0000,
            lineGapHeight: 1,
            depthTest: true,
            showBackface: false,
            showTextBackface: true
        }
    ],
    ['BoxDataPayload', { type: PrimitiveShapeExtraDataType.Box, bound: new Vec3(1, 1, 1) }],
    ['LineDataPayload', { type: PrimitiveShapeExtraDataType.Line, endLocation: new Vec3(4, 5, 6) }],
    ['SphereDataPayload', { type: PrimitiveShapeExtraDataType.Sphere, segments: 20 }],
    [
        'CylinderDataPayload',
        {
            type: PrimitiveShapeExtraDataType.Cylinder,
            radiusX: new Vec2(1, 2),
            radiusZ: new Vec2(3, 4),
            height: 5,
            segments: 12
        }
    ],
    ['PyramidDataPayload', { type: PrimitiveShapeExtraDataType.Pyramid, width: 2, depth: 3, height: 4 }],
    [
        'EllipsoidDataPayload',
        { type: PrimitiveShapeExtraDataType.Ellipsoid, radii: new Vec3(1, 2, 3), segmentsPerAxis: 6 }
    ],
    ['ConeDataPayload', { type: PrimitiveShapeExtraDataType.Cone, radii: new Vec2(1, 2), height: 3, segments: 16 }]
];

const roundTrip = (shape: PrimitiveShapeData) => {
    const out = new NetworkBinaryStream();
    shape.serialize(out);
    const stream = new NetworkBinaryStream(out.getBuffer());
    const decoded = PrimitiveShapeData.deserialize(stream);
    return { decoded, stream };
};

describe('PrimitiveShapeData', () => {
    it('numbers the shape types as the docs do', () => {
        expect(PrimitiveShapeType.Line).toBe(0);
        expect(PrimitiveShapeType.Text).toBe(4);
        expect(PrimitiveShapeType.Cone).toBe(9);
    });

    it('writes every field in the order protocol 2193 defines', () => {
        const stream = new NetworkBinaryStream();
        TEXT.serialize(stream);

        expect([...stream.getBuffer()]).toEqual([...TEXT_BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(TEXT_BYTES);
        const shape = PrimitiveShapeData.deserialize(stream);

        expect(shape).toEqual(TEXT);
        expect(stream.feof()).toBe(true);
    });

    it('writes a removal as the id, nine absent optionals and the null alternative', () => {
        const stream = new NetworkBinaryStream();
        REMOVAL.serialize(stream);

        expect([...stream.getBuffer()]).toEqual([...REMOVAL_BYTES]);
    });

    it('reads a removal to its end', () => {
        const stream = new NetworkBinaryStream(REMOVAL_BYTES);
        const shape = PrimitiveShapeData.deserialize(stream);

        expect(shape).toEqual(REMOVAL);
        expect(stream.feof()).toBe(true);
    });

    it('writes a presence byte for each absent arrow field', () => {
        const stream = new NetworkBinaryStream();
        BARE_ARROW.serialize(stream);

        expect([...stream.getBuffer()]).toEqual([...BARE_ARROW_BYTES]);
    });

    it('reads a bare arrow to its end', () => {
        const stream = new NetworkBinaryStream(BARE_ARROW_BYTES);
        const shape = PrimitiveShapeData.deserialize(stream);

        expect(shape).toEqual(BARE_ARROW);
        expect(stream.feof()).toBe(true);
    });

    it.each(EXTRA_DATA)('round-trips %s', (_name, extraData) => {
        const shape = new PrimitiveShapeData({ networkId: 42n, dimensionId: Dimension.END, extraData });
        const { decoded, stream } = roundTrip(shape);

        expect(decoded).toEqual(shape);
        expect(stream.feof()).toBe(true);
    });

    it('round-trips a pyramid without a depth', () => {
        const shape = new PrimitiveShapeData({
            networkId: 1n,
            extraData: { type: PrimitiveShapeExtraDataType.Pyramid, width: 2, height: 4 }
        });
        const { decoded, stream } = roundTrip(shape);

        expect(decoded).toEqual(shape);
        expect(stream.feof()).toBe(true);
    });

    it('rejects a selector past the ten alternatives', () => {
        const stream = new NetworkBinaryStream(Buffer.from([...REMOVAL_BYTES.subarray(0, -1), 0x0a]));

        expect(() => PrimitiveShapeData.deserialize(stream)).toThrow(
            'Unknown primitive shape extra data alternative 10'
        );
    });
});
