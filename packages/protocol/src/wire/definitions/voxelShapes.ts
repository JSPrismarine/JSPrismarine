/**
 * The voxel collision shapes and name-to-handle map clients use to resolve block collision
 * geometry. Shapes without names remain addressable by their handles.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/voxel-shapes-packet/}
 */
import SerializableVoxelShape from '../../structure/SerializableVoxelShape';
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { VoxelShapeNameEntry } from '../../packet/VoxelShapesPacket';

/** One shape, bridged from the hand-written `SerializableVoxelShape`. */
const voxelShape = t.custom<SerializableVoxelShape>(
    'SerializableVoxelShape',
    (s, v) => v.serialize(s),
    (s) => {
        const shape = new SerializableVoxelShape();
        shape.deserialize(s);
        return shape;
    }
);

/** One `Name Map` entry: the `hashed_string` key as a plain string, then the handle as `lu16`. */
const voxelShapeNameEntry = t.custom<VoxelShapeNameEntry>(
    'VoxelShapeNameEntry',
    (s, v) => {
        t.string.write(s, v.name);
        t.lu16.write(s, v.handle);
    },
    (s) => ({ name: t.string.read(s), handle: t.lu16.read(s) })
);

/**
 * The `VoxelShapesPacket` field list: the server's voxel shape registry, the block collision
 * shapes both sides resolve by handle. Sent before `StartGamePacket` during every join.
 */
export const voxelShapesPacket = definePacket('VoxelShapesPacket', {
    /** `Shapes`: every shape of the registry, in handle order. */
    shapes: t.list(voxelShape),
    /** `Name Map`: the named shapes. A shape without a name is only reachable by handle. */
    nameMap: t.list(voxelShapeNameEntry),
    /** `Custom Shape Count`: how many shapes behavior packs added at world load. 0 without packs. */
    customShapeCount: t.lu16
});
