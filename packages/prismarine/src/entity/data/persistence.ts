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
 * and rebound to the new runtime id when that player returns. A carried item
 * is an identifier rather than a stack, because that is all the goal seam
 * models; when it grows a stack, this record should write it through
 * `inventory/itemNbt.ts` rather than encode one here.
 */
import type { AttributeName, EntityPosition, PropertyValue } from '@jsprismarine/entities';
import { ATTRIBUTES, noEffects } from '@jsprismarine/entities';
import type { NBTTagCompound } from '@jsprismarine/nbt';
import { Types } from '@jsprismarine/nbt';

import type { DataEntity } from './DataEntity';

/** The actor tag holding the whole record, as JSON. */
export const DATA_ENTITY_TAG = 'jsprismarine:entity';

/** Everything a saved data-driven entity needs back to be the same entity. */
export interface DataEntityRecord {
    /** The entity type, such as `minecraft:villager_v2`. */
    readonly identifier: string;
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
    readonly sitting: boolean;
    readonly sleeping: boolean;
    readonly loveTicks: number;
    readonly breedCooldown: number;
    /** Remaining ticks on an active component-defined explosion fuse. */
    readonly fuseTicks?: number;
    /** Entity-specific fields supplied by the source that spawned it. */
    readonly spawnData?: Readonly<Record<string, unknown>>;
}

/** The record of one live entity, ready to be written. */
export const dataEntityRecordOf = (entity: DataEntity, pool: string | undefined): DataEntityRecord => {
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
        sitting: body.sitting,
        sleeping: body.sleeping,
        loveTicks: body.loveTicks,
        breedCooldown: body.breedCooldown,
        ...(body.fuseTicks === undefined ? {} : { fuseTicks: body.fuseTicks }),
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

const numberOf = (value: unknown, fallback: number): number => (typeof value === 'number' ? value : fallback);

const positionOf = (value: unknown): EntityPosition | undefined => {
    if (!isObject(value)) return undefined;
    const { x, y, z } = value;
    if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return undefined;
    return { x, y, z };
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

    const home = positionOf(parsed['home']);
    const spawnData = isObject(parsed['spawnData']) ? parsed['spawnData'] : undefined;

    return {
        identifier,
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
        sitting: parsed['sitting'] === true,
        sleeping: parsed['sleeping'] === true,
        loveTicks: numberOf(parsed['loveTicks'], 0),
        breedCooldown: numberOf(parsed['breedCooldown'], 0),
        ...(typeof parsed['fuseTicks'] === 'number' && Number.isFinite(parsed['fuseTicks'])
            ? { fuseTicks: Math.max(0, Math.trunc(parsed['fuseTicks'])) }
            : {}),
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
    body.carried = record.carried;
    body.inventory.splice(0, body.inventory.length, ...record.inventory);
    body.sitting = record.sitting;
    body.sleeping = record.sleeping;
    body.loveTicks = record.loveTicks;
    body.breedCooldown = record.breedCooldown;
    body.fuseTicks = record.fuseTicks;
};
