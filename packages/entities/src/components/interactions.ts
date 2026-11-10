/** Components a player's held item drives: interactions, admiring and bartering, healing, breeding and taming. */

import type { ComponentFactory } from '@jsprismarine/content';
import { accepted, rejected } from '@jsprismarine/content';
import type { Filter } from '@jsprismarine/packs';
import { defineComponentState, stateField } from '../componentState';
import type { EntityInstance } from '../entityInstance';
import { parseEventTarget } from '../events';
import { evaluateFilter } from '../filters';
import type { EntityHooks } from '../hooks';
import type {
    EntityAddItemsRequest,
    EntityItemInteractionEffect,
    EntityItemInteractionState,
    EntityRepairItemRequest,
    EntitySpawnItemsRequest,
    EntityTameInteractionEffect
} from '../hooks';
import { TICKS_PER_SECOND } from '../hooks';
import type { ComponentRecord } from './schemas';
import { asList, booleanAt, isRecord, numberAt, parseFilterValue, recordSchema, stringAt } from './schemas';

import type { SensorTrigger } from './shared';
import { normalizedItemIdentifier, parseComponentTrigger, qualifiedSpawnIdentifier } from './shared';

/** `minecraft:spawn_egg_interaction`, which creates the entity's offspring from its matching egg. */
export const spawnEggInteraction: ComponentFactory<EntityHooks, ComponentRecord> = {
    name: 'minecraft:spawn_egg_interaction',
    hooks: ['onInteractWithItem'],
    schema: recordSchema,
    create: () => ({
        onInteractWithItem: (entity, _itemIdentifier, _other, state?: EntityItemInteractionState) => {
            const spawnEgg = state?.spawnEgg;
            if (spawnEgg === undefined || spawnEgg.identifier !== entity.type.identifier) return undefined;
            return { spawnOffspring: spawnEgg.offspringIdentifier };
        }
    })
};

/** One item transformation written as `item_name:aux_value`. */
interface TransformedItem {
    readonly identifier: string;
    readonly data?: number;
}

/** Splits a transformed item into its namespaced identifier and auxiliary value. */
const transformedItemOf = (value: string): TransformedItem => {
    const match = /^(?<identifier>.+):(?<data>\d+)$/.exec(value);
    const identifier = match?.groups?.identifier ?? value;
    return {
        identifier: normalizedItemIdentifier(identifier),
        ...(match?.groups?.data === undefined ? {} : { data: Number(match.groups.data) })
    };
};

/** One `minecraft:interact.interactions[]` entry used by a held-item interaction. */
interface InteractEntry {
    readonly onInteract?: SensorTrigger;
    readonly healthAmount?: number;
    /** Entity types to create when this interaction succeeds. */
    readonly spawnEntities: readonly string[];
    /** Entity inventory or equipment slot that receives the held item. */
    readonly equipItemSlot?: string;
    /** Entity inventory or equipment slot whose item is dropped. */
    readonly dropItemSlot?: string;
    /** Vertical offset for an item dropped from an entity slot. */
    readonly dropItemYOffset?: number;
    /** Whether the entity takes the held item into its main hand. */
    readonly giveItem: boolean;
    /** Whether the entity offers its main-hand item to an empty player hand. */
    readonly takeItem: boolean;
    /** Whether the entity should admire the offered item after the interaction. */
    readonly admire: boolean;
    /** Whether the entity should barter for the offered item after the interaction. */
    readonly barter: boolean;
    /** Text shown on touch controls while this interaction is available. */
    readonly interactText?: string;
    /** Loot-table items to add to the interacting player's inventory. */
    readonly addItems?: EntityAddItemsRequest;
    /** Durability to remove from the held item when the interaction succeeds. */
    readonly hurtItem: number;
    readonly useItem: boolean;
    /** Whether the interacting player swings, which defaults to true. */
    readonly swing: boolean;
    /** A named particle emitted when this interaction starts. */
    readonly particleOnStart?: {
        readonly particleType: string;
        readonly yOffset: number;
        readonly offsetTowardsInteractor: boolean;
    };
    readonly transformedItem?: TransformedItem;
    /** Bedrock loot-table path rolled when the interaction succeeds. */
    readonly spawnItems?: EntitySpawnItemsRequest;
    /** Entity item slot to repair when this interaction succeeds. */
    readonly repairEntityItem?: EntityRepairItemRequest;
    readonly playSounds: readonly string[];
    /** Game-event vibration emitted when the interaction succeeds. */
    readonly vibration?: string;
    /** Seconds before this interaction can succeed again. */
    readonly cooldown: number;
    /** Seconds after damage during which this interaction is unavailable. */
    readonly cooldownAfterBeingAttacked: number;
    readonly unsupportedFields: readonly string[];
}

/**
 * The ticks left on each `minecraft:interact` entry's cooldown, by entry index: `interactions`
 * after the entry was used, `attacked` after the entity was hurt.
 */
const INTERACT_STATE = defineComponentState('minecraft:interact', {
    interactions: stateField.list(stateField.number),
    attacked: stateField.list(stateField.number)
});

/** Converts an interaction delay from seconds into whole server ticks. */
const interactionCooldownTicks = (seconds: number): number => Math.ceil(seconds * TICKS_PER_SECOND);

/** What `minecraft:interact` declares. */
export interface InteractParams {
    /** Ordered interactions; the first matching entry with a supported effect wins. */
    readonly interactions: readonly InteractEntry[];
}

/** What `minecraft:admire_item` declares. Durations are in seconds. */
export interface AdmireItemParams {
    /** How long the entity admires an offered item. */
    readonly duration: number;
    /** Time after damage during which the entity will not admire items. */
    readonly cooldownAfterBeingAttacked: number;
}

/** The Bedrock admiration component, consumed by the data-driven entity runtime. */
export const admireItem: ComponentFactory<EntityHooks, AdmireItemParams> = {
    name: 'minecraft:admire_item',
    hooks: [],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        for (const key of ['duration', 'cooldown_after_being_attacked']) {
            if (value[key] !== undefined && (typeof value[key] !== 'number' || value[key] < 0))
                return rejected(`${key} must be a non-negative number`);
        }
        return accepted({
            duration: numberAt(value, 'duration', 10),
            cooldownAfterBeingAttacked: numberAt(value, 'cooldown_after_being_attacked', 10)
        });
    },
    create: () => ({})
};

/** What `minecraft:barter` declares. */
export interface BarterParams {
    /** Loot table rolled when the entity completes a barter. */
    readonly barterTable?: string;
    /** Time after damage during which the entity will not barter. */
    readonly cooldownAfterBeingAttacked: number;
}

/** The Bedrock barter component, consumed by the data-driven entity runtime. */
export const barter: ComponentFactory<EntityHooks, BarterParams> = {
    name: 'minecraft:barter',
    hooks: [],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        if (
            value.barter_table !== undefined &&
            (typeof value.barter_table !== 'string' || value.barter_table.length === 0)
        )
            return rejected('barter_table must be a non-empty string');
        if (
            value.cooldown_after_being_attacked !== undefined &&
            (typeof value.cooldown_after_being_attacked !== 'number' || value.cooldown_after_being_attacked < 0)
        )
            return rejected('cooldown_after_being_attacked must be a non-negative number');
        return accepted({
            ...(typeof value.barter_table === 'string' ? { barterTable: value.barter_table } : {}),
            cooldownAfterBeingAttacked: numberAt(value, 'cooldown_after_being_attacked', 10)
        });
    },
    create: () => ({})
};

/**
 * The held-item behavior currently implemented for `minecraft:interact`.
 *
 * It evaluates each entry's `on_interact.filters`, enforces cooldowns, queues
 * its event, plays `play_sounds`, emits its `vibration` game event, rolls
 * `spawn_items` or adds `add_items` to the interacting player's inventory,
 * creates `spawn_entities`, equips or drops an entity slot, and applies
 * `transform_to_item`, `give_item`, and `use_item` to the live held stack. It emits a named
 * `particle_on_start.particle_type` with its vertical and interactor offsets, and its `swing`
 * setting relays the player's arm animation after a successful interaction.
 * `admire` and `barter` start the piglin's corresponding item behavior when
 * its active components and brain support them. Other interaction fields
 * remain visible as a one-time runtime report so incomplete behavior is not
 * silently treated as vanilla.
 */
export const interact: ComponentFactory<EntityHooks, InteractParams> = {
    name: 'minecraft:interact',
    hooks: ['onInitialize', 'onTick', 'onDamageProcessed', 'onInteractWithItem'],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        const supportedFields = new Set([
            'on_interact',
            'health_amount',
            'spawn_entities',
            'equip_item_slot',
            'drop_item_slot',
            'drop_item_y_offset',
            'give_item',
            'interact_text',
            'add_items',
            'hurt_item',
            'use_item',
            'transform_to_item',
            'spawn_items',
            'play_sounds',
            'vibration',
            'repair_entity_item',
            'take_item',
            'cooldown',
            'cooldown_after_being_attacked',
            'swing',
            'particle_on_start',
            'admire',
            'barter'
        ]);
        const interactions: InteractEntry[] = [];
        for (const [index, raw] of asList(value.interactions).entries()) {
            if (!isRecord(raw)) return rejected(`interactions[${index}] must be an object`);
            let onInteract: SensorTrigger | undefined;
            if (raw.on_interact !== undefined) {
                if (!isRecord(raw.on_interact)) return rejected(`interactions[${index}].on_interact must be an object`);
                let filters: Filter | undefined;
                if (raw.on_interact.filters !== undefined) {
                    const parsed = parseFilterValue(
                        raw.on_interact.filters,
                        `minecraft:interact interactions[${index}]`
                    );
                    if (!parsed.ok) return parsed;
                    filters = parsed.value;
                }
                onInteract = {
                    filters,
                    event: stringAt(raw.on_interact, 'event'),
                    target: parseEventTarget(raw.on_interact.target, () => undefined)
                };
            }
            if (raw.transform_to_item !== undefined && typeof raw.transform_to_item !== 'string')
                return rejected(`interactions[${index}].transform_to_item must be a string`);
            if (raw.equip_item_slot !== undefined && typeof raw.equip_item_slot !== 'string')
                return rejected(`interactions[${index}].equip_item_slot must be a string`);
            if (raw.drop_item_slot !== undefined && typeof raw.drop_item_slot !== 'string')
                return rejected(`interactions[${index}].drop_item_slot must be a string`);
            if (raw.drop_item_y_offset !== undefined && typeof raw.drop_item_y_offset !== 'number')
                return rejected(`interactions[${index}].drop_item_y_offset must be a number`);
            if (raw.give_item !== undefined && typeof raw.give_item !== 'boolean')
                return rejected(`interactions[${index}].give_item must be a boolean`);
            if (raw.take_item !== undefined && typeof raw.take_item !== 'boolean')
                return rejected(`interactions[${index}].take_item must be a boolean`);
            if (raw.swing !== undefined && typeof raw.swing !== 'boolean')
                return rejected(`interactions[${index}].swing must be a boolean`);
            if (raw.admire !== undefined && typeof raw.admire !== 'boolean')
                return rejected(`interactions[${index}].admire must be a boolean`);
            if (raw.barter !== undefined && typeof raw.barter !== 'boolean')
                return rejected(`interactions[${index}].barter must be a boolean`);
            if (raw.particle_on_start !== undefined && !isRecord(raw.particle_on_start))
                return rejected(`interactions[${index}].particle_on_start must be an object`);
            if (
                isRecord(raw.particle_on_start) &&
                raw.particle_on_start.particle_type !== undefined &&
                typeof raw.particle_on_start.particle_type !== 'string'
            )
                return rejected(`interactions[${index}].particle_on_start.particle_type must be a string`);
            if (
                isRecord(raw.particle_on_start) &&
                raw.particle_on_start.particle_y_offset !== undefined &&
                typeof raw.particle_on_start.particle_y_offset !== 'number'
            )
                return rejected(`interactions[${index}].particle_on_start.particle_y_offset must be a number`);
            if (
                isRecord(raw.particle_on_start) &&
                raw.particle_on_start.particle_offset_towards_interactor !== undefined &&
                typeof raw.particle_on_start.particle_offset_towards_interactor !== 'boolean'
            )
                return rejected(
                    `interactions[${index}].particle_on_start.particle_offset_towards_interactor must be a boolean`
                );
            if (
                isRecord(raw.particle_on_start) &&
                raw.particle_on_start.copper_event !== undefined &&
                (typeof raw.particle_on_start.copper_event !== 'string' ||
                    !['none', 'scrape', 'wax_off', 'wax_on'].includes(raw.particle_on_start.copper_event))
            )
                return rejected(
                    `interactions[${index}].particle_on_start.copper_event must be none, scrape, wax_off, or wax_on`
                );
            if (raw.interact_text !== undefined && typeof raw.interact_text !== 'string')
                return rejected(`interactions[${index}].interact_text must be a string`);
            const spawnEntities: string[] = [];
            if (raw.spawn_entities !== undefined) {
                if (!Array.isArray(raw.spawn_entities))
                    return rejected(`interactions[${index}].spawn_entities must be an array of entity identifiers`);
                for (const identifier of raw.spawn_entities) {
                    if (typeof identifier !== 'string' || identifier.length === 0)
                        return rejected(
                            `interactions[${index}].spawn_entities must be an array of non-empty entity identifiers`
                        );
                    spawnEntities.push(identifier);
                }
            }
            if (
                raw.health_amount !== undefined &&
                (typeof raw.health_amount !== 'number' || !Number.isInteger(raw.health_amount))
            )
                return rejected(`interactions[${index}].health_amount must be an integer`);
            if (
                raw.hurt_item !== undefined &&
                (typeof raw.hurt_item !== 'number' || !Number.isInteger(raw.hurt_item) || raw.hurt_item < 0)
            )
                return rejected(`interactions[${index}].hurt_item must be a non-negative integer`);
            if (raw.vibration !== undefined && (typeof raw.vibration !== 'string' || raw.vibration.length === 0))
                return rejected(`interactions[${index}].vibration must be a non-empty string`);
            if (
                raw.spawn_items !== undefined &&
                (!isRecord(raw.spawn_items) || typeof raw.spawn_items.table !== 'string')
            )
                return rejected(`interactions[${index}].spawn_items must name a loot table`);
            if (raw.add_items !== undefined && (!isRecord(raw.add_items) || typeof raw.add_items.table !== 'string'))
                return rejected(`interactions[${index}].add_items must name a loot table`);
            if (raw.repair_entity_item !== undefined && !isRecord(raw.repair_entity_item))
                return rejected(`interactions[${index}].repair_entity_item must be an object`);
            if (
                isRecord(raw.repair_entity_item) &&
                raw.repair_entity_item.amount !== undefined &&
                (typeof raw.repair_entity_item.amount !== 'number' ||
                    !Number.isInteger(raw.repair_entity_item.amount) ||
                    raw.repair_entity_item.amount <= 0)
            )
                return rejected(`interactions[${index}].repair_entity_item.amount must be a positive integer`);
            if (
                isRecord(raw.repair_entity_item) &&
                raw.repair_entity_item.slot !== undefined &&
                raw.repair_entity_item.slot !== null &&
                typeof raw.repair_entity_item.slot !== 'string'
            )
                return rejected(`interactions[${index}].repair_entity_item.slot must be a string or null`);
            if (
                isRecord(raw.spawn_items) &&
                raw.spawn_items.y_offset !== undefined &&
                typeof raw.spawn_items.y_offset !== 'number'
            )
                return rejected(`interactions[${index}].spawn_items.y_offset must be a number`);
            const spawnItems: EntitySpawnItemsRequest | undefined =
                isRecord(raw.spawn_items) && typeof raw.spawn_items.table === 'string'
                    ? { table: raw.spawn_items.table, yOffset: numberAt(raw.spawn_items, 'y_offset', 0) }
                    : undefined;
            const addItems: EntityAddItemsRequest | undefined =
                isRecord(raw.add_items) && typeof raw.add_items.table === 'string'
                    ? { table: raw.add_items.table }
                    : undefined;
            const repairEntityItem: EntityRepairItemRequest | undefined = isRecord(raw.repair_entity_item)
                ? {
                      amount: numberAt(raw.repair_entity_item, 'amount', 1),
                      ...(typeof raw.repair_entity_item.slot === 'string' ? { slot: raw.repair_entity_item.slot } : {})
                  }
                : undefined;
            const particleOnStart = isRecord(raw.particle_on_start)
                ? {
                      particleType: stringAt(raw.particle_on_start, 'particle_type') ?? 'none',
                      yOffset: numberAt(raw.particle_on_start, 'particle_y_offset', 0),
                      offsetTowardsInteractor: booleanAt(
                          raw.particle_on_start,
                          'particle_offset_towards_interactor',
                          false
                      )
                  }
                : undefined;
            let playSounds: readonly string[] = [];
            if (typeof raw.play_sounds === 'string') playSounds = [raw.play_sounds];
            else if (raw.play_sounds !== undefined) {
                if (!Array.isArray(raw.play_sounds))
                    return rejected(`interactions[${index}].play_sounds must be a string or an array of strings`);
                const sounds: string[] = [];
                for (const sound of raw.play_sounds) {
                    if (typeof sound !== 'string')
                        return rejected(`interactions[${index}].play_sounds must be a string or an array of strings`);
                    sounds.push(sound);
                }
                playSounds = sounds;
            }
            interactions.push({
                onInteract,
                spawnEntities,
                ...(typeof raw.equip_item_slot === 'string' ? { equipItemSlot: raw.equip_item_slot } : {}),
                ...(typeof raw.drop_item_slot === 'string' ? { dropItemSlot: raw.drop_item_slot } : {}),
                ...(typeof raw.drop_item_y_offset === 'number' ? { dropItemYOffset: raw.drop_item_y_offset } : {}),
                giveItem: booleanAt(raw, 'give_item', false),
                takeItem: booleanAt(raw, 'take_item', false),
                admire: booleanAt(raw, 'admire', false),
                barter: booleanAt(raw, 'barter', false),
                ...(typeof raw.interact_text === 'string' ? { interactText: raw.interact_text } : {}),
                ...(typeof raw.health_amount === 'number' ? { healthAmount: raw.health_amount } : {}),
                ...(addItems === undefined ? {} : { addItems }),
                hurtItem: numberAt(raw, 'hurt_item', 0),
                useItem: booleanAt(raw, 'use_item', false),
                swing: booleanAt(raw, 'swing', true),
                playSounds,
                ...(typeof raw.vibration === 'string' ? { vibration: raw.vibration } : {}),
                ...(particleOnStart === undefined ? {} : { particleOnStart }),
                cooldown: Math.max(0, numberAt(raw, 'cooldown', 0)),
                cooldownAfterBeingAttacked: Math.max(0, numberAt(raw, 'cooldown_after_being_attacked', 0)),
                ...(typeof raw.transform_to_item === 'string'
                    ? { transformedItem: transformedItemOf(raw.transform_to_item) }
                    : {}),
                ...(spawnItems === undefined ? {} : { spawnItems }),
                ...(repairEntityItem === undefined ? {} : { repairEntityItem }),
                unsupportedFields: [
                    ...Object.keys(raw).filter((key) => !supportedFields.has(key)),
                    ...(isRecord(raw.spawn_items)
                        ? Object.keys(raw.spawn_items)
                              .filter((key) => key !== 'table' && key !== 'y_offset')
                              .map((key) => `spawn_items.${key}`)
                        : []),
                    ...(isRecord(raw.add_items)
                        ? Object.keys(raw.add_items)
                              .filter((key) => key !== 'table')
                              .map((key) => `add_items.${key}`)
                        : []),
                    ...(isRecord(raw.repair_entity_item)
                        ? Object.keys(raw.repair_entity_item)
                              .filter((key) => key !== 'amount' && key !== 'slot')
                              .map((key) => `repair_entity_item.${key}`)
                        : []),
                    ...(isRecord(raw.particle_on_start)
                        ? [
                              ...(raw.particle_on_start.copper_event !== undefined &&
                              raw.particle_on_start.copper_event !== 'none'
                                  ? ['particle_on_start.copper_event']
                                  : []),
                              ...Object.keys(raw.particle_on_start)
                                  .filter(
                                      (key) =>
                                          key !== 'copper_event' &&
                                          key !== 'particle_type' &&
                                          key !== 'particle_y_offset' &&
                                          key !== 'particle_offset_towards_interactor'
                                  )
                                  .map((key) => `particle_on_start.${key}`)
                          ]
                        : [])
                ]
            });
        }
        return accepted({ interactions });
    },
    create: (params) => {
        const reported = new WeakSet<EntityInstance>();
        const idle = { interactions: params.interactions.map(() => 0), attacked: params.interactions.map(() => 0) };
        return {
            onInitialize: (entity) => {
                entity.componentState.set(INTERACT_STATE, idle);
                if (reported.has(entity)) return;
                reported.add(entity);
                const unsupported = [...new Set(params.interactions.flatMap((entry) => entry.unsupportedFields))];
                if (unsupported.length > 0)
                    entity.report(`minecraft:interact fields ${unsupported.join(', ')} are not carried out`);
            },
            onTick: (entity) => {
                const state = entity.componentState.get(INTERACT_STATE) ?? idle;
                entity.componentState.set(INTERACT_STATE, {
                    interactions: params.interactions.map((_, index) =>
                        Math.max(0, (state.interactions[index] ?? 0) - 1)
                    ),
                    attacked: params.interactions.map((_, index) => Math.max(0, (state.attacked[index] ?? 0) - 1))
                });
            },
            onDamageProcessed: (entity) => {
                const state = entity.componentState.get(INTERACT_STATE) ?? idle;
                entity.componentState.set(INTERACT_STATE, {
                    ...state,
                    attacked: params.interactions.map((entry, index) =>
                        entry.cooldownAfterBeingAttacked > 0
                            ? interactionCooldownTicks(entry.cooldownAfterBeingAttacked)
                            : (state.attacked[index] ?? 0)
                    )
                });
            },
            onInteractWithItem: (entity, itemIdentifier, other): boolean | EntityItemInteractionEffect | undefined => {
                const normalizedItem = normalizedItemIdentifier(itemIdentifier);
                const heldItem = other?.equipment?.('hand', 0) ?? { identifier: () => normalizedItem };
                const subjects = other === undefined ? {} : { other, player: other };
                const context = { ...entity.filterContext(), ...subjects, item: heldItem };
                const state = entity.componentState.get(INTERACT_STATE) ?? idle;
                for (const [index, entry] of params.interactions.entries()) {
                    if (entry.onInteract?.filters !== undefined && !evaluateFilter(entry.onInteract.filters, context))
                        continue;
                    if (
                        entry.onInteract?.event === undefined &&
                        entry.transformedItem === undefined &&
                        entry.spawnItems === undefined &&
                        entry.addItems === undefined &&
                        entry.repairEntityItem === undefined &&
                        entry.equipItemSlot === undefined &&
                        entry.dropItemSlot === undefined &&
                        !entry.giveItem &&
                        !entry.takeItem &&
                        !entry.admire &&
                        !entry.barter &&
                        entry.spawnEntities.length === 0 &&
                        (entry.healthAmount === undefined || entry.healthAmount === 0) &&
                        entry.hurtItem === 0 &&
                        !entry.useItem &&
                        (entry.particleOnStart === undefined || entry.particleOnStart.particleType === 'none') &&
                        entry.playSounds.length === 0 &&
                        entry.vibration === undefined
                    )
                        continue;
                    if ((state.interactions[index] ?? 0) > 0 || (state.attacked[index] ?? 0) > 0) return false;
                    entity.componentState.set(INTERACT_STATE, {
                        ...state,
                        interactions: params.interactions.map((_, slot) =>
                            slot === index ? interactionCooldownTicks(entry.cooldown) : (state.interactions[slot] ?? 0)
                        )
                    });
                    if (entry.onInteract?.event !== undefined)
                        entity.raise(entry.onInteract.event, entry.onInteract.target, 'minecraft:interact');
                    for (const identifier of entry.spawnEntities)
                        entity.requestSpawn(
                            {
                                kind: 'entity',
                                identifier: qualifiedSpawnIdentifier(identifier),
                                count: 1,
                                cause: 'spawned',
                                shouldLeash: false
                            },
                            'minecraft:interact'
                        );
                    return {
                        ...(entry.playSounds.length === 0 ? {} : { playSounds: entry.playSounds }),
                        ...(entry.spawnItems === undefined ? {} : { spawnItems: entry.spawnItems }),
                        ...(entry.addItems === undefined ? {} : { addItems: entry.addItems }),
                        ...(entry.equipItemSlot === undefined ? {} : { equipItemSlot: entry.equipItemSlot }),
                        ...(entry.dropItemSlot === undefined ? {} : { dropItemSlot: entry.dropItemSlot }),
                        ...(entry.dropItemYOffset === undefined ? {} : { dropItemYOffset: entry.dropItemYOffset }),
                        ...(entry.giveItem ? { giveItem: true } : {}),
                        ...(entry.takeItem ? { takeItem: true } : {}),
                        ...(entry.admire ? { admire: true } : {}),
                        ...(entry.barter ? { barter: true } : {}),
                        ...(entry.vibration === undefined ? {} : { vibration: entry.vibration }),
                        ...(entry.particleOnStart === undefined || entry.particleOnStart.particleType === 'none'
                            ? {}
                            : { particleOnStart: entry.particleOnStart }),
                        ...(entry.repairEntityItem === undefined ? {} : { repairEntityItem: entry.repairEntityItem }),
                        ...(entry.healthAmount === undefined ? {} : { healthAmount: entry.healthAmount }),
                        ...(entry.hurtItem === 0 ? {} : { hurtItem: entry.hurtItem }),
                        swing: entry.swing,
                        ...(entry.transformedItem === undefined
                            ? {}
                            : {
                                  resultItem: entry.transformedItem.identifier,
                                  ...(entry.transformedItem.data === undefined
                                      ? {}
                                      : { resultItemData: entry.transformedItem.data })
                              }),
                        consumeItem:
                            entry.useItem ||
                            entry.equipItemSlot !== undefined ||
                            entry.giveItem ||
                            entry.transformedItem !== undefined
                    };
                }
                return undefined;
            }
        };
    }
};

/** One status effect a `minecraft:healable` item may apply. */
export interface HealableEffectParams {
    /** The Bedrock status effect name. */
    readonly name: string;
    /** Duration in seconds, or `infinite` for an effect that never expires. */
    readonly duration: number | 'infinite';
    /** One below the displayed potency. */
    readonly amplifier: number;
    /** The chance in [0, 1] that this effect is applied. */
    readonly chance: number;
}

/** One item `minecraft:healable` accepts. */
export interface HealableItemParams {
    /** The item identifier, normalized to the default Minecraft namespace. */
    readonly item: string;
    /** Health restored when the entity accepts the item. */
    readonly healAmount: number;
    /** Item replacing the consumed item, if the definition names one. */
    readonly resultItem?: string;
    /** Status effects applied when the item is accepted. */
    readonly effects: readonly HealableEffectParams[];
}

/** What `minecraft:healable` declares. */
export interface HealableParams {
    /** Items that can be used to heal the entity. */
    readonly items: readonly HealableItemParams[];
    /** Conditions required before a matching item can be used. */
    readonly filters?: Filter;
    /** Whether a matching item is accepted at full health. */
    readonly forceUse: boolean;
}

/** One item `minecraft:breedable` accepts. */
export interface BreedableItemParams {
    /** The item identifier, normalized to the default Minecraft namespace. */
    readonly item: string;
    /** Item replacing the consumed item after the entity enters its love state. */
    readonly resultItem?: string;
}

/** The `minecraft:breedable` values used when an entity receives a breeding item. */
export interface BreedableParams extends ComponentRecord {
    /** Items that can put the entity into its love state. */
    readonly breedItems: readonly BreedableItemParams[];
    /** Whether the entity must be tamed before accepting a breeding item. */
    readonly requireTame: boolean;
    /** Whether the entity must be at full health before accepting a breeding item. */
    readonly requireFullHealth: boolean;
}

/** `minecraft:breedable`, which owns feeding eligibility and item replacement. */
export const breedable: ComponentFactory<EntityHooks, BreedableParams> = {
    name: 'minecraft:breedable',
    hooks: ['onInteractWithItem'],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');

        const breedItems: BreedableItemParams[] = [];
        for (const [index, raw] of asList(value.breed_items).entries()) {
            if (typeof raw === 'string') {
                breedItems.push({ item: normalizedItemIdentifier(raw) });
                continue;
            }
            if (!isRecord(raw) || typeof raw.item !== 'string' || raw.item.length === 0)
                return rejected(`breed_items[${index}].item must be a non-empty string`);
            if (raw.result_item !== undefined && (typeof raw.result_item !== 'string' || raw.result_item.length === 0))
                return rejected(`breed_items[${index}].result_item must be a non-empty string`);
            if (
                raw.transform_to_item !== undefined &&
                (typeof raw.transform_to_item !== 'string' || raw.transform_to_item.length === 0)
            )
                return rejected(`breed_items[${index}].transform_to_item must be a non-empty string`);

            const resultItem =
                typeof raw.result_item === 'string'
                    ? raw.result_item
                    : typeof raw.transform_to_item === 'string'
                      ? raw.transform_to_item
                      : undefined;
            breedItems.push({
                item: normalizedItemIdentifier(raw.item),
                ...(resultItem === undefined ? {} : { resultItem: normalizedItemIdentifier(resultItem) })
            });
        }

        return accepted({
            ...value,
            breedItems,
            requireTame: booleanAt(value, 'require_tame', true),
            requireFullHealth: booleanAt(value, 'require_full_health', false)
        });
    },
    create: (params) => ({
        onInteractWithItem: (entity, itemIdentifier, _other, state?: EntityItemInteractionState) => {
            const normalizedItem = normalizedItemIdentifier(itemIdentifier);
            const item = params.breedItems.find((entry) => entry.item === normalizedItem);
            if (item === undefined || entity.hasComponent('minecraft:is_baby')) return undefined;
            if ((state?.loveTicks ?? 0) > 0 || (state?.breedCooldown ?? 0) > 0) return undefined;
            if (params.requireTame && entity.filterContext().self.flag?.('is_tamed') !== true) return undefined;

            if (params.requireFullHealth) {
                const health = entity.attributes.get('health');
                if (health === undefined || health.current < health.max) return undefined;
            }

            return {
                breed: true,
                ...(item.resultItem === undefined ? {} : { resultItem: item.resultItem })
            };
        }
    })
};

/** `minecraft:healable`, which owns the entity's item-based healing interaction. */
export const healable: ComponentFactory<EntityHooks, HealableParams> = {
    name: 'minecraft:healable',
    hooks: ['onInteractWithItem'],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        if (value.force_use !== undefined && typeof value.force_use !== 'boolean')
            return rejected('force_use must be a boolean');

        let filters: Filter | undefined;
        if (value.filters !== undefined) {
            const parsed = parseFilterValue(value.filters, 'minecraft:healable filters');
            if (!parsed.ok) return parsed;
            filters = parsed.value;
        }

        const items: HealableItemParams[] = [];
        for (const [index, raw] of asList(value.items).entries()) {
            if (typeof raw === 'string') {
                items.push({ item: normalizedItemIdentifier(raw), healAmount: 1, effects: [] });
                continue;
            }
            if (!isRecord(raw) || typeof raw.item !== 'string' || raw.item.length === 0)
                return rejected(`items[${index}].item must be a non-empty string`);
            if (
                raw.heal_amount !== undefined &&
                (typeof raw.heal_amount !== 'number' || !Number.isFinite(raw.heal_amount))
            )
                return rejected(`items[${index}].heal_amount must be a finite number`);
            if (raw.result_item !== undefined && (typeof raw.result_item !== 'string' || raw.result_item.length === 0))
                return rejected(`items[${index}].result_item must be a non-empty string`);
            if (raw.effects !== undefined && !Array.isArray(raw.effects))
                return rejected(`items[${index}].effects must be an array`);

            const effects: HealableEffectParams[] = [];
            for (const [effectIndex, rawEffect] of (Array.isArray(raw.effects) ? raw.effects : []).entries()) {
                if (!isRecord(rawEffect) || typeof rawEffect.name !== 'string' || rawEffect.name.length === 0)
                    return rejected(`items[${index}].effects[${effectIndex}].name must be a non-empty string`);
                if (
                    rawEffect.duration !== undefined &&
                    rawEffect.duration !== 'infinite' &&
                    (typeof rawEffect.duration !== 'number' ||
                        !Number.isFinite(rawEffect.duration) ||
                        rawEffect.duration < 0)
                )
                    return rejected(
                        `items[${index}].effects[${effectIndex}].duration must be a non-negative number or 'infinite'`
                    );
                if (
                    rawEffect.amplifier !== undefined &&
                    (typeof rawEffect.amplifier !== 'number' || !Number.isFinite(rawEffect.amplifier))
                )
                    return rejected(`items[${index}].effects[${effectIndex}].amplifier must be a finite number`);
                if (
                    rawEffect.chance !== undefined &&
                    (typeof rawEffect.chance !== 'number' || !Number.isFinite(rawEffect.chance))
                )
                    return rejected(`items[${index}].effects[${effectIndex}].chance must be a finite number`);

                effects.push({
                    name: rawEffect.name,
                    duration: rawEffect.duration === 'infinite' ? 'infinite' : numberAt(rawEffect, 'duration', 0),
                    amplifier: numberAt(rawEffect, 'amplifier', 0),
                    chance: numberAt(rawEffect, 'chance', 1)
                });
            }

            items.push({
                item: normalizedItemIdentifier(raw.item),
                healAmount: numberAt(raw, 'heal_amount', 1),
                ...(typeof raw.result_item === 'string'
                    ? { resultItem: normalizedItemIdentifier(raw.result_item) }
                    : {}),
                effects
            });
        }

        return accepted({ items, filters, forceUse: booleanAt(value, 'force_use', false) });
    },
    create: (params) => ({
        onInteractWithItem: (entity, itemIdentifier, other) => {
            const normalizedItem = normalizedItemIdentifier(itemIdentifier);
            const item = params.items.find((entry) => entry.item === normalizedItem);
            if (item === undefined) return undefined;

            const heldItem = other?.equipment?.('hand', 0) ?? { identifier: () => normalizedItem };
            const context = {
                ...entity.filterContext(),
                ...(other === undefined ? {} : { other, player: other }),
                item: heldItem
            };
            if (params.filters !== undefined && !evaluateFilter(params.filters, context)) return undefined;

            const health = entity.attributes.get('health');
            if (health === undefined || (health.current >= health.max && !params.forceUse)) return undefined;

            const statusEffects = item.effects.flatMap((effect) => {
                const chance = Math.max(0, Math.min(1, effect.chance));
                if (entity.random.next() >= chance) return [];
                return [
                    {
                        id: effect.name,
                        durationTicks:
                            effect.duration === 'infinite' ? -1 : Math.round(effect.duration * TICKS_PER_SECOND),
                        amplifier: effect.amplifier
                    }
                ];
            });

            return {
                ...(item.healAmount > 0 ? { healthAmount: item.healAmount } : {}),
                ...(item.resultItem === undefined ? {} : { resultItem: item.resultItem }),
                ...(statusEffects.length === 0 ? {} : { statusEffects })
            };
        }
    })
};

/** One item `minecraft:tameable` accepts. */
export interface TameableItemParams {
    /** The item identifier, normalized to the default Minecraft namespace. */
    readonly item: string;
    /** Item replacing the consumed item after a successful tame, if declared. */
    readonly resultItem?: string;
}

/** What `minecraft:tameable` declares. */
export interface TameableParams {
    /** Items that can tame the entity. */
    readonly items: readonly TameableItemParams[];
    /** Probability of taming on each matching item interaction. */
    readonly probability: number;
    /** Event raised after a successful tame. */
    readonly tameEvent?: SensorTrigger;
}

/** `minecraft:tameable`, which owns item matching and its probability roll. */
export const tameable: ComponentFactory<EntityHooks, TameableParams> = {
    name: 'minecraft:tameable',
    hooks: ['onInteractWithItem'],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');

        const items: TameableItemParams[] = [];
        for (const [index, raw] of asList(value.tame_items).entries()) {
            if (typeof raw === 'string') {
                items.push({ item: normalizedItemIdentifier(raw) });
                continue;
            }
            if (!isRecord(raw) || typeof raw.item !== 'string' || raw.item.length === 0)
                return rejected(`tame_items[${index}].item must be a non-empty string`);
            if (raw.result_item !== undefined && (typeof raw.result_item !== 'string' || raw.result_item.length === 0))
                return rejected(`tame_items[${index}].result_item must be a non-empty string`);
            if (
                raw.transform_to_item !== undefined &&
                (typeof raw.transform_to_item !== 'string' || raw.transform_to_item.length === 0)
            )
                return rejected(`tame_items[${index}].transform_to_item must be a non-empty string`);

            const resultItem =
                typeof raw.result_item === 'string'
                    ? raw.result_item
                    : typeof raw.transform_to_item === 'string'
                      ? raw.transform_to_item
                      : undefined;
            items.push({
                item: normalizedItemIdentifier(raw.item),
                ...(resultItem === undefined ? {} : { resultItem: normalizedItemIdentifier(resultItem) })
            });
        }

        const tameEvent = parseComponentTrigger(value.tame_event);
        return accepted({
            items,
            probability: numberAt(value, 'probability', 1),
            ...(tameEvent === undefined ? {} : { tameEvent })
        });
    },
    create: (params) => ({
        onInteractWithItem: (entity, itemIdentifier) => {
            if (entity.filterContext().self.flag?.('is_tamed') === true) return undefined;

            const normalizedItem = normalizedItemIdentifier(itemIdentifier);
            const item = params.items.find((entry) => entry.item === normalizedItem);
            if (item === undefined) return undefined;

            const succeeded = entity.random.next() < Math.min(1, Math.max(0, params.probability));
            const tame: EntityTameInteractionEffect = {
                succeeded,
                ...(succeeded && params.tameEvent?.event !== undefined
                    ? { event: params.tameEvent.event, target: params.tameEvent.target }
                    : {})
            };
            return {
                tame,
                ...(succeeded && item.resultItem !== undefined ? { resultItem: item.resultItem } : {})
            };
        }
    })
};
