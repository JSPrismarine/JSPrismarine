/**
 * What a data-driven entity has to carry across a restart, and how it is stored.
 *
 * A {@link DataEntity} is a reference to an entity type plus state: the
 * component groups its events switched on, its property values, its live
 * attributes and the handful of body fields nothing else holds. None of that
 * is derivable from the type, so a mob saved without it comes back as a fresh
 * one: a sheared sheep grows its wool back, a tamed cat forgets its tricks and
 * a villager loses its profession.
 *
 * The record goes into the actor compound under one string tag as JSON, the
 * same choice `blockentity/contentRecord.ts` makes and for the same reason:
 * Bedrock publishes no schema for any of these fields, and inventing an NBT
 * width per field would lose the difference between 1 and 1.0 on the way back.
 * Every other tag of the actor compound is left where it is, so the `UniqueID`
 * a world was written with survives and the next save addresses the same actor.
 *
 * The attack target is deliberately not in the record. It is a runtime id,
 * which is drawn fresh each session and would resolve to whatever entity
 * happened to take the number. The owner is stored by stable player identity
 * and rebound to the new runtime id when that player returns. The goal-facing
 * `carried` field remains an identifier; `equipment` and `containerSlots`
 * retain complete item stacks and nested contents. A generated identity lets
 * spawned leash links reconnect when either actor is restored first.
 */
import type { AttributeName, EntityPosition, PropertyValue } from '@jsprismarine/entities';
import { ATTRIBUTES, noEffects } from '@jsprismarine/entities';
import type { NBTTagCompound } from '@jsprismarine/nbt';
import { Types } from '@jsprismarine/nbt';
import { randomUUID } from 'node:crypto';

import type { ContentItemDrop } from '../../content/world/adapter';
import { MOB_EQUIPMENT_SLOTS } from '../equipment';
import type { MobEquipmentSet, MobEquipmentSlot } from '../equipment';
import type { DataEntity } from './DataEntity';

/** The actor tag holding the whole record, as JSON. */
export const DATA_ENTITY_TAG = 'jsprismarine:entity';

/** Everything a saved data-driven entity needs back to be the same entity. */
export interface DataEntityRecord {
    /** The entity type, such as `minecraft:villager_v2`. */
    readonly identifier: string;
    /** Stable identity used to reconnect persistent relationships after a reload. */
    readonly persistentIdentity: string;
    /** Stable identity of the entity holding this entity's leash, when it has one. */
    readonly leashHolderIdentity?: string;
    /** The population pool the entity counts against, when a spawn rule produced it. */
    readonly pool?: string;
    /** The component groups active when it was saved, in the order they became active. */
    readonly componentGroups: readonly string[];
    /** Entity property name to its value. */
    readonly properties: Readonly<Record<string, PropertyValue>>;
    /** Attribute name to its current value; the bounds come back from the components. */
    readonly attributes: Readonly<Partial<Record<AttributeName, number>>>;
    readonly yaw: number;
    readonly pitch: number;
    /** Where `minecraft:home` or a `set_home_position` event pinned the entity. */
    readonly home?: EntityPosition;
    /** Stable identity of the player who tamed or launched this entity. */
    readonly ownerIdentity?: string;
    /** What the entity holds in its main hand. */
    readonly carried?: string;
    /** What it carries that is not in its hand, as item identifiers. */
    readonly inventory: readonly string[];
    /** Equipment slots modified after spawn, with each complete stack. */
    readonly equipment?: MobEquipmentSet;
    /** Inventory slots whose contents are also represented in a wearable slot. */
    readonly equipmentInventorySlots?: Partial<Record<MobEquipmentSlot, number>>;
    /** Slots in the `minecraft:inventory` container, empty slots represented by null. */
    readonly containerSlots?: readonly (ContentItemDrop | null)[];
    readonly sitting: boolean;
    readonly sleeping: boolean;
    readonly loveTicks: number;
    readonly breedCooldown: number;
    /** Remaining ticks on an active component-defined explosion fuse. */
    readonly fuseTicks?: number;
    /** Flight state for an entity carrying `minecraft:projectile`. */
    readonly projectile?: {
        readonly velocity: EntityPosition;
        readonly age: number;
        readonly stuck: boolean;
    };
    /** Entity-specific fields supplied by the source that spawned it. */
    readonly spawnData?: Readonly<Record<string, unknown>>;
}

/**
 * The record of one live entity, ready to be written.
 *
 * @param entity - The live entity whose state is being saved.
 * @param pool - The population pool it counts against, when it has one.
 * @param leashHolderIdentity - Stable identity of its leash holder, when it has one.
 */
export const dataEntityRecordOf = (
    entity: DataEntity,
    pool: string | undefined,
    leashHolderIdentity?: string
): DataEntityRecord => {
    const { body, instance } = entity;

    const properties: Record<string, PropertyValue> = {};
    for (const name of instance.properties.names()) {
        const value = instance.properties.get(name);
        if (value !== undefined) properties[name] = value;
    }

    const attributes: Partial<Record<AttributeName, number>> = {};
    for (const name of instance.attributes.names()) {
        const attribute = instance.attributes.get(name);
        if (attribute !== undefined) attributes[name] = attribute.current;
    }

    return {
        identifier: entity.identifier,
        persistentIdentity: entity.persistentIdentity,
        ...(leashHolderIdentity === undefined ? {} : { leashHolderIdentity }),
        ...(pool === undefined ? {} : { pool }),
        componentGroups: instance.activeComponentGroups(),
        properties,
        attributes,
        yaw: body.yaw,
        pitch: body.pitch,
        ...(body.home === undefined ? {} : { home: body.home }),
        ...(body.ownerIdentity === undefined ? {} : { ownerIdentity: body.ownerIdentity }),
        ...(body.carried === undefined ? {} : { carried: body.carried }),
        inventory: [...body.inventory],
        equipment: body.equipment,
        ...(Object.keys(body.equipmentInventorySlots).length === 0
            ? {}
            : { equipmentInventorySlots: { ...body.equipmentInventorySlots } }),
        containerSlots: body.containerSlots.map((item) => item ?? null),
        sitting: body.sitting,
        sleeping: body.sleeping,
        loveTicks: body.loveTicks,
        breedCooldown: body.breedCooldown,
        ...(body.fuseTicks === undefined ? {} : { fuseTicks: body.fuseTicks }),
        ...(instance.hasComponent('minecraft:projectile')
            ? {
                  projectile: {
                      velocity: { ...body.velocity },
                      age: body.projectileAge,
                      stuck: body.projectileStuck
                  }
              }
            : {}),
        ...(entity.spawnData === undefined ? {} : { spawnData: entity.spawnData })
    };
};

/** Writes a record into an actor compound, leaving every other tag alone. */
export const writeDataEntityRecord = (nbt: NBTTagCompound, record: DataEntityRecord): void => {
    nbt.addValue(DATA_ENTITY_TAG, new Types.StringVal(JSON.stringify(record)));
};

/** Whether a parsed value is a JSON object rather than an array or a primitive. */
const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const stringsOf = (value: unknown): readonly string[] =>
    Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

/** One saved item stack, after checking each field this runtime reads. */
const itemDropOf = (value: unknown): ContentItemDrop | undefined => {
    if (!isObject(value)) return undefined;
    const { identifier, count } = value;
    if (typeof identifier !== 'string' || identifier === '' || typeof count !== 'number' || !Number.isFinite(count))
        return undefined;

    let enchantments: Record<string, number> | undefined;
    if (isObject(value['enchantments'])) {
        enchantments = {};
        for (const [name, level] of Object.entries(value['enchantments'])) {
            if (typeof level === 'number' && Number.isFinite(level)) enchantments[name] = level;
        }
    }
    const lore = Array.isArray(value['lore'])
        ? value['lore'].filter((line): line is string => typeof line === 'string')
        : undefined;
    const contents = Array.isArray(value['contents'])
        ? value['contents'].map((item) => itemDropOf(item) ?? undefined)
        : undefined;

    return {
        identifier,
        count,
        ...(typeof value['meta'] === 'number' && Number.isFinite(value['meta']) ? { meta: value['meta'] } : {}),
        ...(typeof value['damage'] === 'number' && Number.isFinite(value['damage']) ? { damage: value['damage'] } : {}),
        ...(typeof value['customName'] === 'string' ? { customName: value['customName'] } : {}),
        ...(lore === undefined ? {} : { lore }),
        ...(enchantments === undefined ? {} : { enchantments }),
        ...(contents === undefined ? {} : { contents })
    };
};

/** Saved equipment, retaining only known slots and complete item stacks. */
const equipmentOf = (value: unknown): MobEquipmentSet | undefined => {
    if (!isObject(value)) return undefined;
    const equipment: Partial<Record<(typeof MOB_EQUIPMENT_SLOTS)[number], ContentItemDrop>> = {};
    for (const slot of MOB_EQUIPMENT_SLOTS) {
        const item = itemDropOf(value[slot]);
        if (item !== undefined) equipment[slot] = item;
    }
    return equipment;
};

/** Inventory slots whose held stacks also occupy one of the actor's equipment slots. */
const equipmentInventorySlotsOf = (value: unknown): Partial<Record<MobEquipmentSlot, number>> | undefined => {
    if (!isObject(value)) return undefined;
    const slots: Partial<Record<MobEquipmentSlot, number>> = {};
    for (const slot of MOB_EQUIPMENT_SLOTS) {
        const index = value[slot];
        if (typeof index === 'number' && Number.isSafeInteger(index) && index >= 0) slots[slot] = index;
    }
    return slots;
};

/** All saved container slots, preserving indices and treating invalid or absent stacks as empty. */
const containerSlotsOf = (value: unknown): readonly (ContentItemDrop | null)[] | undefined =>
    Array.isArray(value) ? value.map((item) => itemDropOf(item) ?? null) : undefined;

const numberOf = (value: unknown, fallback: number): number => (typeof value === 'number' ? value : fallback);

const positionOf = (value: unknown): EntityPosition | undefined => {
    if (!isObject(value)) return undefined;
    const { x, y, z } = value;
    if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return undefined;
    return { x, y, z };
};

/** Reads projectile motion from a legacy actor NBT compound. */
export const actorMotionIn = (nbt: NBTTagCompound): EntityPosition | undefined => {
    const list = nbt.getList('Motion', false);
    if (list === undefined || list === null) return undefined;

    const [x, y, z] = [...list].slice(0, 3).map((entry) => Number(entry?.getValue?.() ?? entry ?? Number.NaN));
    if (x === undefined || y === undefined || z === undefined || ![x, y, z].every(Number.isFinite)) return undefined;

    return { x, y, z };
};

/** Saved projectile flight state, after checking every field the runtime reads. */
const projectileOf = (value: unknown): DataEntityRecord['projectile'] | undefined => {
    if (!isObject(value)) return undefined;

    const velocity = positionOf(value['velocity']);
    if (velocity === undefined || ![velocity.x, velocity.y, velocity.z].every(Number.isFinite)) return undefined;

    const age = value['age'];
    return {
        velocity,
        age: typeof age === 'number' && Number.isFinite(age) ? Math.max(0, Math.trunc(age)) : 0,
        stuck: value['stuck'] === true
    };
};

const propertiesOf = (value: unknown): Record<string, PropertyValue> => {
    const properties: Record<string, PropertyValue> = {};
    if (!isObject(value)) return properties;

    for (const [name, written] of Object.entries(value)) {
        if (typeof written === 'number' || typeof written === 'boolean' || typeof written === 'string')
            properties[name] = written;
    }
    return properties;
};

const attributesOf = (value: unknown): Partial<Record<AttributeName, number>> => {
    const attributes: Partial<Record<AttributeName, number>> = {};
    if (!isObject(value)) return attributes;

    for (const name of ATTRIBUTES) {
        const written = value[name];
        if (typeof written === 'number') attributes[name] = written;
    }
    return attributes;
};

/**
 * The record an actor compound carries, or undefined when it carries none.
 *
 * Everything past the identifier is read defensively. The tag is this server's
 * own, but a world is full of records written by older versions of it, and a
 * mob that comes back with a default is better than a chunk that refuses to
 * load.
 *
 * @returns The record, or undefined when the tag is absent, unparseable or
 *   names no entity type, in which case the caller restores the actor the way
 *   it always did.
 */
export const dataEntityRecordIn = (nbt: NBTTagCompound): DataEntityRecord | undefined => {
    const encoded = nbt.getString(DATA_ENTITY_TAG, '');
    if (encoded === '') return undefined;

    let parsed: unknown;
    try {
        // Parsed JSON, which the compiler cannot see the shape of; every field
        // below is checked before it is read.
        parsed = JSON.parse(encoded);
    } catch {
        return undefined;
    }

    if (!isObject(parsed)) return undefined;
    const { identifier, pool, carried, ownerIdentity } = parsed;
    if (typeof identifier !== 'string' || identifier === '') return undefined;

    const persistentIdentity =
        typeof parsed['persistentIdentity'] === 'string' && parsed['persistentIdentity'] !== ''
            ? parsed['persistentIdentity']
            : randomUUID();
    const leashHolderIdentity =
        typeof parsed['leashHolderIdentity'] === 'string' && parsed['leashHolderIdentity'] !== ''
            ? parsed['leashHolderIdentity']
            : undefined;

    const home = positionOf(parsed['home']);
    const spawnData = isObject(parsed['spawnData']) ? parsed['spawnData'] : undefined;
    const equipment = equipmentOf(parsed['equipment']);
    const equipmentInventorySlots = equipmentInventorySlotsOf(parsed['equipmentInventorySlots']);
    const containerSlots = containerSlotsOf(parsed['containerSlots']);
    const projectile = projectileOf(parsed['projectile']);

    return {
        identifier,
        persistentIdentity,
        ...(leashHolderIdentity === undefined ? {} : { leashHolderIdentity }),
        ...(typeof pool === 'string' ? { pool } : {}),
        componentGroups: stringsOf(parsed['componentGroups']),
        properties: propertiesOf(parsed['properties']),
        attributes: attributesOf(parsed['attributes']),
        yaw: numberOf(parsed['yaw'], 0),
        pitch: numberOf(parsed['pitch'], 0),
        ...(home === undefined ? {} : { home }),
        ...(typeof ownerIdentity === 'string' ? { ownerIdentity } : {}),
        ...(typeof carried === 'string' ? { carried } : {}),
        inventory: stringsOf(parsed['inventory']),
        ...(equipment === undefined ? {} : { equipment }),
        ...(equipmentInventorySlots === undefined ? {} : { equipmentInventorySlots }),
        ...(containerSlots === undefined ? {} : { containerSlots }),
        sitting: parsed['sitting'] === true,
        sleeping: parsed['sleeping'] === true,
        loveTicks: numberOf(parsed['loveTicks'], 0),
        breedCooldown: numberOf(parsed['breedCooldown'], 0),
        ...(typeof parsed['fuseTicks'] === 'number' && Number.isFinite(parsed['fuseTicks'])
            ? { fuseTicks: Math.max(0, Math.trunc(parsed['fuseTicks'])) }
            : {}),
        ...(projectile === undefined ? {} : { projectile }),
        ...(spawnData === undefined ? {} : { spawnData })
    };
};

/**
 * Puts a record's state back onto a freshly built entity.
 *
 * The component groups go on first, because adding a group initializes its
 * components and a component that declares an attribute writes that attribute
 * back to its base. The saved values land after, so a cow restored at four
 * hearts stays at four hearts.
 */
export const applyDataEntityRecord = (entity: DataEntity, record: DataEntityRecord): void => {
    const { body, instance } = entity;

    if (record.componentGroups.length > 0) {
        instance.applyEffects({ ...noEffects(`${DATA_ENTITY_TAG}:restore`), addGroups: record.componentGroups });
    }

    for (const [name, value] of Object.entries(record.properties)) instance.properties.set(name, value);
    // Walked over the attribute names rather than the record's keys, so the name
    // reaching `set` is one of them rather than whatever string the file held.
    for (const name of ATTRIBUTES) {
        const value = record.attributes[name];
        if (value !== undefined) instance.attributes.set(name, value);
    }

    body.yaw = record.yaw;
    body.pitch = record.pitch;
    body.home = record.home;
    instance.setHomePosition(record.home);
    body.ownerIdentity = record.ownerIdentity;
    if (record.equipment === undefined) body.carried = record.carried;
    else {
        body.setEquipment(record.equipment);
        if (record.equipment.mainhand === undefined) body.carried = record.carried;
    }
    for (const slot of MOB_EQUIPMENT_SLOTS) delete body.equipmentInventorySlots[slot];
    Object.assign(body.equipmentInventorySlots, record.equipmentInventorySlots);
    body.inventory.splice(0, body.inventory.length, ...record.inventory);
    body.containerSlots.splice(
        0,
        body.containerSlots.length,
        ...(record.containerSlots ?? []).map((item) => item ?? undefined)
    );
    body.sitting = record.sitting;
    body.sleeping = record.sleeping;
    body.loveTicks = record.loveTicks;
    body.breedCooldown = record.breedCooldown;
    body.fuseTicks = record.fuseTicks;
    if (record.projectile !== undefined) {
        body.velocity = record.projectile.velocity;
        body.projectileAge = record.projectile.age;
        body.projectileStuck = record.projectile.stuck;
    }
};
