/** Sensor components that watch the entity's surroundings and fire events. */

import type { ComponentFactory } from '@jsprismarine/content';
import { accepted, rejected } from '@jsprismarine/content';
import type { Filter } from '@jsprismarine/packs';
import { defineComponentState, stateField } from '../componentState';
import type { EntityInstance } from '../entityInstance';
import { parseEventTarget } from '../events';
import { damagerSubjects, isPlayerView } from '../filterContext';
import { evaluateFilter } from '../filters';
import type { EntityEquipmentSlot, EntityHooks } from '../hooks';
import { TICKS_PER_SECOND } from '../hooks';
import type { TriggerComponentParams } from '../triggers';
import type { ComponentRecord } from './schemas';
import { asList, booleanAt, isRecord, numberAt, parseFilterValue, stringAt } from './schemas';

import type { SensorTrigger } from './shared';
import { parseComponentTrigger, sensorNumber } from './shared';

const parseSensorTriggers = (
    value: unknown,
    label: string
):
    | { readonly ok: true; readonly triggers: readonly SensorTrigger[] }
    | { readonly ok: false; readonly message: string } => {
    const triggers: SensorTrigger[] = [];
    for (const entry of asList(value)) {
        if (!isRecord(entry)) return { ok: false, message: `${label} entries must be objects` };
        let filters: Filter | undefined;
        if (entry.filters !== undefined) {
            const parsed = parseFilterValue(entry.filters, label);
            if (!parsed.ok) return { ok: false, message: parsed.message };
            filters = parsed.value;
        }
        triggers.push({
            filters,
            event: stringAt(entry, 'event'),
            target: parseEventTarget(entry.target, () => undefined)
        });
    }
    return { ok: true, triggers };
};

/** What `minecraft:environment_sensor` declares. */
export interface EnvironmentSensorParams {
    readonly triggers: readonly SensorTrigger[];
}

/**
 * `minecraft:environment_sensor`, which tests the world each tick and fires an
 * event when its filters pass. The zombie's `is_underwater` trigger is what
 * starts the conversion to a drowned.
 */
export const environmentSensor: ComponentFactory<EntityHooks, EnvironmentSensorParams> = {
    name: 'minecraft:environment_sensor',
    hooks: ['onTick'],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        const parsed = parseSensorTriggers(value.triggers, 'minecraft:environment_sensor triggers');
        if (!parsed.ok) return rejected(parsed.message);
        return accepted({ triggers: parsed.triggers });
    },
    create: (params) => ({
        onTick: (entity) => {
            const context = entity.filterContext();
            for (const trigger of params.triggers) {
                if (trigger.event === undefined) continue;
                if (trigger.filters !== undefined && !evaluateFilter(trigger.filters, context)) continue;
                entity.raise(trigger.event, trigger.target, 'minecraft:environment_sensor');
            }
        }
    })
};

/** One range and event rule within `minecraft:entity_sensor.subsensors`. */
export interface EntitySensorSubsensor {
    /** Additional seconds to wait after the base one-tick sensing delay. */
    readonly cooldown: number;
    /** Event to raise when the matching entity count is in range. */
    readonly event?: SensorTrigger;
    /** Filter evaluated with the sensor owner as `self` and each candidate as `other`. */
    readonly eventFilters?: Filter;
    /** Largest matching candidate count, or `-1` for no upper bound. */
    readonly maximumCount: number;
    /** Smallest matching candidate count required to raise the event. */
    readonly minimumCount: number;
    /** Horizontal and vertical search limits, in blocks. */
    readonly range: readonly [horizontal: number, vertical: number];
    /** Whether every nearby candidate must pass `event_filters`. */
    readonly requireAll: boolean;
    /** Vertical offset applied before testing the candidate range. */
    readonly yOffset: number;
}

/** What `minecraft:entity_sensor` declares. */
export interface EntitySensorParams {
    readonly findPlayersOnly: boolean;
    readonly relativeRange: boolean;
    readonly subsensors: readonly EntitySensorSubsensor[];
}

/** Ticks of cooldown left on each `minecraft:entity_sensor` subsensor, by subsensor index. */
const ENTITY_SENSOR_STATE = defineComponentState('minecraft:entity_sensor', {
    cooldowns: stateField.list(stateField.number)
});

const isEntitySensorRange = (value: unknown): value is readonly [number, number] =>
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    Number.isFinite(value[0]) &&
    value[0] >= 0 &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[1]) &&
    value[1] >= 0;

const hasValidSensorBoolean = (record: ComponentRecord, key: string): boolean =>
    record[key] === undefined || typeof record[key] === 'boolean';

const parseEntitySensor = (
    value: unknown
): { readonly ok: true; readonly params: EntitySensorParams } | { readonly ok: false; readonly message: string } => {
    if (!isRecord(value)) return { ok: false, message: 'expected an object' };
    if (!hasValidSensorBoolean(value, 'find_players_only') || !hasValidSensorBoolean(value, 'relative_range'))
        return { ok: false, message: 'find_players_only and relative_range must be booleans' };
    const subsensors: EntitySensorSubsensor[] = [];
    for (const [index, raw] of asList(value.subsensors).entries()) {
        if (!isRecord(raw)) return { ok: false, message: `subsensors[${index}] must be an object` };
        if (!hasValidSensorBoolean(raw, 'require_all'))
            return { ok: false, message: `subsensors[${index}].require_all must be a boolean` };
        const rangeValue = raw.range;
        if (rangeValue !== undefined && !isEntitySensorRange(rangeValue)) {
            return { ok: false, message: `subsensors[${index}].range must be two non-negative numbers` };
        }
        const range: readonly [number, number] = rangeValue ?? [10, 10];
        const maximumCount = sensorNumber(raw, 'maximum_count', -1);
        const minimumCount = sensorNumber(raw, 'minimum_count', 1);
        const cooldown = sensorNumber(raw, 'cooldown', -1);
        const yOffset = sensorNumber(raw, 'y_offset', 0);
        if (maximumCount === undefined || minimumCount === undefined || cooldown === undefined || yOffset === undefined)
            return { ok: false, message: `subsensors[${index}] count, cooldown, and offset values must be finite` };
        if (!Number.isInteger(maximumCount) || !Number.isInteger(minimumCount) || maximumCount < -1 || minimumCount < 0)
            return {
                ok: false,
                message: `subsensors[${index}] counts must be non-negative, with -1 allowed for maximum_count`
            };

        let eventFilters: Filter | undefined;
        if (raw.event_filters !== undefined) {
            const parsed = parseFilterValue(raw.event_filters, `subsensors[${index}].event_filters`);
            if (!parsed.ok) return { ok: false, message: parsed.message };
            eventFilters = parsed.value;
        }
        const event = parseComponentTrigger(raw.event);
        if (raw.event !== undefined && event === undefined)
            return { ok: false, message: `subsensors[${index}].event must name an event` };
        subsensors.push({
            cooldown,
            ...(event === undefined ? {} : { event }),
            ...(eventFilters === undefined ? {} : { eventFilters }),
            maximumCount,
            minimumCount,
            range,
            requireAll: booleanAt(raw, 'require_all', false),
            yOffset
        });
    }
    return {
        ok: true,
        params: {
            findPlayersOnly: booleanAt(value, 'find_players_only', false),
            relativeRange: booleanAt(value, 'relative_range', true),
            subsensors
        }
    };
};

/** `minecraft:entity_sensor`, which emits events when nearby entity filters and count bounds pass. */
export const entitySensor: ComponentFactory<EntityHooks, EntitySensorParams> = {
    name: 'minecraft:entity_sensor',
    hooks: ['onInitialize', 'onTick'],
    schema: (value) => {
        const parsed = parseEntitySensor(value);
        return parsed.ok ? accepted(parsed.params) : rejected(parsed.message);
    },
    create: (params) => {
        return {
            onInitialize: (entity) =>
                entity.componentState.set(ENTITY_SENSOR_STATE, { cooldowns: params.subsensors.map(() => 0) }),
            onTick: (entity) => {
                const state = entity.componentState.get(ENTITY_SENSOR_STATE);
                if (state === undefined) return;
                const cooldowns = [...state.cooldowns];

                for (const [index, subsensor] of params.subsensors.entries()) {
                    const remaining = cooldowns[index] ?? 0;
                    if (remaining > 0) {
                        cooldowns[index] = remaining - 1;
                        continue;
                    }

                    const [horizontalRange, verticalRange] = subsensor.range;
                    const candidates = entity.entitySensorCandidates({
                        horizontalRange,
                        verticalRange,
                        yOffset: subsensor.yOffset,
                        relativeRange: params.relativeRange,
                        findPlayersOnly: params.findPlayersOnly
                    });
                    let matchingCount = 0;
                    for (const candidate of candidates) {
                        const matches =
                            subsensor.eventFilters === undefined ||
                            evaluateFilter(subsensor.eventFilters, {
                                ...entity.filterContext(),
                                other: candidate.view
                            });
                        if (matches) matchingCount += 1;
                        else if (subsensor.requireAll) break;
                    }
                    if (subsensor.requireAll && matchingCount !== candidates.length) continue;
                    if (matchingCount < subsensor.minimumCount) continue;
                    if (subsensor.maximumCount >= 0 && matchingCount > subsensor.maximumCount) continue;
                    if (subsensor.event?.event === undefined) continue;

                    entity.raise(subsensor.event.event, subsensor.event.target, 'minecraft:entity_sensor');
                    if (subsensor.cooldown >= 0) cooldowns[index] = Math.ceil(subsensor.cooldown * TICKS_PER_SECOND);
                }
                entity.componentState.set(ENTITY_SENSOR_STATE, { cooldowns });
            }
        };
    }
};

/** One block identifier and event within `minecraft:block_sensor.on_break`. */
export interface BlockSensorBreak {
    readonly blockList: readonly string[];
    readonly event: string;
}

/** What `minecraft:block_sensor` declares. */
export interface BlockSensorParams {
    /** Maximum distance from the entity, capped at 32 blocks. */
    readonly sensorRadius: number;
    /** Filter the breaker must pass, evaluated with the breaker as `other`. */
    readonly sources?: Filter;
    readonly onBreak: readonly BlockSensorBreak[];
}

/** The largest radius a `minecraft:block_sensor` can search. */
export const MAX_BLOCK_SENSOR_RADIUS = 32;

const parseBlockSensor = (
    value: unknown
): { readonly ok: true; readonly params: BlockSensorParams } | { readonly ok: false; readonly message: string } => {
    if (!isRecord(value)) return { ok: false, message: 'expected an object' };
    const sensorRadius = sensorNumber(value, 'sensor_radius', 16);
    if (sensorRadius === undefined || sensorRadius < 0)
        return { ok: false, message: 'sensor_radius must be a non-negative number' };

    const onBreak: BlockSensorBreak[] = [];
    for (const [index, raw] of asList(value.on_break).entries()) {
        if (!isRecord(raw)) return { ok: false, message: `on_break[${index}] must be an object` };
        const blockList = raw.block_list;
        if (
            !Array.isArray(blockList) ||
            !blockList.every((block): block is string => typeof block === 'string' && block.length > 0)
        )
            return { ok: false, message: `on_break[${index}].block_list must be an array of block identifiers` };
        const event = stringAt(raw, 'on_block_broken');
        if (event === undefined) return { ok: false, message: `on_break[${index}].on_block_broken must name an event` };
        onBreak.push({ blockList, event });
    }

    let sources: Filter | undefined;
    if (value.sources !== undefined) {
        const parsed = parseFilterValue(value.sources, 'minecraft:block_sensor sources');
        if (!parsed.ok) return { ok: false, message: parsed.message };
        sources = parsed.value;
    }
    return {
        ok: true,
        params: {
            sensorRadius: Math.min(sensorRadius, MAX_BLOCK_SENSOR_RADIUS),
            ...(sources === undefined ? {} : { sources }),
            onBreak
        }
    };
};

/** `minecraft:block_sensor`, which raises events for matching nearby block breaks. */
export const blockSensor: ComponentFactory<EntityHooks, BlockSensorParams> = {
    name: 'minecraft:block_sensor',
    hooks: ['onBlockBroken'],
    schema: (value) => {
        const parsed = parseBlockSensor(value);
        return parsed.ok ? accepted(parsed.params) : rejected(parsed.message);
    },
    create: (params) => ({
        onBlockBroken: (entity, broken) => {
            const position = entity.actuator?.position();
            if (position === undefined) return;
            const blockCenter = {
                x: broken.position.x + 0.5,
                y: broken.position.y + 0.5,
                z: broken.position.z + 0.5
            };
            if (
                Math.hypot(position.x - blockCenter.x, position.y - blockCenter.y, position.z - blockCenter.z) >
                params.sensorRadius
            )
                return;
            if (params.sources !== undefined && broken.source === undefined) return;

            const context = {
                ...entity.filterContext(),
                block: broken.block,
                ...(broken.source === undefined
                    ? {}
                    : {
                          other: broken.source,
                          ...(isPlayerView(broken.source) ? { player: broken.source } : {})
                      })
            };
            if (params.sources !== undefined && !evaluateFilter(params.sources, context)) return;

            for (const entry of params.onBreak)
                if (entry.blockList.includes(broken.block.identifier())) entity.fire(entry.event);
        }
    })
};

/** One block state and its enter and exit events in `minecraft:inside_block_notifier`. */
export interface InsideBlockNotifierEntry {
    /** The block identifier to watch. */
    readonly blockName: string;
    /** Boolean block states that must match; omitted states accept every state. */
    readonly states: Readonly<Record<string, boolean>>;
    /** Event raised when the entity enters a matching block. */
    readonly enteredBlockEvent?: SensorTrigger;
    /** Event raised when the entity leaves a matching block. */
    readonly exitedBlockEvent?: SensorTrigger;
}

/** What `minecraft:inside_block_notifier` declares. */
export interface InsideBlockNotifierParams {
    readonly blockList: readonly InsideBlockNotifierEntry[];
}

const parseInsideBlockNotifier = (
    value: unknown
):
    | { readonly ok: true; readonly params: InsideBlockNotifierParams }
    | { readonly ok: false; readonly message: string } => {
    if (!isRecord(value)) return { ok: false, message: 'expected an object' };
    const blockList: InsideBlockNotifierEntry[] = [];
    for (const [index, raw] of asList(value.block_list).entries()) {
        if (!isRecord(raw) || !isRecord(raw.block))
            return { ok: false, message: `block_list[${index}].block must be an object` };
        const blockName = stringAt(raw.block, 'name');
        if (blockName === undefined || blockName.length === 0)
            return { ok: false, message: `block_list[${index}].block.name must name a block` };

        const states: Record<string, boolean> = {};
        if (raw.block.states !== undefined) {
            if (!isRecord(raw.block.states))
                return { ok: false, message: `block_list[${index}].block.states must be an object` };
            for (const [name, state] of Object.entries(raw.block.states)) {
                if (typeof state !== 'boolean')
                    return { ok: false, message: `block_list[${index}].block.states values must be booleans` };
                states[name] = state;
            }
        }

        const enteredBlockEvent =
            raw.entered_block_event === undefined ? undefined : parseComponentTrigger(raw.entered_block_event);
        if (raw.entered_block_event !== undefined && enteredBlockEvent === undefined)
            return { ok: false, message: `block_list[${index}].entered_block_event must name an event` };
        const exitedBlockEvent =
            raw.exited_block_event === undefined ? undefined : parseComponentTrigger(raw.exited_block_event);
        if (raw.exited_block_event !== undefined && exitedBlockEvent === undefined)
            return { ok: false, message: `block_list[${index}].exited_block_event must name an event` };

        blockList.push({
            blockName,
            states,
            ...(enteredBlockEvent === undefined ? {} : { enteredBlockEvent }),
            ...(exitedBlockEvent === undefined ? {} : { exitedBlockEvent })
        });
    }
    return { ok: true, params: { blockList } };
};

/** The `block_list` indices whose block the entity was inside on its last tick. */
const INSIDE_BLOCK_STATE = defineComponentState('minecraft:inside_block_notifier', {
    inside: stateField.list(stateField.number)
});

/** `minecraft:inside_block_notifier`, which raises events on block-state transitions. */
export const insideBlockNotifier: ComponentFactory<EntityHooks, InsideBlockNotifierParams> = {
    name: 'minecraft:inside_block_notifier',
    hooks: ['onInitialize', 'onTick'],
    schema: (value) => {
        const parsed = parseInsideBlockNotifier(value);
        return parsed.ok ? accepted(parsed.params) : rejected(parsed.message);
    },
    create: (params) => ({
        onInitialize: (entity) => entity.componentState.set(INSIDE_BLOCK_STATE, { inside: [] }),
        onTick: (entity) => {
            const previous = entity.componentState.get(INSIDE_BLOCK_STATE)?.inside;
            const position = entity.actuator?.position();
            if (previous === undefined || position === undefined) return;

            const collisionBox = entity.componentParams('minecraft:collision_box');
            const width = isRecord(collisionBox) ? numberAt(collisionBox, 'width', 1) : 1;
            const height = isRecord(collisionBox) ? numberAt(collisionBox, 'height', 1) : 1;
            const minX = Math.floor(position.x - width / 2);
            const maxX = Math.ceil(position.x + width / 2) - 1;
            const minY = Math.floor(position.y);
            const maxY = Math.ceil(position.y + height) - 1;
            const minZ = Math.floor(position.z - width / 2);
            const maxZ = Math.ceil(position.z + width / 2) - 1;
            const blocks: Array<ReturnType<EntityInstance['blockAt']>> = [];
            let unknownBlock = false;
            for (let x = minX; x <= maxX; x += 1) {
                for (let y = minY; y <= maxY; y += 1) {
                    for (let z = minZ; z <= maxZ; z += 1) {
                        const block = entity.blockAt({ x, y, z });
                        blocks.push(block);
                        if (block === undefined) unknownBlock = true;
                    }
                }
            }

            const next: number[] = [];
            for (const [index, entry] of params.blockList.entries()) {
                const matches = blocks.some(
                    (block) =>
                        block !== undefined &&
                        block.identifier === entry.blockName &&
                        Object.entries(entry.states).every(([name, expected]) => block.states[name] === expected)
                );
                const wasInside = previous.includes(index);
                if (matches) {
                    next.push(index);
                    if (!wasInside && entry.enteredBlockEvent?.event !== undefined)
                        entity.raise(
                            entry.enteredBlockEvent.event,
                            entry.enteredBlockEvent.target,
                            'minecraft:inside_block_notifier'
                        );
                } else if (wasInside && !unknownBlock && entry.exitedBlockEvent?.event !== undefined) {
                    entity.raise(
                        entry.exitedBlockEvent.event,
                        entry.exitedBlockEvent.target,
                        'minecraft:inside_block_notifier'
                    );
                } else if (wasInside && unknownBlock) {
                    next.push(index);
                }
            }
            entity.componentState.set(INSIDE_BLOCK_STATE, { inside: next });
        }
    })
};

/** What `minecraft:target_nearby_sensor` declares. */
export interface TargetNearbySensorParams {
    readonly insideRange: number;
    readonly outsideRange: number;
    readonly mustSee: boolean;
    readonly onInsideRange?: SensorTrigger;
    readonly onOutsideRange?: SensorTrigger;
    readonly onVisionLostInsideRange?: SensorTrigger;
}

/** What `minecraft:target_nearby_sensor` remembers about the target it last saw. */
const TARGET_NEARBY_STATE = defineComponentState('minecraft:target_nearby_sensor', {
    /** The target's id, or null when there was none. */
    targetId: stateField.nullable(stateField.id),
    inRange: stateField.boolean,
    visibleInsideRange: stateField.boolean,
    insideEventFired: stateField.boolean
});

/** A working copy of {@link TARGET_NEARBY_STATE} that one tick updates before writing it back. */
interface TargetNearbySensorState {
    targetId: string | number | null;
    inRange: boolean;
    visibleInsideRange: boolean;
    insideEventFired: boolean;
}

const raiseTargetNearbyEvent = (entity: EntityInstance, trigger: SensorTrigger | undefined): void => {
    if (trigger?.event !== undefined) entity.raise(trigger.event, trigger.target, 'minecraft:target_nearby_sensor');
};

/**
 * `minecraft:target_nearby_sensor`, which changes behavior as the current
 * target enters or leaves its hysteresis range, or loses visibility inside.
 */
export const targetNearbySensor: ComponentFactory<EntityHooks, TargetNearbySensorParams> = {
    name: 'minecraft:target_nearby_sensor',
    hooks: ['onInitialize', 'onTick'],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        return accepted({
            insideRange: numberAt(value, 'inside_range', 1),
            outsideRange: numberAt(value, 'outside_range', 5),
            mustSee: booleanAt(value, 'must_see', false),
            onInsideRange: parseComponentTrigger(value.on_inside_range),
            onOutsideRange: parseComponentTrigger(value.on_outside_range),
            onVisionLostInsideRange: parseComponentTrigger(value.on_vision_lost_inside_range)
        });
    },
    create: (params) => {
        /** One tick of the sensor over a working copy of its state. */
        const update = (entity: EntityInstance, state: TargetNearbySensorState): void => {
            const target = entity.targetProximity();
            const targetId = target?.id ?? null;
            if (state.targetId !== targetId) {
                if (state.inRange) raiseTargetNearbyEvent(entity, params.onOutsideRange);
                state.targetId = targetId;
                state.inRange = false;
                state.visibleInsideRange = false;
                state.insideEventFired = false;
            }
            if (target === undefined) return;

            if (target.distance > params.outsideRange) {
                if (state.inRange) raiseTargetNearbyEvent(entity, params.onOutsideRange);
                state.inRange = false;
                state.visibleInsideRange = false;
                state.insideEventFired = false;
                return;
            }
            if (target.distance > params.insideRange) {
                state.visibleInsideRange = false;
                return;
            }

            state.inRange = true;
            if (state.visibleInsideRange && !target.visible)
                raiseTargetNearbyEvent(entity, params.onVisionLostInsideRange);
            state.visibleInsideRange = target.visible;

            if (params.mustSee && !target.visible) {
                state.insideEventFired = false;
                return;
            }
            if (state.insideEventFired) return;

            raiseTargetNearbyEvent(entity, params.onInsideRange);
            state.insideEventFired = true;
        };
        return {
            onInitialize: (entity) => {
                entity.componentState.set(TARGET_NEARBY_STATE, {
                    targetId: null,
                    inRange: false,
                    visibleInsideRange: false,
                    insideEventFired: false
                });
            },
            onTick: (entity) => {
                const saved = entity.componentState.get(TARGET_NEARBY_STATE);
                if (saved === undefined) return;
                const state = { ...saved };
                update(entity, state);
                entity.componentState.set(TARGET_NEARBY_STATE, state);
            }
        };
    }
};

/** How a `minecraft:damage_sensor` trigger changes the damage it sees. */
export const DEALS_DAMAGE = ['yes', 'no', 'no_but_side_effects_apply', 'no_but_entity_effects_apply'] as const;

/** One of {@link DEALS_DAMAGE}. */
export type DealsDamage = (typeof DEALS_DAMAGE)[number];

/** One `minecraft:damage_sensor` trigger. */
export interface DamageSensorTrigger {
    /** The damage cause it answers for, or `any`. */
    readonly cause: string;
    readonly dealsDamage: DealsDamage;
    readonly damageMultiplier: number;
    readonly filters?: Filter;
    readonly event?: string;
}

/** What `minecraft:damage_sensor` declares. */
export interface DamageSensorParams {
    readonly triggers: readonly DamageSensorTrigger[];
}

const parseDealsDamage = (value: unknown): DealsDamage => {
    if (value === true) return 'yes';
    if (value === false) return 'no';
    return DEALS_DAMAGE.find((name) => name === value) ?? 'yes';
};

/**
 * `minecraft:damage_sensor`, which decides what one damage cause does and
 * fires an event when it lands.
 *
 * The first trigger whose cause and filters match answers, which is why the
 * hook returns a value: `dispatchFirst` stops there.
 */
export const damageSensor: ComponentFactory<EntityHooks, DamageSensorParams> = {
    name: 'minecraft:damage_sensor',
    hooks: ['onDamage'],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        const triggers: DamageSensorTrigger[] = [];
        for (const entry of asList(value.triggers)) {
            if (!isRecord(entry)) return rejected('minecraft:damage_sensor triggers must be objects');
            const inner = isRecord(entry.on_damage) ? entry.on_damage : {};
            let filters: Filter | undefined;
            if (inner.filters !== undefined) {
                const parsed = parseFilterValue(inner.filters, 'minecraft:damage_sensor on_damage');
                if (!parsed.ok) return parsed;
                filters = parsed.value;
            }
            triggers.push({
                cause: stringAt(entry, 'cause') ?? 'any',
                dealsDamage: parseDealsDamage(entry.deals_damage),
                damageMultiplier: numberAt(entry, 'damage_multiplier', 1),
                filters,
                event: stringAt(inner, 'event')
            });
        }
        return accepted({ triggers });
    },
    create: (params) => ({
        onDamage: (entity, damage) => {
            const context = { ...entity.filterContext(), ...damagerSubjects(damage.damager) };
            for (const trigger of params.triggers) {
                if (trigger.cause !== 'any' && trigger.cause !== damage.cause) continue;
                if (trigger.filters !== undefined && !evaluateFilter(trigger.filters, context)) continue;
                const events = trigger.event === undefined ? [] : [trigger.event];
                for (const event of events) entity.fire(event);
                const amount = trigger.dealsDamage === 'yes' ? damage.amount * trigger.damageMultiplier : 0;
                return { amount, events };
            }
            return undefined;
        }
    })
};

/**
 * Builds one of the ten event-shaped `minecraft:on_*` components.
 *
 * The component carries no hooks because it runs at a fixed point rather than
 * on a schedule of its own. {@link EntityInstance.trigger} reads the parsed
 * body back and fires it, which is what makes the component do something:
 * `minecraft:damage_sensor` and {@link EntityInstance.damage} reach the hurt
 * and death ones, and {@link EntityInstance.setAttackTarget} reaches the two
 * target ones.
 */
export const triggerComponent = (name: string): ComponentFactory<EntityHooks, TriggerComponentParams> => ({
    name,
    hooks: [],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        let filters: Filter | undefined;
        if (value.filters !== undefined) {
            const parsed = parseFilterValue(value.filters, name);
            if (!parsed.ok) return parsed;
            filters = parsed.value;
        }
        const target = parseEventTarget(value.target, () => undefined);
        return accepted({ event: stringAt(value, 'event'), target, filters });
    },
    create: () => ({})
});

/** One slot watched by `minecraft:on_equipment_changed`. */
export interface EquipmentChangedSlot {
    /** The default equipment slot, using Bedrock's fully qualified name. */
    readonly slot: EntityEquipmentSlot;
    /** Event raised when an item is placed into the slot. */
    readonly onEquip?: string;
    /** Event raised when the slot is cleared. */
    readonly onUnequip?: string;
}

/** What `minecraft:on_equipment_changed` declares. */
export interface EquipmentChangedParams {
    /** Slot rules in source order; the first matching rule decides each change. */
    readonly slots: readonly EquipmentChangedSlot[];
}

const EQUIPMENT_CHANGED_SLOTS: readonly EntityEquipmentSlot[] = [
    'slot.armor.body',
    'slot.armor.chest',
    'slot.armor.feet',
    'slot.armor.head',
    'slot.armor.legs',
    'slot.weapon.mainhand',
    'slot.weapon.offhand'
];

/** `minecraft:on_equipment_changed`, with a distinct event for equip and unequip per slot. */
export const equipmentChanged: ComponentFactory<EntityHooks, EquipmentChangedParams> = {
    name: 'minecraft:on_equipment_changed',
    hooks: ['onEquipmentChanged'],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        if (value.slots !== undefined && !Array.isArray(value.slots)) return rejected('slots must be an array');

        const slots: EquipmentChangedSlot[] = [];
        for (const raw of asList(value.slots)) {
            if (!isRecord(raw)) return rejected('each slots entry must be an object');
            if (raw.on_equip !== undefined && typeof raw.on_equip !== 'string')
                return rejected('on_equip must be a string');
            if (raw.on_unequip !== undefined && typeof raw.on_unequip !== 'string')
                return rejected('on_unequip must be a string');

            if (raw.slot !== undefined && typeof raw.slot !== 'string') return rejected('slot must be a string');
            const requestedSlot = typeof raw.slot === 'string' ? raw.slot : 'slot.weapon.mainhand';
            const slot = EQUIPMENT_CHANGED_SLOTS.find((candidate) => candidate === requestedSlot);
            if (slot === undefined) return rejected(`unsupported equipment slot ${requestedSlot}`);

            slots.push({
                slot,
                ...(typeof raw.on_equip === 'string' ? { onEquip: raw.on_equip } : {}),
                ...(typeof raw.on_unequip === 'string' ? { onUnequip: raw.on_unequip } : {})
            });
        }

        return accepted({ slots });
    },
    create: (params) => ({
        onEquipmentChanged: (entity, slot, equipped) => {
            const rule = params.slots.find((candidate) => candidate.slot === slot);
            const event = equipped ? rule?.onEquip : rule?.onUnequip;
            if (event !== undefined) entity.fire(event);
        }
    })
};
