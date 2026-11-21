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
 * and rebound to the new runtime id when that player returns. `equipment` and
 * `containerSlots` hold complete item stacks and nested contents, written from
 * the body's inventory. A record written before the body had one may also hold
 * `carried`, an identifier for the main hand, and `inventory`, a list of
 * identifiers with no counts; both load into the inventory. A generated
 * identity lets spawned leash links reconnect when either actor is restored
 * first.
 */
import type { AttributeName, EntityPosition, PropertyValue } from '@jsprismarine/entities';
import { ATTRIBUTES, noEffects } from '@jsprismarine/entities';
import type { ComponentStateSnapshot } from '@jsprismarine/entities/componentState';
import { NBTTagCompound } from '@jsprismarine/nbt';
import { merchantSnapshotIn } from '@jsprismarine/trading';
import type { MerchantSnapshot } from '@jsprismarine/trading';
import { Types } from '@jsprismarine/nbt';
import { randomUUID } from 'node:crypto';

import type { ContentItemDrop } from '../../content/world/adapter';
import type { ServerContent } from '../../content/ServerContent';
import type { EntityInventory } from '../../inventory/EntityInventory';
import { dropOfItem, itemOfDrop } from '../../inventory/persistence';
import { MOB_EQUIPMENT_SLOTS } from '../equipment';
import type { MobEquipmentSet, MobEquipmentSlot } from '../equipment';
import type { DataEntity } from './DataEntity';
import { numberOf } from './numberOf';

/** The actor tag holding the whole record, as JSON. */
export const DATA_ENTITY_TAG = 'jsprismarine:entity';

/** Everything a saved data-driven entity needs back to be the same entity. */
export interface DataEntityRecord {
    /** The entity type, such as `minecraft:villager_v2`. */
    readonly identifier: string;
    /** Stable identity used to reconnect persistent relationships after a reload. */
    readonly persistentIdentity: string;
    /** Stable identity of the entity or player holding this entity's leash, when it has one. */
    readonly leashHolderIdentity?: string;
    /** The population pool the entity counts against, when a spawn rule produced it. */
    readonly pool?: string;
    /** The component groups active when it was saved, in the order they became active. */
    readonly componentGroups: readonly string[];
    /** Entity property name to its value. */
    readonly properties: Readonly<Record<string, PropertyValue>>;
    /**
     * The state each active component keeps between ticks, such as a timer or an air supply, by
     * component name, with `null` for a component that holds none. A record written before this
     * field existed leaves it out, and its components keep the state they initialize with.
     *
     * Saved as `ComponentStates.snapshot` gives it, and read back as the file holds it: restoring
     * checks each value against its component and reports one that does not fit, which it could
     * not do for an entry the reader had already dropped.
     */
    readonly componentState?: ComponentStateSnapshot | Readonly<Record<string, unknown>>;
    /** Attribute name to its current value; the bounds come back from the components. */
    readonly attributes: Readonly<Partial<Record<AttributeName, number>>>;
    readonly yaw: number;
    readonly pitch: number;
    /** Custom name set through an accepted name tag. */
    readonly nameTag?: string;
    /** Palette color set through an accepted dye. */
    readonly color?: number;
    /** Where `minecraft:home` or a `set_home_position` event pinned the entity. */
    readonly home?: EntityPosition;
    /** Stable identity of the player who tamed or launched this entity. */
    readonly ownerIdentity?: string;
    /** The player who cured this villager of being a zombie villager. */
    readonly curedBy?: string;
    /**
     * The main hand as an item identifier, which a record written before `equipment` held the
     * main hand carries. It loads only when `equipment` has no main hand.
     */
    readonly carried?: string;
    /**
     * Items carried outside the hand, one identifier per item, which a record written before
     * `containerSlots` held them carries. They load into the `inventory` container.
     */
    readonly inventory?: readonly string[];
    /**
     * What each equipment slot holds, with each complete stack. A slot an alias reads through
     * `equipmentInventorySlots` holds the same stack as its container slot.
     */
    readonly equipment?: MobEquipmentSet;
    /** The equipment slots read through a container slot, such as a horse's armor, by container index. */
    readonly equipmentInventorySlots?: Partial<Record<MobEquipmentSlot, number>>;
    /** Slots in the `minecraft:inventory` container, empty slots represented by null. */
    readonly containerSlots?: readonly (ContentItemDrop | null)[];
    readonly sitting: boolean;
    readonly sleeping: boolean;
    readonly loveTicks: number;
    readonly breedCooldown: number;
    /** The block an end crystal's beam points at. */
    readonly beamTarget?: EntityPosition;
    /** Whether an end crystal draws its base plate; absent keeps the default, true. */
    readonly showBottom?: boolean;
    /** Whether a mob that picks up by chance rolled that it may, Java's `CanPickUpLoot`. */
    readonly canPickUpLoot?: boolean;
    /** Whether the entity refuses all damage, as the respawn sequence's crystals do. */
    readonly invulnerable?: boolean;
    /** Remaining ticks on an active component-defined explosion fuse. */
    readonly fuseTicks?: number;
    /** Remaining ticks an entity stays on fire. */
    readonly fireTicks?: number;
    /** Ticks since a living entity died, Java's `DeathTime`, for one saved during its death. */
    readonly deathTime?: number;
    /** Flight state for an entity carrying `minecraft:projectile`. */
    readonly projectile?: {
        readonly velocity: EntityPosition;
        readonly age: number;
        readonly stuck: boolean;
    };
    /** A trader's offers, their uses and demand, and its experience, so a restart does not redraw them. */
    readonly merchant?: MerchantSnapshot;
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
    leashHolderIdentity?: string,
    merchant?: MerchantSnapshot
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

    const componentState = instance.componentState.snapshot();

    return {
        identifier: entity.identifier,
        persistentIdentity: entity.persistentIdentity,
        ...(leashHolderIdentity === undefined ? {} : { leashHolderIdentity }),
        ...(pool === undefined ? {} : { pool }),
        componentGroups: instance.activeComponentGroups(),
        properties,
        ...(Object.keys(componentState).length === 0 ? {} : { componentState }),
        attributes,
        yaw: body.yaw,
        pitch: body.pitch,
        ...(body.nameTag === undefined ? {} : { nameTag: body.nameTag }),
        ...(body.color === undefined ? {} : { color: body.color }),
        ...(body.home === undefined ? {} : { home: body.home }),
        ...(body.ownerIdentity === undefined ? {} : { ownerIdentity: body.ownerIdentity }),
        ...(body.curedBy === undefined ? {} : { curedBy: body.curedBy }),
        equipment: equipmentDropsOf(body.inventory),
        ...(body.equipmentInventorySlots.size === 0
            ? {}
            : { equipmentInventorySlots: Object.fromEntries(body.equipmentInventorySlots) }),
        containerSlots: body.inventory
            .container('inventory')
            .items()
            .map((item) => dropOfItem(item) ?? null),
        sitting: body.sitting,
        sleeping: body.sleeping,
        loveTicks: body.loveTicks,
        breedCooldown: body.breedCooldown,
        ...(body.beamTarget === undefined ? {} : { beamTarget: { ...body.beamTarget } }),
        ...(body.showBottom === undefined ? {} : { showBottom: body.showBottom }),
        ...(body.canPickUpLoot === undefined ? {} : { canPickUpLoot: body.canPickUpLoot }),
        ...(body.invulnerable ? { invulnerable: true } : {}),
        ...(body.fuseTicks === undefined ? {} : { fuseTicks: body.fuseTicks }),
        ...(body.fireTicks <= 0 ? {} : { fireTicks: body.fireTicks }),
        ...(body.deathTime <= 0 ? {} : { deathTime: body.deathTime }),
        ...(instance.hasComponent('minecraft:projectile')
            ? {
                  projectile: {
                      velocity: { ...body.velocity },
                      age: body.projectileAge,
                      stuck: body.projectileStuck
                  }
              }
            : {}),
        ...(merchant === undefined ? {} : { merchant }),
        ...(entity.spawnData === undefined ? {} : { spawnData: entity.spawnData })
    };
};

/** What each equipment slot of an inventory holds, as drops, with an empty slot left out. */
export const equipmentDropsOf = (inventory: Pick<EntityInventory, 'equipment'>): MobEquipmentSet => {
    const equipment: Partial<Record<MobEquipmentSlot, ContentItemDrop>> = {};
    for (const slot of MOB_EQUIPMENT_SLOTS) {
        const drop = dropOfItem(inventory.equipment(slot));
        if (drop !== undefined) equipment[slot] = drop;
    }
    return equipment;
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
export const savedDropOf = (value: unknown): ContentItemDrop | undefined => {
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
        ? value['contents'].map((item) => savedDropOf(item) ?? undefined)
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
        const item = savedDropOf(value[slot]);
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
    Array.isArray(value) ? value.map((item) => savedDropOf(item) ?? null) : undefined;

/** A saved position, when the value holds three numbers under `x`, `y` and `z`. */
export const positionOf = (value: unknown): EntityPosition | undefined => {
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

/**
 * The health an actor record's `Attributes` list holds, Bedrock's `minecraft:health` entry and its
 * `Current` value, as Bedrock Dedicated Server writes every mob's.
 * @returns The health, or undefined when the record lists none.
 */
export const actorHealthIn = (nbt: NBTTagCompound): number | undefined => {
    const list = nbt.getList('Attributes', false);
    if (list === undefined || list === null) return undefined;

    for (const entry of list) {
        if (!(entry instanceof NBTTagCompound) || entry.getString('Name', '') !== 'minecraft:health') continue;
        const current = entry.getFloat('Current', Number.NaN);
        return Number.isFinite(current) ? current : undefined;
    }
    return undefined;
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

/** Saved component state, by component name, each value as the file holds it. */
const componentStateOf = (value: unknown): Readonly<Record<string, unknown>> | undefined =>
    isObject(value) ? value : undefined;

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

    return dataEntityRecordFrom(parsed);
};

/**
 * The record a parsed value holds, such as the JSON of the actor tag or the copy a change log
 * membership entry carries, checked field by field as {@link dataEntityRecordIn} checks it.
 *
 * @returns The record, or undefined when the value is not an object naming an entity type.
 */
export const dataEntityRecordFrom = (parsed: unknown): DataEntityRecord | undefined => {
    if (!isObject(parsed)) return undefined;
    const { identifier, pool, carried, ownerIdentity, curedBy } = parsed;
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
    const beamTarget = positionOf(parsed['beamTarget']);
    const spawnData = isObject(parsed['spawnData']) ? parsed['spawnData'] : undefined;
    const equipment = equipmentOf(parsed['equipment']);
    const equipmentInventorySlots = equipmentInventorySlotsOf(parsed['equipmentInventorySlots']);
    const containerSlots = containerSlotsOf(parsed['containerSlots']);
    const projectile = projectileOf(parsed['projectile']);
    const merchant = merchantSnapshotIn(parsed['merchant']);
    const componentState = componentStateOf(parsed['componentState']);
    const legacyInventory = stringsOf(parsed['inventory']);

    return {
        identifier,
        persistentIdentity,
        ...(leashHolderIdentity === undefined ? {} : { leashHolderIdentity }),
        ...(typeof pool === 'string' ? { pool } : {}),
        componentGroups: stringsOf(parsed['componentGroups']),
        properties: propertiesOf(parsed['properties']),
        ...(componentState === undefined ? {} : { componentState }),
        attributes: attributesOf(parsed['attributes']),
        yaw: numberOf(parsed['yaw'], 0),
        pitch: numberOf(parsed['pitch'], 0),
        ...(typeof parsed['nameTag'] === 'string' ? { nameTag: parsed['nameTag'] } : {}),
        ...(typeof parsed['color'] === 'number' && Number.isInteger(parsed['color']) ? { color: parsed['color'] } : {}),
        ...(home === undefined ? {} : { home }),
        ...(typeof ownerIdentity === 'string' ? { ownerIdentity } : {}),
        ...(typeof curedBy === 'string' ? { curedBy } : {}),
        ...(typeof carried === 'string' ? { carried } : {}),
        ...(legacyInventory.length === 0 ? {} : { inventory: legacyInventory }),
        ...(equipment === undefined ? {} : { equipment }),
        ...(equipmentInventorySlots === undefined ? {} : { equipmentInventorySlots }),
        ...(containerSlots === undefined ? {} : { containerSlots }),
        sitting: parsed['sitting'] === true,
        sleeping: parsed['sleeping'] === true,
        loveTicks: numberOf(parsed['loveTicks'], 0),
        breedCooldown: numberOf(parsed['breedCooldown'], 0),
        ...(beamTarget === undefined ? {} : { beamTarget }),
        ...(typeof parsed['showBottom'] === 'boolean' ? { showBottom: parsed['showBottom'] } : {}),
        ...(typeof parsed['canPickUpLoot'] === 'boolean' ? { canPickUpLoot: parsed['canPickUpLoot'] } : {}),
        ...(parsed['invulnerable'] === true ? { invulnerable: true } : {}),
        ...(typeof parsed['fuseTicks'] === 'number' && Number.isFinite(parsed['fuseTicks'])
            ? { fuseTicks: Math.max(0, Math.trunc(parsed['fuseTicks'])) }
            : {}),
        ...(typeof parsed['fireTicks'] === 'number' && Number.isFinite(parsed['fireTicks'])
            ? { fireTicks: Math.max(0, Math.trunc(parsed['fireTicks'])) }
            : {}),
        ...(typeof parsed['deathTime'] === 'number' && Number.isFinite(parsed['deathTime'])
            ? { deathTime: Math.max(0, Math.trunc(parsed['deathTime'])) }
            : {}),
        ...(projectile === undefined ? {} : { projectile }),
        ...(merchant === undefined ? {} : { merchant }),
        ...(spawnData === undefined ? {} : { spawnData })
    };
};

/**
 * Puts a record's state back onto a freshly built entity.
 *
 * The component groups go on first, because adding a group initializes its
 * components and a component that declares an attribute writes that attribute
 * back to its base. The saved values land after, so a cow restored at four
 * hearts stays at four hearts, and a mob saved mid-timer resumes the timer.
 *
 * The `inventory` container keeps the size the caller gave it unless the record holds more than
 * fits, in which case it grows to hold all of it. The caller's next resize to the size the
 * components decide hands back what does not fit, so nothing a record holds is lost.
 *
 * @param content - The content build, which decides each restored item's maximum durability.
 */
export const applyDataEntityRecord = (entity: DataEntity, record: DataEntityRecord, content?: ServerContent): void => {
    const { body, instance } = entity;

    if (record.componentGroups.length > 0) {
        instance.applyEffects({ ...noEffects(`${DATA_ENTITY_TAG}:restore`), addGroups: record.componentGroups });
    }

    for (const [name, value] of Object.entries(record.properties)) instance.properties.set(name, value);
    if (record.componentState !== undefined) {
        for (const component of instance.componentState.restore(record.componentState))
            instance.report(`the saved state of ${component} does not fit the component, so it starts afresh`);
    }
    // Walked over the attribute names rather than the record's keys, so the name
    // reaching `set` is one of them rather than whatever string the file held.
    for (const name of ATTRIBUTES) {
        const value = record.attributes[name];
        if (value !== undefined) instance.attributes.set(name, value);
    }

    body.yaw = record.yaw;
    body.pitch = record.pitch;
    body.nameTag = record.nameTag;
    body.color = record.color;
    body.home = record.home;
    instance.setHomePosition(record.home);
    body.ownerIdentity = record.ownerIdentity;
    body.curedBy = record.curedBy;
    restoreCarried(entity, record, content);
    body.sitting = record.sitting;
    body.sleeping = record.sleeping;
    body.loveTicks = record.loveTicks;
    body.breedCooldown = record.breedCooldown;
    body.beamTarget = record.beamTarget;
    body.showBottom = record.showBottom;
    body.canPickUpLoot = record.canPickUpLoot;
    body.invulnerable = record.invulnerable === true;
    body.fuseTicks = record.fuseTicks;
    body.fireTicks = record.fireTicks ?? 0;
    body.deathTime = record.deathTime ?? 0;
    if (body.fireTicks > 0) body.conditions.add('on_fire');
    else body.conditions.delete('on_fire');
    if (record.projectile !== undefined) {
        body.velocity = record.projectile.velocity;
        body.projectileAge = record.projectile.age;
        body.projectileStuck = record.projectile.stuck;
    }
};

/**
 * Puts what a record says the entity holds, wears and carries into its inventory.
 *
 * The container slots go first, then the aliases that point equipment slots at them, then the
 * equipment slots no alias reads. A legacy `carried` fills the main hand only when `equipment`
 * holds none, and the legacy identifier list goes into the container after its slots.
 */
const restoreCarried = (entity: DataEntity, record: DataEntityRecord, content: ServerContent | undefined): void => {
    const { body } = entity;
    const itemOf = (drop: ContentItemDrop) => itemOfDrop(drop, content);
    const container = body.inventory.container('inventory');

    const slots = record.containerSlots ?? [];
    if (slots.length > container.size) body.setContainerCapacity(slots.length);
    for (const [slot, drop] of slots.entries()) container.set(slot, drop === null ? null : itemOf(drop));
    for (const identifier of record.inventory ?? []) {
        const item = itemOf({ identifier, count: 1 });
        if (item === null) continue;
        if (container.room(item) <= 0) body.setContainerCapacity(container.size + 1);
        container.add(item);
    }

    body.equipmentInventorySlots.clear();
    for (const slot of MOB_EQUIPMENT_SLOTS) {
        const index = record.equipmentInventorySlots?.[slot];
        if (index !== undefined) body.equipmentInventorySlots.set(slot, index);
    }

    for (const slot of MOB_EQUIPMENT_SLOTS) {
        if (body.equipmentInventorySlots.has(slot)) continue;
        const drop = record.equipment?.[slot];
        body.inventory.setEquipment(slot, drop === undefined ? null : itemOf(drop));
    }
    if (record.equipment?.mainhand === undefined && record.carried !== undefined)
        body.inventory.setEquipment('mainhand', itemOf({ identifier: record.carried, count: 1 }));
};
