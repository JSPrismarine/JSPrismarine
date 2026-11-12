/**
 * How a logged field's plain value turns back into the value a data entity holds.
 *
 * The change log carries plain data ([ADR 0011](../../../../../docs/adr/0011-a-world-exchanges-only-plain-data.md)),
 * and undoing a change writes the before-value back through a setter that does not log. Each
 * field the store logs has one reader here, and the reader throws when a value has the wrong
 * shape: only the store writes these entries, so a wrong shape is a bug, and a store that
 * cannot write an inverse stops its world rather than go on half undone.
 */
import type { Attribute, AttributeName } from '@jsprismarine/entities';
import { ATTRIBUTES } from '@jsprismarine/entities';
import type { ComponentStateRecord } from '@jsprismarine/entities/componentState';
import { isComponentStateRecord } from '@jsprismarine/entities/componentState';

import type { ContentItemDrop } from '../../content/world/adapter';
import type { PlainData } from '../../world/changelog/PlainData';
import { isPlainList, isPlainRecord } from '../../world/changelog/PlainData';
import type { MobEquipmentSlot } from '../equipment';
import { MOB_EQUIPMENT_SLOTS } from '../equipment';
import type { StatusEffect } from '../StatusEffect';
import type { LoggedBodyState, StatusEffectClock } from './DataEntity';
import { containerSlotsOf, equipmentOf, positionOf } from './persistence';

/** A logged value had a shape its field never holds. */
export class LoggedFieldError extends TypeError {
    public override readonly name = 'LoggedFieldError';
}

const wrong = (field: string, value: PlainData): never => {
    throw new LoggedFieldError(
        `${field} cannot hold ${JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? `${item}n` : item))}`
    );
};

/** Reads a logged number, naming `field` when the value is something else. */
export const numberField =
    (field: string) =>
    (value: PlainData): number =>
        typeof value === 'number' ? value : wrong(field, value);
/** Reads a logged boolean, naming `field` when the value is something else. */
export const booleanField =
    (field: string) =>
    (value: PlainData): boolean =>
        typeof value === 'boolean' ? value : wrong(field, value);
/** Reads a logged number, or `null` for none, naming `field` when the value is something else. */
export const optionalNumberField =
    (field: string) =>
    (value: PlainData): number | undefined =>
        value === null ? undefined : numberField(field)(value);
const optionalBoolean =
    (field: string) =>
    (value: PlainData): boolean | undefined =>
        value === null ? undefined : booleanField(field)(value);
const optionalString =
    (field: string) =>
    (value: PlainData): string | undefined =>
        value === null ? undefined : typeof value === 'string' ? value : wrong(field, value);
const position = (field: string) => (value: PlainData) => positionOf(value) ?? wrong(field, value);
const optionalPosition = (field: string) => (value: PlainData) => (value === null ? undefined : position(field)(value));

/** The reader of each logged body field. */
const BODY_FIELDS: { readonly [K in keyof LoggedBodyState]: (value: PlainData) => LoggedBodyState[K] } = {
    position: position('position'),
    yaw: numberField('yaw'),
    pitch: numberField('pitch'),
    velocity: position('velocity'),
    nameTag: optionalString('nameTag'),
    color: optionalNumberField('color'),
    home: optionalPosition('home'),
    ownerIdentity: optionalString('ownerIdentity'),
    curedBy: optionalString('curedBy'),
    sitting: booleanField('sitting'),
    sleeping: booleanField('sleeping'),
    loveTicks: numberField('loveTicks'),
    breedCooldown: numberField('breedCooldown'),
    beamTarget: optionalPosition('beamTarget'),
    showBottom: optionalBoolean('showBottom'),
    invulnerable: booleanField('invulnerable'),
    fuseTicks: optionalNumberField('fuseTicks'),
    fireTicks: numberField('fireTicks'),
    owner: optionalNumberField('owner'),
    statusEffectClock: (value) => (value === null ? undefined : statusEffectClockIn(value)),
    actorTags: (value) =>
        value === null ? undefined : value instanceof Uint8Array ? value : wrong('actorTags', value),
    projectileAge: numberField('projectileAge'),
    projectileStuck: booleanField('projectileStuck'),
    equipment: (value) => equipmentOf(value) ?? wrong('equipment', value),
    inventory: (value) => stringsIn('inventory', value),
    containerSlots: (value) =>
        (containerSlotsOf(value) ?? wrong('containerSlots', value)).map(
            (item): ContentItemDrop | undefined => item ?? undefined
        )
};

/** Whether a logged field name is one of the body's {@link LoggedBodyState} fields. */
export const isBodyField = (field: string): field is keyof LoggedBodyState => Object.hasOwn(BODY_FIELDS, field);

/** Reads a logged body field's plain value back into the value the body holds. */
export const bodyFieldValue = <K extends keyof LoggedBodyState>(field: K, value: PlainData): LoggedBodyState[K] =>
    BODY_FIELDS[field](value);

/** Reads a list of strings, such as a body's tags or a group list. */
export const stringsIn = (field: string, value: PlainData): string[] =>
    isPlainList(value) && value.every((item) => typeof item === 'string')
        ? value.filter((item): item is string => typeof item === 'string')
        : wrong(field, value);

/** Reads a logged status effect clock. */
const statusEffectClockIn = (value: PlainData): StatusEffectClock =>
    isPlainRecord(value) && typeof value['age'] === 'number' && typeof value['tick'] === 'number'
        ? { age: value['age'], tick: value['tick'] }
        : wrong('statusEffectClock', value);

/** Reads a logged list of status effects. */
export const statusEffectsIn = (value: PlainData): StatusEffect[] => {
    if (!isPlainList(value)) return wrong('statusEffects', value);
    return value.map((effect): StatusEffect => {
        if (
            !isPlainRecord(effect) ||
            typeof effect['id'] !== 'string' ||
            typeof effect['amplifier'] !== 'number' ||
            typeof effect['durationTicks'] !== 'number' ||
            typeof effect['ambient'] !== 'boolean' ||
            typeof effect['showParticles'] !== 'boolean' ||
            typeof effect['showIcon'] !== 'boolean'
        )
            return wrong('statusEffects', effect);
        return {
            id: effect['id'],
            amplifier: effect['amplifier'],
            durationTicks: effect['durationTicks'],
            ambient: effect['ambient'],
            showParticles: effect['showParticles'],
            showIcon: effect['showIcon']
        };
    });
};

/** Reads the logged entries of a body's equipment-to-inventory slot projection. */
export const equipmentInventorySlotsIn = (value: PlainData): [MobEquipmentSlot, number][] => {
    if (!isPlainList(value)) return wrong('equipmentInventorySlots', value);
    return value.map((entry): [MobEquipmentSlot, number] => {
        if (!isPlainList(entry)) return wrong('equipmentInventorySlots', entry);
        const [slot, index] = entry;
        const known = MOB_EQUIPMENT_SLOTS.find((name) => name === slot);
        if (known === undefined || typeof index !== 'number') return wrong('equipmentInventorySlots', entry);
        return [known, index];
    });
};

/** Reads a logged attribute: the four numbers, or `null` for an undeclared one. */
export const attributeIn = (value: PlainData): Attribute | null => {
    if (value === null) return null;
    if (
        !isPlainRecord(value) ||
        typeof value['base'] !== 'number' ||
        typeof value['min'] !== 'number' ||
        typeof value['max'] !== 'number' ||
        typeof value['current'] !== 'number'
    )
        return wrong('attribute', value);
    return { base: value['base'], min: value['min'], max: value['max'], current: value['current'] };
};

/** The attribute a logged field name such as `attribute:health` names. */
export const attributeNamed = (name: string): AttributeName =>
    ATTRIBUTES.find((attribute) => attribute === name) ?? wrong('attribute', name);

/** Reads a logged property value. */
export const propertyIn = (value: PlainData): number | boolean | string =>
    typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string'
        ? value
        : wrong('property', value);

/** Reads a logged component state: a plain record, or `null` for none. */
export const componentStateIn = (value: PlainData): ComponentStateRecord | null =>
    value === null || isComponentStateRecord(value) ? value : wrong('component state', value);

/** Reads a logged runtime id link, such as the vehicle a rider is on, or `null` for none. */
export const linkIn = (field: string, value: PlainData): number | undefined => optionalNumberField(field)(value);

/** Reads a logged identity link, such as a leash holder, or `null` for none. */
export const identityIn = (field: string, value: PlainData): string | undefined => optionalString(field)(value);
