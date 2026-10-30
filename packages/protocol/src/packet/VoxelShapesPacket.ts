import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { voxelShapesPacket } from '../wire/definitions/voxelShapes';
import { protocolVersion } from '../wire/versions/v2193';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type SerializableVoxelShape from '../structure/SerializableVoxelShape';

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
 * The definition carries no version gate, so it resolves to the same frozen layout at every
 * protocol; the oldest supported version stands in for the packet class, which does not know
 * its session's protocol.
 */
const layout = () => layoutAt(voxelShapesPacket, protocolVersion);

/**
 * Hands the client the server's voxel shape registry: the block collision shapes both sides
 * resolve by handle. Mojang's packet notes say to send it before `StartGamePacket`, and a
 * vanilla server does so during every join.
 *
 * The wire layout is the `voxelShapesPacket` definition in `wire/definitions`.
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
        layout().encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): VoxelShapes {
        return layout().decode(stream);
    }
}
