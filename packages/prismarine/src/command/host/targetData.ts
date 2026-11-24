/**
 * The NBT form of a block or an entity, which `/data`, `execute if data`, `execute store` and
 * `/function … with` read and write by path.
 *
 * A command edits a compound, so each target is read into the compound Java Edition would show
 * for it and an edit is written back field by field. Java keeps every field an entity or a block
 * entity saves; this server shows the ones it models:
 *
 * - Every entity: `Pos`, `Motion`, `Rotation`, `OnGround`, `Fire`, `Invulnerable`,
 *   `PortalCooldown`, `CustomName` and `Tags`; a living one adds `Health` and `DeathTime`; one
 *   with item slots adds `equipment`, and a player adds `Inventory` and `SelectedItem`.
 * - A block entity: `x`, `y`, `z`, `id` and, for a container, `Items`.
 *
 * A write applies `Pos`, `Motion`, `Rotation`, `Fire`, `Invulnerable`, `CustomName`, `Tags` and
 * `Health` to an entity, and `Items` to a block entity. Other fields are read only, and a key
 * this server does not model is dropped, as Java drops a key an entity does not read. A player's
 * data cannot be written, as in Java.
 */
import type { DataTarget, SlotTarget } from '@jsprismarine/commands';
import type { NbtCompoundTag, NbtTag } from '@jsprismarine/nbt/tag';
import {
    byteTag,
    compoundTag,
    doubleTag,
    entryOf,
    floatTag,
    intTag,
    listTag,
    shortTag,
    stringTag,
    tagsEqual
} from '@jsprismarine/nbt/tag';

import type Server from '../../Server';
import type { StoreActor } from '../../entity/data/storeActors';
import { dropOfItem } from '../../inventory/persistence';
import type { Item } from '../../item/Item';
import { worldBlockEntities } from '../../world/contentAdapter';
import { blockContainerOf } from '../../inventory/blockContainers';
import { slotItemsOf } from './inventory';
import { containerSlotsOf, numberOf, stackTag, stacksTag, stringsOf } from './stackNbt';
import { blockPositionOf, refuse, resolveEntity, resolvePlayer, worldOf } from './support';

/** A block or an entity, which is every {@link DataTarget} but command storage. */
export type WorldDataTarget = Exclude<DataTarget, { readonly kind: 'storage' }>;

/** Reads and writes the compound of a block or an entity. */
export interface TargetDataAccess {
    /**
     * @throws {CommandSyntaxException} When the entity has gone, or the block is not a block entity.
     */
    read(target: WorldDataTarget): NbtCompoundTag;
    /**
     * Writes an edited compound back.
     *
     * @throws {CommandSyntaxException} When the target is a player, whose data Java refuses to write.
     */
    write(target: WorldDataTarget, compound: NbtCompoundTag): void;
}

/** The Java equipment keys, and the slot names that reach them. */
const EQUIPMENT_SLOTS = [
    ['mainhand', 'weapon.mainhand'],
    ['offhand', 'weapon.offhand'],
    ['feet', 'armor.feet'],
    ['legs', 'armor.legs'],
    ['chest', 'armor.chest'],
    ['head', 'armor.head'],
    ['body', 'armor.body']
] as const;

/** How many slots a player's `Inventory` lists: the hotbar and the three rows above it. */
const PLAYER_INVENTORY_SLOTS = 36;

/** A list of three or two numbers, as `Pos`, `Motion` and `Rotation` hold them. */
const numbersOf = (tag: NbtTag | undefined, length: number): readonly number[] | undefined => {
    if (tag?.type !== 'list' || tag.value.length !== length) return undefined;
    const numbers = tag.value.map(numberOf);
    return numbers.every((value) => value !== undefined && Number.isFinite(value))
        ? numbers.filter((value) => value !== undefined)
        : undefined;
};

/** An item as a stack tag, or undefined for an empty slot. */
const itemTag = (item: Item | null, slot?: number): NbtCompoundTag | undefined => {
    const drop = dropOfItem(item);
    return drop === undefined ? undefined : stackTag(drop, slot);
};

/** What Java's `Entity.saveWithoutId` shows of an entity, for the fields this server models. */
const entityCompound = (server: Server, target: Extract<SlotTarget, { kind: 'entity' }>, actor: StoreActor) => {
    const { body } = actor.entity;
    const position = actor.getPosition();
    const velocity = actor.getVelocity();
    const entries: [string, NbtTag][] = [
        ['Pos', listTag([doubleTag(position.getX()), doubleTag(actor.getFeetY()), doubleTag(position.getZ())])],
        ['Motion', listTag([doubleTag(velocity.getX()), doubleTag(velocity.getY()), doubleTag(velocity.getZ())])],
        ['Rotation', listTag([floatTag(actor.yaw), floatTag(actor.pitch)])],
        ['OnGround', byteTag(actor.isOnGround() ? 1 : 0)],
        ['Fire', shortTag(body.fireTicks)],
        ['Invulnerable', byteTag(body.invulnerable ? 1 : 0)],
        ['PortalCooldown', intTag(actor.getPortalCooldown())]
    ];
    if (body.nameTag !== undefined && body.nameTag.length > 0) entries.push(['CustomName', stringTag(body.nameTag)]);
    const tags = actor.getTags();
    if (tags.length > 0) entries.push(['Tags', listTag(tags.map(stringTag))]);

    if (actor.getMaxHealth() > 0) {
        entries.push(['Health', floatTag(actor.getHealth())], ['DeathTime', shortTag(body.deathTime)]);
    }

    const isPlayer = resolvePlayer(server, target.entity) !== undefined;
    const equipmentNames = EQUIPMENT_SLOTS.map(([, name]) => name);
    const held = slotItemsOf(server, target, isPlayer ? [...equipmentNames, 'container.*'] : equipmentNames);
    const equipment = EQUIPMENT_SLOTS.flatMap(([key], index): [string, NbtTag][] => {
        const stack = itemTag(held[index]?.[0] ?? null);
        return stack === undefined ? [] : [[key, stack]];
    });
    if (equipment.length > 0) entries.push(['equipment', compoundTag(equipment)]);

    if (isPlayer) {
        const inventory = held[EQUIPMENT_SLOTS.length] ?? [];
        const slots = inventory.slice(0, PLAYER_INVENTORY_SLOTS).flatMap((item, slot) => itemTag(item, slot) ?? []);
        entries.push(['Inventory', listTag(slots)]);
        const selected = equipment.find(([key]) => key === 'mainhand');
        if (selected !== undefined) entries.push(['SelectedItem', selected[1]]);
    }

    return compoundTag(entries);
};

/** Writes the fields of an edited entity compound that differ from what it was. */
const applyEntityCompound = (actor: StoreActor, before: NbtCompoundTag, after: NbtCompoundTag): void => {
    /** The field's new value, or undefined when the edit left it alone or removed it. */
    const changed = (key: string): NbtTag | undefined => {
        const next = entryOf(after.value, key);
        const previous = entryOf(before.value, key);
        return next === undefined || (previous !== undefined && tagsEqual(previous, next)) ? undefined : next;
    };
    const removed = (key: string): boolean =>
        entryOf(before.value, key) !== undefined && entryOf(after.value, key) === undefined;
    const { body } = actor.entity;

    const position = numbersOf(changed('Pos'), 3);
    if (position !== undefined) {
        const [x = 0, y = 0, z = 0] = position;
        body.teleportTo({ x, y, z });
    }
    const motion = numbersOf(changed('Motion'), 3);
    if (motion !== undefined) {
        const [x = 0, y = 0, z = 0] = motion;
        body.velocity = { x, y, z };
    }
    const rotation = numbersOf(changed('Rotation'), 2);
    if (rotation !== undefined) {
        const [yaw = 0, pitch = 0] = rotation;
        body.yaw = yaw;
        body.pitch = pitch;
    }

    const fire = numberOf(changed('Fire'));
    if (fire !== undefined) body.fireTicks = Math.trunc(fire);
    const invulnerable = numberOf(changed('Invulnerable'));
    if (invulnerable !== undefined) body.invulnerable = invulnerable !== 0;

    const name = changed('CustomName');
    if (name?.type === 'string') actor.setName(name.value);
    else if (removed('CustomName')) body.nameTag = undefined;

    if (changed('Tags') !== undefined || removed('Tags')) {
        const next = new Set(stringsOf(entryOf(after.value, 'Tags')) ?? []);
        for (const tag of actor.getTags()) if (!next.has(tag)) actor.removeTag(tag);
        for (const tag of next) actor.addTag(tag);
    }

    const health = numberOf(changed('Health'));
    if (health !== undefined && actor.getMaxHealth() > 0) {
        // Java's `LivingEntity.setHealth` clamps between nothing and the maximum.
        actor.entity.instance.attributes.set('health', Math.min(Math.max(health, 0), actor.getMaxHealth()));
    }
};

/** The block entity a target names, with what writes it back. */
const blockEntityAt = (server: Server, target: Extract<WorldDataTarget, { kind: 'block' }>) => {
    const world = worldOf(server, target.dimension);
    const at = blockPositionOf(target.position);
    const position = { x: at.getX(), y: at.getY(), z: at.getZ() };
    const store = worldBlockEntities(() => world);
    const record = store.at(position);
    if (record === undefined) refuse('The target block is not a block entity');
    const id = world.loadedBlockAt(position.x, position.y, position.z)?.name ?? 'minecraft:air';
    // The block type's slots, not the ones a record lists: a chest nobody filled has no `Items`.
    return { position, record, store, id, size: blockContainerOf(id)?.slots ?? 0 };
};

/**
 * Builds the NBT access for blocks and entities.
 *
 * @param server - The live server, read per call.
 */
export const targetDataAccess = (server: Server): TargetDataAccess => ({
    read: (target) => {
        if (target.kind === 'entity') {
            const actor = resolveEntity(server, target.entity);
            if (actor === undefined) refuse('No entity was found');
            return entityCompound(server, target, actor);
        }

        const { position, record, id, size } = blockEntityAt(server, target);
        const entries: [string, NbtTag][] = [
            ['x', intTag(position.x)],
            ['y', intTag(position.y)],
            ['z', intTag(position.z)],
            ['id', stringTag(id)]
        ];
        if (size > 0) entries.push(['Items', stacksTag(record.items ?? [])]);
        return compoundTag(entries);
    },

    write: (target, compound) => {
        if (target.kind === 'entity') {
            if (resolvePlayer(server, target.entity) !== undefined) refuse('Unable to modify player data');
            const actor = resolveEntity(server, target.entity);
            if (actor === undefined) refuse('No entity was found');
            applyEntityCompound(actor, entityCompound(server, target, actor), compound);
            return;
        }

        const { position, record, store, size } = blockEntityAt(server, target);
        // Only a container's stacks can be written; `x`, `y`, `z` and `id` are where and what the
        // block is, which Java puts back after a merge too.
        if (size === 0) return;
        const items = containerSlotsOf(entryOf(compound.value, 'Items'), record.items ?? [], size);
        // `capacity` goes with the items, because a comparator divides by it.
        store.put(position, { ...record, items, capacity: size });
    }
});
