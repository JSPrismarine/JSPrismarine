import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import SerializableVoxelShape from '../structure/SerializableVoxelShape';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** One entry of the `Name Map`: a shape name and the handle of its shape. */
export interface VoxelShapeNameEntry {
    /** The `key`, a `hashed_string` shape name such as "minecraft:unit_cube". */
    name: string;
    /** The `value`, a `VoxelShapes::RegistryHandle`: the index of the shape in `Shapes`. */
    handle: number;
}

/** The fields of a `VoxelShapesPacket`, in wire order. */
export interface VoxelShapes {
    /** `Shapes`, every shape of the registry, in handle order. */
    shapes: SerializableVoxelShape[];
    /** `Name Map`, the named shapes. A shape without a name is only reachable by handle. */
    nameMap: VoxelShapeNameEntry[];
    /** `Custom Shape Count`, how many of the shapes behavior packs added at world load. 0 without packs. */
    customShapeCount: number;
}

/**
 * Hands the client the server's voxel shape registry: the block collision shapes both sides
 * resolve by handle. Mojang's packet notes say to send it before `StartGamePacket`, and a
 * vanilla server does so during every join.
 *
 * Protocol 2193 layout, in wire order: `Shapes` as a varuint32 count followed by one
 * {@link SerializableVoxelShape} per shape, `Name Map` as a varuint32 count followed by one
 * {@link VoxelShapeNameEntry} per name (the `hashed_string` written as a plain string, then
 * the handle as a little-endian uint16), then `Custom Shape Count` as a little-endian uint16.
 *
 * `packages/bedrock-data/src/resources/voxel_shapes.json` holds the vanilla registry in this
 * layout: `shapes` is the `Shapes` list in handle order, 287 entries at 1.26.50, and `names`
 * is the `Name Map` as an object from name to handle, 220 entries. The file records no custom
 * shape count. A server that sends the vanilla registry unchanged builds `shapes` from
 * `shapes`, `nameMap` from `Object.entries(names)` and sets `customShapeCount` to 0.
 */
export default class VoxelShapesPacket extends NetworkPacket<VoxelShapes> {
    public get id(): number {
        return PacketIdentifier.VOXEL_SHAPES;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: VoxelShapes): void {
        stream.writeUnsignedVarInt(data.shapes.length);
        for (const shape of data.shapes) {
            shape.serialize(stream);
        }

        stream.writeUnsignedVarInt(data.nameMap.length);
        for (const entry of data.nameMap) {
            stream.writeString(entry.name);
            stream.writeUnsignedShortLE(entry.handle);
        }

        stream.writeUnsignedShortLE(data.customShapeCount);
    }

    protected deserializePayload(stream: NetworkBinaryStream): VoxelShapes {
        const shapes: SerializableVoxelShape[] = [];
        let count = stream.readUnsignedVarInt();
        while (count-- > 0) {
            shapes.push(SerializableVoxelShape.deserialize(stream));
        }

        const nameMap: VoxelShapeNameEntry[] = [];
        count = stream.readUnsignedVarInt();
        while (count-- > 0) {
            nameMap.push({ name: stream.readString(), handle: stream.readUnsignedShortLE() });
        }

        const customShapeCount = stream.readUnsignedShortLE();

        return { shapes, nameMap, customShapeCount };
    }
}
