/**
 * The `PrimitiveShapesPacket` entries for the debug shapes a level's scripts draw with
 * `@minecraft/debug-utilities`, from the changes the script host hands the level once per flush.
 */
import PrimitiveShapeData, {
    PrimitiveShapeExtraDataType,
    PrimitiveShapeType
} from '@jsprismarine/protocol/structure/PrimitiveShapeData';
import type { PrimitiveShapeExtraData } from '@jsprismarine/protocol/structure/PrimitiveShapeData';
import Vec2 from '@jsprismarine/protocol/structure/Vec2';
import Vec3 from '@jsprismarine/protocol/structure/Vec3';
import type {
    ScriptDebugShape,
    ScriptDebugShapeChange,
    ScriptDebugShapeKind,
    ScriptRgba,
    ScriptVector3
} from '@jsprismarine/script-host/host/world';

/** The wire's shape type for each class. */
const SHAPE_TYPE: Readonly<Record<ScriptDebugShapeKind, PrimitiveShapeType>> = {
    DebugArrow: PrimitiveShapeType.Arrow,
    DebugBox: PrimitiveShapeType.Box,
    DebugCircle: PrimitiveShapeType.Circle,
    DebugCone: PrimitiveShapeType.Cone,
    DebugCylinder: PrimitiveShapeType.Cylinder,
    DebugEllipsoid: PrimitiveShapeType.Ellipsoid,
    DebugLine: PrimitiveShapeType.Line,
    DebugPyramid: PrimitiveShapeType.Pyramid,
    DebugSphere: PrimitiveShapeType.Sphere,
    DebugText: PrimitiveShapeType.Text
};

/**
 * The segments the wire's sphere data carries for a sphere or a circle, which the Script API
 * gives no property. It is the default the other round shapes start with.
 */
const ROUND_SEGMENTS = 20;

const vec3 = ({ x, y, z }: ScriptVector3): Vec3 => new Vec3(x, y, z);

/** A part of a color as a byte, with a script's value outside 0 to 1 held at the nearer end. */
const channel = (part: number): number => Math.round(Math.min(1, Math.max(0, part)) * 255);

/** A color as the wire packs it: `0xAARRGGBB` in an unsigned 32-bit integer. */
export const argb = ({ red, green, blue, alpha }: ScriptRgba): number =>
    ((channel(alpha) << 24) | (channel(red) << 16) | (channel(green) << 8) | channel(blue)) >>> 0;

/** The `Extra Shape Data` of a shape's class. */
const extraData = (shape: ScriptDebugShape): PrimitiveShapeExtraData => {
    const radii = shape.radii ?? { x: 1, y: 1 };
    const zero = { x: 0, y: 0, z: 0 };
    switch (shape.kind) {
        case 'DebugArrow':
            return {
                type: PrimitiveShapeExtraDataType.Arrow,
                endLocation: vec3(shape.endLocation ?? zero),
                headLength: shape.headLength,
                headRadius: shape.headRadius,
                segments: shape.headSegments
            };
        case 'DebugBox':
            return { type: PrimitiveShapeExtraDataType.Box, bound: vec3(shape.bound ?? zero) };
        case 'DebugLine':
            return { type: PrimitiveShapeExtraDataType.Line, endLocation: vec3(shape.endLocation ?? zero) };
        case 'DebugSphere':
        case 'DebugCircle':
            return { type: PrimitiveShapeExtraDataType.Sphere, segments: ROUND_SEGMENTS };
        case 'DebugCylinder':
            // The wire gives each axis a pair of radii; the Script API gives one per axis, so the
            // shape is as wide at both ends.
            return {
                type: PrimitiveShapeExtraDataType.Cylinder,
                radiusX: new Vec2(radii.x, radii.x),
                radiusZ: new Vec2(radii.y, radii.y),
                height: shape.height ?? 1,
                segments: shape.numSegments ?? ROUND_SEGMENTS
            };
        case 'DebugCone':
            return {
                type: PrimitiveShapeExtraDataType.Cone,
                radii: new Vec2(radii.x, radii.y),
                height: shape.height ?? 1,
                segments: shape.numSegments ?? ROUND_SEGMENTS
            };
        case 'DebugPyramid':
            return {
                type: PrimitiveShapeExtraDataType.Pyramid,
                width: shape.width ?? 1,
                depth: shape.depth,
                height: shape.height ?? 1
            };
        case 'DebugEllipsoid': {
            const each: ScriptVector3 =
                shape.radii !== undefined && 'z' in shape.radii ? shape.radii : { x: 1, y: 1, z: 1 };
            return {
                type: PrimitiveShapeExtraDataType.Ellipsoid,
                radii: vec3(each),
                segmentsPerAxis: shape.segmentsPerAxis ?? ROUND_SEGMENTS
            };
        }
        case 'DebugText':
            return {
                type: PrimitiveShapeExtraDataType.Text,
                text: shape.text ?? '',
                useRotation: shape.useRotation === true,
                backgroundColor:
                    shape.backgroundColorOverride === undefined ? undefined : argb(shape.backgroundColorOverride),
                lineGapHeight: shape.lineGapHeight ?? 0,
                depthTest: shape.depthTest === true,
                showBackface: shape.backfaceVisible !== false,
                showTextBackface: shape.textBackfaceVisible === true
            };
    }
};

/**
 * The packet entries for one flush's changes.
 * @param dimensionId - The wire's id of a dimension the level has, by its Bedrock name.
 */
export const primitiveShapes = (
    changes: readonly ScriptDebugShapeChange[],
    dimensionId: (name: string) => number | undefined
): PrimitiveShapeData[] =>
    changes.map(({ id, shape }) => {
        const networkId = BigInt(id);
        if (shape === undefined) {
            return new PrimitiveShapeData({ networkId, extraData: { type: PrimitiveShapeExtraDataType.None } });
        }
        return new PrimitiveShapeData({
            networkId,
            shapeType: SHAPE_TYPE[shape.kind],
            location: vec3(shape.location),
            scale: shape.scale,
            rotation: vec3(shape.rotation),
            // The client keeps a shape sent with 0, so a shape that stays sends none.
            totalTimeLeft: shape.timeLeft,
            maxRenderDistance: shape.maximumRenderDistance,
            color: argb(shape.color),
            dimensionId: shape.dimension === undefined ? undefined : dimensionId(shape.dimension),
            // A script's entity id is the entity's runtime id, which is its unique id too.
            attachedToEntityId: shape.attachedTo === undefined ? undefined : BigInt(shape.attachedTo),
            extraData: extraData(shape)
        });
    });
