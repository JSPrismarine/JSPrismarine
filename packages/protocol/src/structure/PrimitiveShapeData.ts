import type { Dimension } from '@jsprismarine/minecraft';
import type { NetworkBinaryStream } from '../';
import NetworkStructure from '../NetworkStructure';
import Vec2 from './Vec2';
import Vec3 from './Vec3';

/**
 * A `ScriptModuleMinecraft::ScriptPrimitiveShapeType`, the `Shape Type` byte of a debug shape.
 * The values are the ones the wire carries.
 */
export enum PrimitiveShapeType {
    Line = 0,
    Box = 1,
    Sphere = 2,
    Circle = 3,
    Text = 4,
    Arrow = 5,
    Cylinder = 6,
    Pyramid = 7,
    Ellipsoid = 8,
    Cone = 9
}

/**
 * Which alternative of `Extra Shape Data` a shape carries. The value is the alternative's index
 * in the schema's `oneOf`, written as the varuint32 selector. It is not a
 * {@link PrimitiveShapeType}: `Line` is shape type 0 but extra data alternative 4, and
 * `Circle` has no extra data of its own (it uses `SphereDataPayload`).
 */
export enum PrimitiveShapeExtraDataType {
    /** The `null` alternative: no extra data. A shape with no `Shape Type` and no extra data is a removal. */
    None = 0,
    Arrow = 1,
    Text = 2,
    Box = 3,
    Line = 4,
    Sphere = 5,
    Cylinder = 6,
    Pyramid = 7,
    Ellipsoid = 8,
    Cone = 9
}

/**
 * The `Extra Shape Data` variant of a debug shape. `type` picks the alternative and its fields.
 * Colors are ARGB packed as `0xAARRGGBB` in an unsigned 32-bit integer.
 */
export type PrimitiveShapeExtraData =
    | { type: PrimitiveShapeExtraDataType.None }
    | {
          type: PrimitiveShapeExtraDataType.Arrow;
          /** `Arrow End Location`. */
          endLocation?: Vec3;
          /** `Arrow Head Length`. */
          headLength?: number;
          /** `Arrow Head Radius`. */
          headRadius?: number;
          /** `Num Segments` of the arrow head, one byte. */
          segments?: number;
      }
    | {
          type: PrimitiveShapeExtraDataType.Text;
          /** `Text` to draw. */
          text: string;
          /** `UseRotation`: face the shape's `Rotation` instead of the camera. */
          useRotation: boolean;
          /** `BackgroundColor` behind the text. The client picks a translucent black when absent. */
          backgroundColor?: number;
          /** `LineGapHeight` between lines of multiline text. */
          lineGapHeight: number;
          /** `DepthTest`: let blocks hide the text, as signs do, instead of showing through them like a nametag. */
          depthTest: boolean;
          /** `ShowBackface` of the background. */
          showBackface: boolean;
          /** `ShowTextBackface` of the text. */
          showTextBackface: boolean;
      }
    | {
          type: PrimitiveShapeExtraDataType.Box;
          /** `Box Bound`, the box's extent. */
          bound: Vec3;
      }
    | {
          type: PrimitiveShapeExtraDataType.Line;
          /** `Line End Location`. */
          endLocation: Vec3;
      }
    | {
          type: PrimitiveShapeExtraDataType.Sphere;
          /** `Num Segments` of the circle or sphere, one byte. */
          segments: number;
      }
    | {
          type: PrimitiveShapeExtraDataType.Cylinder;
          /** `Radius X`. */
          radiusX: Vec2;
          /** `Radius Z`. */
          radiusZ: Vec2;
          /** `Height`. */
          height: number;
          /** `Num Segments`, one byte. */
          segments: number;
      }
    | {
          type: PrimitiveShapeExtraDataType.Pyramid;
          /** `Width` of the base along X. */
          width: number;
          /** `Depth` of the base along Z. The client uses `Width` when absent. */
          depth?: number;
          /** `Height`. */
          height: number;
      }
    | {
          type: PrimitiveShapeExtraDataType.Ellipsoid;
          /** `Radii` along X, Y and Z. */
          radii: Vec3;
          /** `Segments Per Axis`, one byte. */
          segmentsPerAxis: number;
      }
    | {
          type: PrimitiveShapeExtraDataType.Cone;
          /** `Radii` of the base along X and Z. */
          radii: Vec2;
          /** `Height`. */
          height: number;
          /** `Num Segments`, one byte. */
          segments: number;
      };

/** The fields of a `PrimitiveShapeDataPayload`, in wire order. Absent optionals leave the client's current value alone. */
export interface PrimitiveShapeDataFields {
    /** `NetworkId` that pairs the shape on the server with the one on the client. */
    networkId: bigint;
    /** `Shape Type`. A shape sent without one is removed on the client. */
    shapeType?: PrimitiveShapeType;
    /** `Location` in the world. */
    location?: Vec3;
    /** `Scale`. */
    scale?: number;
    /** `Rotation` as Euler angles in radians, pitch then yaw then roll. */
    rotation?: Vec3;
    /** `Total Time Left` in seconds until the client removes the shape; 0 keeps it. */
    totalTimeLeft?: number;
    /** `Maximum Render Distance` from the camera. */
    maxRenderDistance?: number;
    /** `Color` as ARGB packed `0xAARRGGBB` in an unsigned 32-bit integer. */
    color?: number;
    /** `Dimension ID` the shape renders in. */
    dimensionId?: Dimension;
    /** `Attached To Entity ID`, the `ActorUniqueID` of the entity the shape follows. */
    attachedToEntityId?: bigint;
    /** `Extra Shape Data` for the shape's type. */
    extraData: PrimitiveShapeExtraData;
}

/**
 * One debug shape of a `PrimitiveShapesPacket`: a new shape, an update to one the client
 * already draws, or a removal.
 *
 * Protocol 2193 wire order: `NetworkId` as a varuint64, then `Shape Type` (one byte),
 * `Location` (Vec3), `Scale` (float), `Rotation` (Vec3), `Total Time Left` (float),
 * `Maximum Render Distance` (float), `Color` (little-endian int32 ARGB), `Dimension ID`
 * (ZigZag varint32) and `Attached To Entity ID` (ZigZag varint64), each an optional with a
 * presence byte before the value. Last comes `Extra Shape Data` as a Cereal tagged variant:
 * a varuint32 selector (the {@link PrimitiveShapeExtraDataType} value) then the
 * alternative's fields. The arrow's four fields, the text's `BackgroundColor` and the
 * pyramid's `Depth` are optionals too; every other alternative field is written bare.
 *
 * The 1.26.51 schema lists `Dimension ID` and the arrow fields as required and only marks
 * them optional at protocol 2207. gophertunnel and Cloudburst have written the presence byte
 * for them at every protocol since the packet appeared, including their 2193 codecs, so this
 * class does the same.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/primitive-shape-data-payload/}
 */
export default class PrimitiveShapeData extends NetworkStructure implements PrimitiveShapeDataFields {
    public networkId: bigint;
    public shapeType?: PrimitiveShapeType;
    public location?: Vec3;
    public scale?: number;
    public rotation?: Vec3;
    public totalTimeLeft?: number;
    public maxRenderDistance?: number;
    public color?: number;
    public dimensionId?: Dimension;
    public attachedToEntityId?: bigint;
    public extraData: PrimitiveShapeExtraData;

    /**
     * Creates a shape entry. The default is a removal of shape 0: no type, no extra data.
     * @param fields - The shape's fields; absent optionals are not written.
     */
    public constructor(
        fields: PrimitiveShapeDataFields = { networkId: 0n, extraData: { type: PrimitiveShapeExtraDataType.None } }
    ) {
        super();
        this.networkId = fields.networkId;
        this.shapeType = fields.shapeType;
        this.location = fields.location;
        this.scale = fields.scale;
        this.rotation = fields.rotation;
        this.totalTimeLeft = fields.totalTimeLeft;
        this.maxRenderDistance = fields.maxRenderDistance;
        this.color = fields.color;
        this.dimensionId = fields.dimensionId;
        this.attachedToEntityId = fields.attachedToEntityId;
        this.extraData = fields.extraData;
    }

    private static writeOptional<T>(
        stream: NetworkBinaryStream,
        value: T | undefined,
        write: (value: T) => void
    ): void {
        stream.writeBoolean(value !== undefined);
        if (value !== undefined) write(value);
    }

    private static readOptional<T>(stream: NetworkBinaryStream, read: () => T): T | undefined {
        return stream.readBoolean() ? read() : undefined;
    }

    private static writeExtraData(stream: NetworkBinaryStream, data: PrimitiveShapeExtraData): void {
        stream.writeUnsignedVarInt(data.type);

        switch (data.type) {
            case PrimitiveShapeExtraDataType.None:
                break;
            case PrimitiveShapeExtraDataType.Arrow:
                PrimitiveShapeData.writeOptional(stream, data.endLocation, (v) => v.serialize(stream));
                PrimitiveShapeData.writeOptional(stream, data.headLength, (v) => stream.writeFloatLE(v));
                PrimitiveShapeData.writeOptional(stream, data.headRadius, (v) => stream.writeFloatLE(v));
                PrimitiveShapeData.writeOptional(stream, data.segments, (v) => stream.writeByte(v));
                break;
            case PrimitiveShapeExtraDataType.Text:
                stream.writeString(data.text);
                stream.writeBoolean(data.useRotation);
                PrimitiveShapeData.writeOptional(stream, data.backgroundColor, (v) => stream.writeUnsignedIntLE(v));
                stream.writeFloatLE(data.lineGapHeight);
                stream.writeBoolean(data.depthTest);
                stream.writeBoolean(data.showBackface);
                stream.writeBoolean(data.showTextBackface);
                break;
            case PrimitiveShapeExtraDataType.Box:
                data.bound.serialize(stream);
                break;
            case PrimitiveShapeExtraDataType.Line:
                data.endLocation.serialize(stream);
                break;
            case PrimitiveShapeExtraDataType.Sphere:
                stream.writeByte(data.segments);
                break;
            case PrimitiveShapeExtraDataType.Cylinder:
                data.radiusX.serialize(stream);
                data.radiusZ.serialize(stream);
                stream.writeFloatLE(data.height);
                stream.writeByte(data.segments);
                break;
            case PrimitiveShapeExtraDataType.Pyramid:
                stream.writeFloatLE(data.width);
                PrimitiveShapeData.writeOptional(stream, data.depth, (v) => stream.writeFloatLE(v));
                stream.writeFloatLE(data.height);
                break;
            case PrimitiveShapeExtraDataType.Ellipsoid:
                data.radii.serialize(stream);
                stream.writeByte(data.segmentsPerAxis);
                break;
            case PrimitiveShapeExtraDataType.Cone:
                data.radii.serialize(stream);
                stream.writeFloatLE(data.height);
                stream.writeByte(data.segments);
                break;
        }
    }

    private static readExtraData(stream: NetworkBinaryStream): PrimitiveShapeExtraData {
        const type = stream.readUnsignedVarInt();

        switch (type) {
            case PrimitiveShapeExtraDataType.None:
                return { type };
            case PrimitiveShapeExtraDataType.Arrow:
                return {
                    type,
                    endLocation: PrimitiveShapeData.readOptional(stream, () => Vec3.deserialize(stream)),
                    headLength: PrimitiveShapeData.readOptional(stream, () => stream.readFloatLE()),
                    headRadius: PrimitiveShapeData.readOptional(stream, () => stream.readFloatLE()),
                    segments: PrimitiveShapeData.readOptional(stream, () => stream.readByte())
                };
            case PrimitiveShapeExtraDataType.Text:
                return {
                    type,
                    text: stream.readString(),
                    useRotation: stream.readBoolean(),
                    backgroundColor: PrimitiveShapeData.readOptional(stream, () => stream.readUnsignedIntLE()),
                    lineGapHeight: stream.readFloatLE(),
                    depthTest: stream.readBoolean(),
                    showBackface: stream.readBoolean(),
                    showTextBackface: stream.readBoolean()
                };
            case PrimitiveShapeExtraDataType.Box:
                return { type, bound: Vec3.deserialize(stream) };
            case PrimitiveShapeExtraDataType.Line:
                return { type, endLocation: Vec3.deserialize(stream) };
            case PrimitiveShapeExtraDataType.Sphere:
                return { type, segments: stream.readByte() };
            case PrimitiveShapeExtraDataType.Cylinder:
                return {
                    type,
                    radiusX: Vec2.deserialize(stream),
                    radiusZ: Vec2.deserialize(stream),
                    height: stream.readFloatLE(),
                    segments: stream.readByte()
                };
            case PrimitiveShapeExtraDataType.Pyramid:
                return {
                    type,
                    width: stream.readFloatLE(),
                    depth: PrimitiveShapeData.readOptional(stream, () => stream.readFloatLE()),
                    height: stream.readFloatLE()
                };
            case PrimitiveShapeExtraDataType.Ellipsoid:
                return { type, radii: Vec3.deserialize(stream), segmentsPerAxis: stream.readByte() };
            case PrimitiveShapeExtraDataType.Cone:
                return {
                    type,
                    radii: Vec2.deserialize(stream),
                    height: stream.readFloatLE(),
                    segments: stream.readByte()
                };
            default:
                throw new Error(`Unknown primitive shape extra data alternative ${type}`);
        }
    }

    public serialize(stream: NetworkBinaryStream): void {
        stream.writeUnsignedVarLong(this.networkId);
        PrimitiveShapeData.writeOptional(stream, this.shapeType, (v) => stream.writeByte(v));
        PrimitiveShapeData.writeOptional(stream, this.location, (v) => v.serialize(stream));
        PrimitiveShapeData.writeOptional(stream, this.scale, (v) => stream.writeFloatLE(v));
        PrimitiveShapeData.writeOptional(stream, this.rotation, (v) => v.serialize(stream));
        PrimitiveShapeData.writeOptional(stream, this.totalTimeLeft, (v) => stream.writeFloatLE(v));
        PrimitiveShapeData.writeOptional(stream, this.maxRenderDistance, (v) => stream.writeFloatLE(v));
        PrimitiveShapeData.writeOptional(stream, this.color, (v) => stream.writeUnsignedIntLE(v));
        PrimitiveShapeData.writeOptional(stream, this.dimensionId, (v) => stream.writeVarInt(v));
        PrimitiveShapeData.writeOptional(stream, this.attachedToEntityId, (v) => stream.writeVarLong(v));
        PrimitiveShapeData.writeExtraData(stream, this.extraData);
    }

    /**
     * Reads a shape entry.
     * @throws when the `Extra Shape Data` selector names none of the ten alternatives.
     */
    public deserialize(stream: NetworkBinaryStream): void {
        this.networkId = stream.readUnsignedVarLong();
        this.shapeType = PrimitiveShapeData.readOptional(stream, () => stream.readByte());
        this.location = PrimitiveShapeData.readOptional(stream, () => Vec3.deserialize(stream));
        this.scale = PrimitiveShapeData.readOptional(stream, () => stream.readFloatLE());
        this.rotation = PrimitiveShapeData.readOptional(stream, () => Vec3.deserialize(stream));
        this.totalTimeLeft = PrimitiveShapeData.readOptional(stream, () => stream.readFloatLE());
        this.maxRenderDistance = PrimitiveShapeData.readOptional(stream, () => stream.readFloatLE());
        this.color = PrimitiveShapeData.readOptional(stream, () => stream.readUnsignedIntLE());
        this.dimensionId = PrimitiveShapeData.readOptional(stream, () => stream.readVarInt());
        this.attachedToEntityId = PrimitiveShapeData.readOptional(stream, () => stream.readVarLong());
        this.extraData = PrimitiveShapeData.readExtraData(stream);
    }
}
