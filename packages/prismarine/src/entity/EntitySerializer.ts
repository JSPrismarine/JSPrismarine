import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { Vector3 } from '@jsprismarine/math';

import ContainerEntry from '../inventory/ContainerEntry';
import { restoredItem, storedItem } from '../inventory/persistence';
import type { StoredItemStack } from '../inventory/persistence';
import { writtenEntities } from './Entities';
import type { Entity } from './Entity';
import { GenericEntity } from './GenericEntity';
import FallingBlock from './other/FallingBlock';
import { Item } from './other/Item';
import { Projectile } from './other/Projectile';
import Tnt, { DEFAULT_FUSE_TICKS } from './other/Tnt';
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
const REWRITTEN = ['identifier', 'Pos', 'Rotation', 'JSPBlockName', 'JSPFuse'] as const;

export class EntitySerializer {
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
        const modeled = writtenEntities().get(identifier);
        const options = { position, pitch: pitch ?? 0, yaw: yaw ?? 0, headYaw: yaw ?? 0 };
        const blockName = nbt.getString('JSPBlockName', nbt.getString('Block', ''));

        const entity =
            identifier === Item.MOB_ID
                ? new Item({
                      ...options,
                      age: nbt.getShort('Age', 0),
                      ...itemEntryFrom(nbt, world)
                  })
                : identifier === FallingBlock.MOB_ID && blockName.length > 0
                  ? new FallingBlock({ ...options, blockName })
                  : identifier === Tnt.MOB_ID
                    ? new Tnt({
                          ...options,
                          fuse: nbt.getNumber(
                              'JSPFuse',
                              nbt.getNumber('Fuse', nbt.getNumber('fuse', DEFAULT_FUSE_TICKS))
                          )
                      })
                    : modeled
                      ? new modeled(options)
                      : new GenericEntity({ identifier, ...options });

        if (entity instanceof Projectile) {
            const motion = projectileMotionOf(nbt);
            if (motion !== undefined) entity.setVelocity(motion);
        }

        entity.persistentNbt = remainder(nbt);
        return entity;
    }

    public static toNBT(entity: Entity): NBTTagCompound {
        const nbt = entity.persistentNbt ? copy(entity.persistentNbt) : new NBTTagCompound('');
        const position = entity.getPosition();

        nbt.addValue('identifier', new Types.StringVal(entity.getType()));
        nbt.addValue('Pos', floats([position.getX(), position.getY(), position.getZ()]));
        nbt.addValue('Rotation', floats([entity.yaw, entity.pitch]));

        if (entity instanceof Item) {
            nbt.addValue('Age', new Types.ShortVal(entity.getAge()));
            const entry = entity.getItem();
            const stack = entry === undefined ? null : storedItem(entry.getItem(), entry.getCount());
            if (stack === null) {
                nbt.remove('Item');
            } else {
                const itemNbt = new NBTTagCompound('Item');
                itemNbt.addValue('Name', new Types.StringVal(stack.name));
                itemNbt.addValue('Count', new Types.ByteVal(stack.count));
                itemNbt.addValue('Damage', new Types.ShortVal(stack.meta ?? 0));
                itemNbt.addValue('JSPStack', new Types.StringVal(JSON.stringify(stack)));
                nbt.addValue('Item', itemNbt);
            }
        }

        if (entity instanceof Projectile) {
            const velocity = entity.getVelocity();
            nbt.addValue('Motion', doubles([velocity.getX(), velocity.getY(), velocity.getZ()]));
        }

        if (entity instanceof FallingBlock) nbt.addValue('JSPBlockName', new Types.StringVal(entity.getBlockName()));
        if (entity instanceof Tnt) nbt.addValue('JSPFuse', new Types.NumberVal(entity.getFuse()));

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
}

/** Restores the stack in an item actor, including this server's item components. */
const itemEntryFrom = (nbt: NBTTagCompound, world: World): { item?: ContainerEntry } => {
    const stack = restoredItem(itemStackFrom(nbt), world.getServer().getContent());
    return stack === null ? {} : { item: new ContainerEntry({ item: stack, count: stack.getAmount() }) };
};

/** Reads the dropped stack from this server's saved form or the basic Bedrock item fields. */
const itemStackFrom = (nbt: NBTTagCompound): StoredItemStack | null => {
    const item = nbt.getCompound('Item', false);
    if (item === null) return null;

    const encoded = item.getString('JSPStack', '');
    if (encoded.length > 0) {
        try {
            const parsed: unknown = JSON.parse(encoded);
            if (isStoredItemStack(parsed)) return parsed;
        } catch {
            // An invalid server extension does not hide a stack's standard item name and count.
        }
    }

    const name = item.getString('Name', '');
    const count = item.getByte('Count', 0);
    if (name.length === 0 || count <= 0) return null;

    return { name, count, meta: item.getShort('Damage', 0) };
};

/** Checks JSON read from actor NBT before giving it to the inventory restore path. */
const isStoredItemStack = (value: unknown): value is StoredItemStack => {
    if (!isRecord(value)) return false;
    if (typeof value.name !== 'string' || typeof value.count !== 'number' || !Number.isInteger(value.count))
        return false;
    if (value.meta !== undefined && typeof value.meta !== 'number') return false;
    if (value.damage !== undefined && typeof value.damage !== 'number') return false;
    if (value.customName !== undefined && typeof value.customName !== 'string') return false;
    if (
        value.lore !== undefined &&
        (!Array.isArray(value.lore) || !value.lore.every((line) => typeof line === 'string'))
    )
        return false;
    if (value.enchantments !== undefined) {
        if (!isRecord(value.enchantments)) return false;
        if (!Object.values(value.enchantments).every((level) => typeof level === 'number')) return false;
    }
    if (value.contents !== undefined) {
        if (!Array.isArray(value.contents) || !value.contents.every((slot) => slot === null || isStoredItemStack(slot)))
            return false;
    }

    return value.name.length > 0 && value.count > 0;
};

/** Whether a JSON value has named fields. */
const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

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

/** Reads a projectile's three saved velocity components, or leaves its default alone. */
const projectileMotionOf = (nbt: NBTTagCompound): Vector3 | undefined => {
    const list = nbt.getList('Motion', false);
    if (list === undefined || list === null) return undefined;

    const [x, y, z] = [...list].slice(0, 3).map((entry) => Number(entry?.getValue?.() ?? entry ?? Number.NaN));
    if (x === undefined || y === undefined || z === undefined || ![x, y, z].every(Number.isFinite)) return undefined;

    return new Vector3(x, y, z);
};

/**
 * A TAG_List of floats.
 *
 * Wrapped values rather than bare numbers, which also means three equal coordinates stay three
 * entries - a Set of primitives would collapse `[0, 0, 0]` to one.
 */
const floats = (values: number[]): Set<Types.FloatVal> => new Set(values.map((value) => new Types.FloatVal(value)));

/** A TAG_List of doubles, used by actor NBT for projectile motion. */
const doubles = (values: number[]): Set<Types.DoubleVal> => new Set(values.map((value) => new Types.DoubleVal(value)));

export default EntitySerializer;
