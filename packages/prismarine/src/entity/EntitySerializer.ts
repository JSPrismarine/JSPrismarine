import { Vector3 } from '@jsprismarine/math';
import { NBTTagCompound, Types } from '@jsprismarine/nbt';

import { isStoredItemStack } from '../inventory/persistence';
import type { StoredItemStack } from '../inventory/persistence';
import { writtenEntities } from './Entities';
import type { Entity } from './Entity';
import { GenericEntity } from './GenericEntity';
import { ItemActorBody } from './data/itemBodies';
import type { ItemStart } from './data/droppedItems';
import { DEFAULT_FUSE_TICKS } from './fuse';
import { MetadataFlag } from '@jsprismarine/protocol/wire/structures/Metadata';
import type { StatusEffect } from './StatusEffect';
import { bedrockMobEffectIdentifier, bedrockMobEffectId } from './StatusEffect';
import type { DataEntityRecord } from './data/persistence';
import { dataEntityRecordIn, writeDataEntityRecord } from './data/persistence';
import { Position } from '../world/Position';
import type { World } from '../world/World';

const TNT_IDENTIFIER = 'minecraft:tnt';

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
const REWRITTEN = [
    'identifier',
    'Pos',
    'Rotation',
    'Tags',
    'JSPFuse',
    'Fuse',
    'fuse',
    'PortalCooldown',
    'DimensionId'
] as const;

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

        // A dropped stack comes back as a generic body carrying its record, which the world hands
        // to the store; see `LiveEntityRuntime.restoreItem`.
        const entity = modeled ? new modeled(options) : new GenericEntity({ identifier, ...options });

        if (identifier === TNT_IDENTIFIER) {
            const fuse = nbt.getNumber('JSPFuse', nbt.getNumber('Fuse', nbt.getNumber('fuse', DEFAULT_FUSE_TICKS)));
            entity.metadata.setInt(MetadataFlag.FUSE_TIME, fuse);
            entity.metadata.setIgnited(true);
        }

        for (const tag of stringsIn(nbt, 'Tags')) entity.addTag(tag);
        for (const effect of activeEffectsIn(nbt)) entity.addStatusEffect(effect, false);
        entity.setPortalCooldown(nbt.getNumber('PortalCooldown', 0));

        entity.persistentNbt = remainder(nbt);
        return entity;
    }

    /**
     * Writes an entity's actor NBT.
     * @param entity - The entity.
     * @param record - A data-driven entity's record, written into the copy rather than onto the
     *   entity, as a save that called `LiveEntityRuntime.persist` first would hold it.
     */
    public static toNBT(entity: Entity, record?: DataEntityRecord): NBTTagCompound {
        const nbt = entity.persistentNbt ? copy(entity.persistentNbt) : new NBTTagCompound('');
        if (record !== undefined) writeDataEntityRecord(nbt, record);
        const position = entity.getPosition();

        nbt.addValue('identifier', new Types.StringVal(entity.getType()));
        nbt.addValue('Pos', floats([position.getX(), position.getY(), position.getZ()]));
        nbt.addValue('Rotation', floats([entity.yaw, entity.pitch]));
        // Both are Bedrock's own tags. The dimension is the world's, not a stored value: an
        // entity is in exactly the dimension of the world that holds it.
        nbt.addValue('PortalCooldown', new Types.NumberVal(entity.getPortalCooldown()));
        nbt.addValue('DimensionId', new Types.NumberVal(entity.getWorld().getDimension().bedrockId));
        const tags = entity.getTags();
        if (tags.length > 0) nbt.addValue('Tags', new Set(tags.map((tag) => new Types.StringVal(tag))));
        else nbt.remove('Tags');

        const activeEffects = entity.getStatusEffects().map(statusEffectNbt);
        const unknownEffects = [...(nbt.getList('ActiveEffects', false) ?? [])].filter(
            (effect): effect is NBTTagCompound =>
                effect instanceof NBTTagCompound && bedrockMobEffectIdentifier(effect.getByte('Id', -1)) === undefined
        );
        const allEffects = [...unknownEffects, ...activeEffects];
        if (allEffects.length > 0) nbt.addValue('ActiveEffects', new Set(allEffects));
        else nbt.remove('ActiveEffects');

        if (entity instanceof ItemActorBody) {
            const saved = entity.savedItem();
            nbt.addValue('Age', new Types.ShortVal(saved?.age ?? 0));
            nbt.addValue('PickupDelay', new Types.ShortVal(saved?.pickupDelay ?? 0));
            const motion = saved?.motion ?? Vector3.ZERO;
            nbt.addValue('Motion', doubles([motion.getX(), motion.getY(), motion.getZ()]));
            const stack = saved?.stack ?? null;
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

        if (entity instanceof GenericEntity) {
            const projectile = dataEntityRecordIn(nbt)?.projectile;
            if (projectile !== undefined) {
                const { velocity } = projectile;
                nbt.addValue('Motion', doubles([velocity.x, velocity.y, velocity.z]));
            }
        }

        if (entity.getType() === TNT_IDENTIFIER) {
            const fuse = entity.metadata.getPropertyValue(MetadataFlag.FUSE_TIME);
            if (typeof fuse === 'number') nbt.addValue('JSPFuse', new Types.NumberVal(fuse));
        }

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

/**
 * What a dropped stack's actor record holds beside the fields every actor has, or undefined when
 * it holds no stack. A record without `PickupDelay` takes the definition's.
 * @param nbt - The actor record.
 */
export const storedItemActorOf = (nbt: NBTTagCompound): ItemStart | undefined => {
    const stack = itemStackFrom(nbt);
    if (stack === null) return undefined;
    const [x, y, z] = readFloats(nbt, 'Motion', 3);
    return {
        stack,
        age: nbt.getShort('Age', 0),
        ...(nbt.has('PickupDelay') ? { pickupDelay: nbt.getShort('PickupDelay', 0) } : {}),
        motion: { x: x ?? 0, y: y ?? 0, z: z ?? 0 }
    };
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

/** Whether a JSON value has named fields. */
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

/** Reads the string tags on a saved actor, skipping values of any other NBT type. */
const stringsIn = (nbt: NBTTagCompound, key: string): string[] => {
    const values = nbt.getList(key, false);
    if (values === null) return [];

    const strings: string[] = [];
    for (const value of values) {
        if (value instanceof Types.StringVal) strings.push(value.getValue());
    }
    return strings;
};

/** Reads the supported active effects from a stored actor, leaving unknown entries opaque. */
const activeEffectsIn = (nbt: NBTTagCompound): StatusEffect[] => {
    const effects: StatusEffect[] = [];
    for (const value of nbt.getList('ActiveEffects', false) ?? []) {
        if (!(value instanceof NBTTagCompound)) continue;
        const id = bedrockMobEffectIdentifier(value.getByte('Id', -1));
        if (id === undefined) continue;
        effects.push({
            id,
            amplifier: value.getByte('Amplifier', 0) & 0xff,
            durationTicks: value.getNumber('Duration', 0),
            ambient: value.getByte('Ambient', 0) !== 0,
            showParticles: value.getByte('ShowParticles', 1) !== 0,
            showIcon: value.getByte('ShowIcon', 1) !== 0
        });
    }
    return effects;
};

/** Writes the fields Bedrock stores for one active status effect. */
const statusEffectNbt = (effect: StatusEffect): NBTTagCompound => {
    const id = bedrockMobEffectId(effect.id);
    if (id === undefined) throw new Error(`Cannot serialize unsupported mob effect '${effect.id}'`);

    const entry = new NBTTagCompound('');
    entry.addValue('Id', new Types.ByteVal(id));
    entry.addValue('Amplifier', new Types.ByteVal(effect.amplifier));
    entry.addValue('Duration', new Types.NumberVal(effect.durationTicks));
    entry.addValue('Ambient', new Types.ByteVal(effect.ambient ? 1 : 0));
    entry.addValue('ShowParticles', new Types.ByteVal(effect.showParticles ? 1 : 0));
    entry.addValue('ShowIcon', new Types.ByteVal(effect.showIcon ? 1 : 0));
    return entry;
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
