/**
 * A membership entry's saved form, read as the logged fields it holds.
 *
 * `EntityRuntime.savedFormOf` writes the form an entity enters and leaves the change log with: its
 * persistence record and what the actor holds beside it. A reader that keeps entities from the log
 * alone, such as the entity replica (`network/replica/EntityReplica.ts`), starts each entity from
 * this form and then writes every field entry over it, so each field here is named the way a field
 * entry addresses it.
 */
import { ATTRIBUTES } from '@jsprismarine/entities';

import { mobEquipmentAddress } from '../../inventory/EntityInventory';
import { storedItemDrop } from '../../inventory/persistence';
import { slotKey } from '../playerShown';
import type { PlainData, PlainRecord } from '../../world/changelog/PlainData';
import { isPlainList, isPlainRecord, plainOf } from '../../world/changelog/PlainData';
import { MOB_EQUIPMENT_SLOTS } from '../equipment';
import type { LoggedBodyState } from './DataEntity';
import { conditionField, SHOWN_CONDITIONS } from './DataEntity';
import type { DataEntityRecord } from './persistence';
import { savedDropOf } from './persistence';
import { MERCHANT_FIELD } from './trading';

/** The body fields a record holds under the same name. */
const RECORD_BODY_FIELDS = [
    'yaw',
    'pitch',
    'nameTag',
    'color',
    'home',
    'ownerIdentity',
    'curedBy',
    'sitting',
    'sleeping',
    'loveTicks',
    'breedCooldown',
    'beamTarget',
    'showBottom',
    'invulnerable',
    'fuseTicks',
    'fireTicks'
] as const satisfies readonly (keyof LoggedBodyState & keyof DataEntityRecord)[];

/** What a record leaves out of a body field, which `applyDataEntityRecord` writes as the default. */
const RECORD_DEFAULTS: Partial<Record<(typeof RECORD_BODY_FIELDS)[number], PlainData>> = {
    invulnerable: false,
    fireTicks: 0
};

/** The saved form's parts beside the record, which it holds under a field's own name. */
const FORM_FIELDS = ['position', 'velocity', 'tags', 'statusEffects', 'vehicle', 'owner', 'actorTags'] as const;

const recordIn = (value: PlainData | undefined): PlainRecord =>
    value !== undefined && isPlainRecord(value) ? value : {};

/**
 * The logged fields a saved form holds, by the name a field entry addresses each with.
 *
 * Only what the form holds: a field the form leaves out, such as a player's components it does
 * not show or the status effect clock, is absent until an entry writes it.
 * @param saved - A membership entry's saved form.
 * @returns The fields, such as `position`, `attribute:health` or `condition:in_water`.
 */
export const loggedFieldsOfSavedForm = (saved: PlainRecord): Map<string, PlainData> => {
    const fields = new Map<string, PlainData>();
    const record = recordIn(saved['record']);

    for (const field of FORM_FIELDS) fields.set(field, saved[field] ?? null);
    for (const field of RECORD_BODY_FIELDS) fields.set(field, record[field] ?? RECORD_DEFAULTS[field] ?? null);
    const projectile = recordIn(record['projectile']);
    if (projectile['velocity'] !== undefined) fields.set('velocity', projectile['velocity']);

    const conditions = saved['conditions'];
    const shown = conditions !== undefined && isPlainList(conditions) ? conditions : [];
    for (const condition of SHOWN_CONDITIONS) fields.set(conditionField(condition), shown.includes(condition));

    fields.set('equipmentInventorySlots', Object.entries(aliasesIn(record)));
    fields.set('groups', record['componentGroups'] ?? []);
    fields.set('leash', record['leashHolderIdentity'] ?? null);
    fields.set(MERCHANT_FIELD, record['merchant'] ?? null);
    for (const [name, value] of Object.entries(recordIn(record['properties']))) fields.set(`property:${name}`, value);
    for (const [name, value] of Object.entries(recordIn(record['componentState'])))
        fields.set(`component:${name}`, value);

    const attributes = recordIn(saved['attributes']);
    for (const name of ATTRIBUTES) {
        const attribute = attributes[name];
        if (attribute !== undefined) fields.set(`attribute:${name}`, attribute);
    }

    // A store player's shown fields, already named as their entries address them.
    for (const [name, value] of Object.entries(recordIn(recordIn(saved['player'])['fields']))) fields.set(name, value);
    return fields;
};

/**
 * The container slots a saved form holds, by `container:slot`: a store player's shown slots, and
 * for any other entity the slots its record's `containerSlots` and `equipment` hold, each as an
 * `inventory-slot` entry logs it. An equipment slot an alias reads is its container slot, so the
 * record's copy of it is not read.
 * @param saved - A membership entry's saved form.
 */
export const loggedSlotsOfSavedForm = (saved: PlainRecord): Map<string, PlainRecord | null> => {
    const slots = new Map<string, PlainRecord | null>();
    for (const [key, value] of Object.entries(recordIn(recordIn(saved['player'])['slots'])))
        slots.set(key, value !== null && isPlainRecord(value) ? value : null);
    if (saved['player'] !== undefined) return slots;

    const record = recordIn(saved['record']);
    const container = record['containerSlots'];
    if (container !== undefined && isPlainList(container))
        for (const [slot, drop] of container.entries()) slots.set(slotKey('inventory', slot), slotValueOfDrop(drop));
    const aliases = aliasesIn(record);
    const equipment = recordIn(record['equipment']);
    for (const slot of MOB_EQUIPMENT_SLOTS) {
        if (aliases[slot] !== undefined) continue;
        const { container: name, slot: index } = mobEquipmentAddress(slot);
        slots.set(slotKey(name, index), slotValueOfDrop(equipment[slot] ?? null));
    }
    return slots;
};

/** A record's alias map, `equipmentInventorySlots`, with anything that is not a slot index left out. */
const aliasesIn = (record: PlainRecord): Record<string, number> => {
    const aliases: Record<string, number> = {};
    for (const [slot, index] of Object.entries(recordIn(record['equipmentInventorySlots'])))
        if (typeof index === 'number') aliases[slot] = index;
    return aliases;
};

/** A drop a record holds, as the logged value of the slot that holds it, or null for an empty slot. */
const slotValueOfDrop = (value: PlainData): PlainRecord | null => {
    const drop = savedDropOf(value);
    const plain = drop === undefined ? undefined : plainOf(storedItemDrop(drop));
    return plain !== undefined && isPlainRecord(plain) ? plain : null;
};
