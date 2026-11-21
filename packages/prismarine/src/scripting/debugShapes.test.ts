import NetworkBinaryStream from '@jsprismarine/protocol/NetworkBinaryStream';
import PrimitiveShapesPacket from '@jsprismarine/protocol/bedrock/packet/PrimitiveShapesPacket';
import PrimitiveShapeData, {
    PrimitiveShapeExtraDataType,
    PrimitiveShapeType
} from '@jsprismarine/protocol/bedrock/structure/PrimitiveShapeData';
import Vec2 from '@jsprismarine/protocol/bedrock/structure/Vec2';
import Vec3 from '@jsprismarine/protocol/bedrock/structure/Vec3';
import type { ScriptDebugShape } from '@jsprismarine/script-host/host/world';
import { describe, expect, it } from 'vitest';

import { argb, primitiveShapes } from './debugShapes';

const BASE: Omit<ScriptDebugShape, 'kind'> = {
    location: { x: 1, y: 2, z: 3 },
    color: { red: 1, green: 0, blue: 0, alpha: 1 },
    scale: 2,
    rotation: { x: 0, y: 90, z: 0 }
};

const DIMENSIONS: Readonly<Record<string, number>> = { 'minecraft:overworld': 0, 'minecraft:nether': 1 };
const dimensionId = (name: string): number | undefined => DIMENSIONS[name];

describe('primitiveShapes', () => {
    it('packs a color as ARGB, holding each part between 0 and 1', () => {
        expect(argb({ red: 1, green: 0, blue: 0, alpha: 1 })).toBe(0xffff0000);
        expect(argb({ red: 2, green: -1, blue: 0.5, alpha: 0 })).toBe(0x00ff0080);
    });

    it("writes a shape's common fields, its class's data, and a removal as an entry with no type", () => {
        const [box, cone, removed] = primitiveShapes(
            [
                {
                    id: 4,
                    shape: {
                        ...BASE,
                        kind: 'DebugBox',
                        bound: { x: 2, y: 1, z: 1 },
                        dimension: 'minecraft:nether',
                        timeLeft: 1.5,
                        attachedTo: '9'
                    }
                },
                { id: 5, shape: { ...BASE, kind: 'DebugCone', height: 3, numSegments: 7, radii: { x: 2, y: 0.5 } } },
                { id: 6 }
            ],
            dimensionId
        );

        expect(box).toEqual(
            new PrimitiveShapeData({
                networkId: 4n,
                shapeType: PrimitiveShapeType.Box,
                location: new Vec3(1, 2, 3),
                scale: 2,
                rotation: new Vec3(0, 90, 0),
                totalTimeLeft: 1.5,
                maxRenderDistance: undefined,
                color: 0xffff0000,
                dimensionId: 1,
                attachedToEntityId: 9n,
                extraData: { type: PrimitiveShapeExtraDataType.Box, bound: new Vec3(2, 1, 1) }
            })
        );
        expect(cone?.extraData).toEqual({
            type: PrimitiveShapeExtraDataType.Cone,
            radii: new Vec2(2, 0.5),
            height: 3,
            segments: 7
        });
        expect(cone?.dimensionId).toBeUndefined();
        expect(removed).toEqual(
            new PrimitiveShapeData({ networkId: 6n, extraData: { type: PrimitiveShapeExtraDataType.None } })
        );
    });

    it('gives every class an entry the packet writes and reads back the same', () => {
        const kinds: ScriptDebugShape[] = [
            {
                ...BASE,
                kind: 'DebugArrow',
                endLocation: { x: 4, y: 5, z: 6 },
                headLength: 1,
                headRadius: 0.5,
                headSegments: 4
            },
            { ...BASE, kind: 'DebugBox', bound: { x: 1, y: 1, z: 1 } },
            { ...BASE, kind: 'DebugCircle' },
            { ...BASE, kind: 'DebugCone', height: 1, numSegments: 20, radii: { x: 1, y: 1 } },
            { ...BASE, kind: 'DebugCylinder', height: 1, numSegments: 20, radii: { x: 1, y: 2 } },
            { ...BASE, kind: 'DebugEllipsoid', radii: { x: 1, y: 2, z: 3 }, segmentsPerAxis: 20 },
            { ...BASE, kind: 'DebugLine', endLocation: { x: 4, y: 5, z: 6 } },
            { ...BASE, kind: 'DebugPyramid', height: 1, width: 1, depth: 2 },
            { ...BASE, kind: 'DebugSphere' },
            {
                ...BASE,
                kind: 'DebugText',
                text: 'hello',
                useRotation: false,
                backgroundColorOverride: { red: 0, green: 0, blue: 0, alpha: 0.5 },
                lineGapHeight: 0,
                depthTest: false,
                backfaceVisible: true,
                textBackfaceVisible: false
            }
        ];
        const data = {
            shapes: primitiveShapes(
                kinds.map((shape, index) => ({ id: index + 1, shape })),
                dimensionId
            )
        };
        const bytes = new PrimitiveShapesPacket(data).serialize(new NetworkBinaryStream());
        const stream = new NetworkBinaryStream(bytes);

        expect(new PrimitiveShapesPacket().deserialize(stream)).toEqual(data);
        expect(stream.feof()).toBe(true);
    });
});
