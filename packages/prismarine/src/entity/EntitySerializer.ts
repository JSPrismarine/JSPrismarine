import { NBTTagCompound, Types } from '@jsprismarine/nbt';

import * as Entities from './Entities';
import type { Entity } from './Entity';
import { GenericEntity } from './GenericEntity';
import { Position } from '../world/Position';
import type { World } from '../world/World';

/**
 * Reads and writes the actor NBT a Bedrock world stores.
 *
 * Same rule as the block entities: the fields the server models are lifted out, and every other
 * tag is kept on {@link Entity.persistentNbt} and written back untouched. `definitions` is the one
 * that makes this mandatory rather than tidy - it names the behaviour pack component groups the
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

interface EntityClass {
    MOB_ID?: string;
    new (options: { position: Position; pitch?: number; yaw?: number; headYaw?: number }): Entity;
}

export class EntitySerializer {
    private static index: Map<string, EntityClass> | null = null;

    private static classes(): Map<string, EntityClass> {
        if (this.index !== null) return this.index;

        this.index = new Map();
        for (const candidate of Object.values(Entities)) {
            if (typeof candidate !== 'function') continue;

            const identifier = (candidate as unknown as EntityClass).MOB_ID;
            if (typeof identifier === 'string') this.index.set(identifier, candidate as unknown as EntityClass);
        }

        return this.index;
    }

    /**
     * Builds an entity from its stored NBT.
     *
     * An identifier with no class behind it becomes a {@link GenericEntity} carrying that
     * identifier, so an unmodelled mob still loads and still renders as itself.
     */
    public static fromNBT(nbt: NBTTagCompound, world: World): Entity {
        const identifier = nbt.getString('identifier', '');
        const [x, y, z] = readFloats(nbt, 'Pos', 3);
        const [yaw, pitch] = readFloats(nbt, 'Rotation', 2);

        const position = new Position(x ?? 0, y ?? 0, z ?? 0, world);
        const modelled = this.classes().get(identifier);

        const entity = modelled
            ? new modelled({ position, pitch: pitch ?? 0, yaw: yaw ?? 0, headYaw: yaw ?? 0 })
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
    public static isModelled(identifier: string): boolean {
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
