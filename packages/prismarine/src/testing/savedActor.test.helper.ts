/**
 * An actor record as a save without the data-driven runtime wrote it: an identifier, a position
 * and a rotation, and no data entity record. `EntitySerializer.fromNBT` reads it as any saved
 * actor, which is how a test brings back a mob saved before its type ran in the store.
 */
import type { EntityPosition } from '@jsprismarine/entities';
import { NBTTagCompound, Types } from '@jsprismarine/nbt';

/**
 * @param identifier - The saved type, such as `minecraft:zombie`.
 * @param at - Where the actor stood.
 * @param rotation - Its yaw and pitch.
 */
export const savedActorNbt = (
    identifier: string,
    at: EntityPosition,
    rotation: { readonly yaw: number; readonly pitch: number } = { yaw: 0, pitch: 0 }
): NBTTagCompound => {
    const nbt = new NBTTagCompound('');
    nbt.addValue('identifier', new Types.StringVal(identifier));
    nbt.addValue('Pos', new Set([at.x, at.y, at.z].map((value) => new Types.FloatVal(value))));
    nbt.addValue('Rotation', new Set([rotation.yaw, rotation.pitch].map((value) => new Types.FloatVal(value))));
    return nbt;
};
