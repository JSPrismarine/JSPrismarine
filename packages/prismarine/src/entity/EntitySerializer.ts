import { NBTTagCompound, Types } from '@jsprismarine/nbt';

import { spawnableEntities } from './Entities';
import type { Entity, SpawnableEntityClass } from './Entity';
import { GenericEntity } from './GenericEntity';
import { Position } from '../world/Position';
import type { World } from '../world/World';

/**
 * Reads and writes the actor NBT a Bedrock world stores.
 *
 * Same rule as the block entities: the fields the server models are lifted out, and every other
 * tag is kept on {@link Entity.persistentNbt} and written back untouched. `definitions` is the one
 * that makes this mandatory rather than tidy - it names the behavior pack component groups the
 * actor was assembled from, and an actor saved without it comes back broken.
 */

/**
 * The tags this class rewrites, and therefore the only ones taken out of the remainder.
 *
 * Deliberately short. A field the server merely supplies a default for - `Fire`, `Air`, `OnGround`
 * - must *not* be listed: stripping it and then defaulting it would quietly replace a burning
 * actor's `Fire: -20` with a zero on the next save.
 */
const REWRITTEN = ['identifier', 'Pos', 'Rotation'] as const;

export class EntitySerializer {
    private static index: Map<string, SpawnableEntityClass> | null = null;

    /**
     * The classes an identifier can be restored as. Only those a position alone can build: a
     * falling block needs the block it is made of, which the actor NBT does not carry, so it loads
     * as a {@link GenericEntity} like any other unmodeled actor.
     */
    private static classes(): Map<string, SpawnableEntityClass> {
        if (this.index !== null) return this.index;

        this.index = new Map();
        for (const candidate of spawnableEntities()) {
            this.index.set(candidate.MOB_ID, candidate);
        }

        return this.index;
    }

    /**
     * Builds an entity from its stored NBT.
     *
     * An identifier with no class behind it becomes a {@link GenericEntity} carrying that
     * identifier, so an unmodeled mob still loads and still renders as itself.
     */
    public static fromNBT(nbt: NBTTagCompound, world: World): Entity {
        const identifier = nbt.getString('identifier', '');
        const [x, y, z] = readFloats(nbt, 'Pos', 3);
        const [yaw, pitch] = readFloats(nbt, 'Rotation', 2);

        const position = new Position(x ?? 0, y ?? 0, z ?? 0, world);
        const modeled = this.classes().get(identifier);

        const entity = modeled
            ? new modeled({ position, pitch: pitch ?? 0, yaw: yaw ?? 0, headYaw: yaw ?? 0 })
            : new GenericEntity({ identifier, position, pitch: pitch ?? 0, yaw: yaw ?? 0, headYaw: yaw ?? 0 });

        entity.persistentNbt = remainder(nbt);
        return entity;
    }

    public static toNBT(entity: Entity): NBTTagCompound {
        const nbt = entity.persistentNbt ? copy(entity.persistentNbt) : new NBTTagCompound('');
        const position = entity.getPosition();

        nbt.addValue('identifier', new Types.StringVal(entity.getType()));
        nbt.addValue('Pos', floats([position.getX(), position.getY(), position.getZ()]));
        nbt.addValue('Rotation', floats([entity.yaw, entity.pitch]));

        // Left as they were found when the entity came from disk, and given sane values when it
        // did not - the server does not model any of these yet, and inventing them would be worse
        // than carrying forward what the file said.
        if (!nbt.has('OnGround')) nbt.addValue('OnGround', new Types.ByteVal(1));
        if (!nbt.has('FallDistance')) nbt.addValue('FallDistance', new Types.FloatVal(0));
        if (!nbt.has('Fire')) nbt.addValue('Fire', new Types.ShortVal(0));
        if (!nbt.has('Air')) nbt.addValue('Air', new Types.ShortVal(300));
        if (!nbt.has('Invulnerable')) nbt.addValue('Invulnerable', new Types.ByteVal(0));

        return nbt;
    }

    /** Whether the server has a class for an identifier, as opposed to merely preserving it. */
    public static isModeled(identifier: string): boolean {
        return this.classes().has(identifier);
    }

    public static reset(): void {
        this.index = null;
    }
}

/** Everything except the tags {@link EntitySerializer} writes back itself. */
const remainder = (nbt: NBTTagCompound): NBTTagCompound => {
    const kept = copy(nbt);
    for (const key of REWRITTEN) kept.remove(key);

    return kept;
};

const copy = (nbt: NBTTagCompound): NBTTagCompound => {
    const result = new NBTTagCompound(nbt.getName() ?? '');
    for (const [key, value] of nbt.entries()) result.children.set(key, value);

    return result;
};

const readFloats = (nbt: NBTTagCompound, key: string, count: number): number[] => {
    const list = nbt.getList(key, false);
    if (!list) return Array.from({ length: count }, () => 0);

    return [...list].slice(0, count).map((entry) => Number(entry?.getValue?.() ?? entry ?? 0));
};

/**
 * A TAG_List of floats.
 *
 * Wrapped values rather than bare numbers, which also means three equal coordinates stay three
 * entries - a Set of primitives would collapse `[0, 0, 0]` to one.
 */
const floats = (values: number[]): Set<Types.FloatVal> => new Set(values.map((value) => new Types.FloatVal(value)));

export default EntitySerializer;
