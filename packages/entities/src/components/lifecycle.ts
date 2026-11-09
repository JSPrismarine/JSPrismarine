/** Components that run on a clock or change what an entity is: despawning, timers, laying, growing up, ambient sounds and transformation. */

import type { ComponentFactory } from '@jsprismarine/content';
import { accepted, rejected } from '@jsprismarine/content';
import type { Filter } from '@jsprismarine/packs';
import type { EntityInstance } from '../entityInstance';
import { splitSpawnReference } from '../eventEngine';
import type { FilterItemView } from '../filterContext';
import { evaluateFilter } from '../filters';
import type { EntityHooks } from '../hooks';
import { TICKS_PER_SECOND } from '../hooks';
import type { EntitySpawnRequest } from '../hooks';
import type { ComponentRecord } from './schemas';
import { asList, booleanAt, isRecord, numberAt, parseFilterValue, stringAt } from './schemas';

import type { IntervalState, SensorTrigger } from './shared';
import { normalizedItemIdentifier, parseComponentTrigger, parseTimeRange, qualifiedSpawnIdentifier } from './shared';

/** What `minecraft:despawn` declares. */
export interface DespawnParams {
    /** When set, the entity despawns as soon as the filters pass and the distance rules do not apply. */
    readonly filters?: Filter;
    readonly minDistance: number;
    readonly maxDistance: number;
    /** One in this many ticks, the entity beyond `minDistance` rolls to despawn. */
    readonly minRangeRandomChance: number;
    readonly removeChildEntities: boolean;
}

/**
 * `minecraft:despawn`, carried by 76 vanilla entities and written as the
 * empty default by 67 of them.
 *
 * With `filters`, the entity despawns as soon as they pass. Without them, the
 * standard rules apply: anything past `max_distance` goes at once, and
 * anything past `min_distance` rolls `min_range_random_chance` each tick.
 */
export const despawn: ComponentFactory<EntityHooks, DespawnParams> = {
    name: 'minecraft:despawn',
    hooks: ['onTick'],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        const distance = isRecord(value.despawn_from_distance) ? value.despawn_from_distance : {};
        let filters: Filter | undefined;
        if (value.filters !== undefined) {
            const parsed = parseFilterValue(value.filters, 'minecraft:despawn filters');
            if (!parsed.ok) return parsed;
            filters = parsed.value;
        }
        return accepted({
            filters,
            minDistance: numberAt(distance, 'min_distance', 32),
            maxDistance: numberAt(distance, 'max_distance', 128),
            minRangeRandomChance: numberAt(value, 'min_range_random_chance', 800),
            removeChildEntities: booleanAt(value, 'remove_child_entities', false)
        });
    },
    create: (params) => ({
        onTick: (entity) => {
            // A named or tamed mob carries `minecraft:persistent`, and the
            // documented rule is that it never despawns, filters or not.
            if (entity.hasComponent('minecraft:persistent')) return;
            if (params.filters !== undefined) {
                if (evaluateFilter(params.filters, entity.filterContext())) entity.remove('despawn filters passed');
                return;
            }
            const distance = entity.filterContext().self.measure?.('distance_to_nearest_player');
            if (distance === undefined) return;
            if (distance > params.maxDistance) {
                entity.remove('despawn beyond max_distance');
                return;
            }
            if (distance <= params.minDistance || params.minRangeRandomChance <= 0) return;
            if (entity.random.next() * params.minRangeRandomChance < 1)
                entity.remove('despawn roll beyond min_distance');
        }
    })
};

/** `minecraft:instant_despawn`, which removes the entity the moment it becomes active. */
export const instantDespawn: ComponentFactory<EntityHooks, ComponentRecord> = {
    name: 'minecraft:instant_despawn',
    hooks: ['onInitialize'],
    schema: (value) => (isRecord(value) ? accepted(value) : rejected('expected an object')),
    create: () => ({
        onInitialize: (entity) => entity.remove('minecraft:instant_despawn')
    })
};

/** One weighted entry of `minecraft:timer.random_time_choices`. */
export interface TimerChoice {
    readonly weight: number;
    readonly value: number;
}

/** What `minecraft:timer` declares. */
export interface TimerParams {
    /** How long the timer runs, in seconds, as a fixed value or a `[min, max]` pair. */
    readonly time: readonly [number, number];
    readonly looping: boolean;
    readonly randomInterval: boolean;
    /** Weighted durations the timer draws from instead of `time`. */
    readonly choices: readonly TimerChoice[];
    /** The event the timer fires when it runs out, with whom it fires on. */
    readonly down?: SensorTrigger;
}

interface TimerState {
    remaining: number;
}

/**
 * `minecraft:timer`, which fires an event after a delay.
 *
 * Timing restarts on initialize, which is exactly the documented behavior of
 * re-adding a group: "an already-added `minecraft:timer` that is added again
 * will start its timing logic over".
 */
export const timer: ComponentFactory<EntityHooks, TimerParams> = {
    name: 'minecraft:timer',
    hooks: ['onInitialize', 'onTick'],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        const choices = asList(value.random_time_choices)
            .filter(isRecord)
            .map((choice) => ({ weight: numberAt(choice, 'weight', 1), value: numberAt(choice, 'value', 0) }));
        return accepted({
            time: parseTimeRange(value.time),
            looping: booleanAt(value, 'looping', true),
            randomInterval: booleanAt(value, 'randomInterval', true),
            choices,
            down: parseComponentTrigger(value.time_down_event)
        });
    },
    create: (params) => {
        const states = new WeakMap<EntityInstance, TimerState>();
        const draw = (entity: EntityInstance): number => {
            if (params.choices.length > 0) {
                const total = params.choices.reduce((sum, choice) => sum + Math.max(0, choice.weight), 0);
                let roll = entity.random.next() * total;
                for (const choice of params.choices) {
                    roll -= Math.max(0, choice.weight);
                    if (roll < 0) return choice.value;
                }
                return params.choices[params.choices.length - 1]!.value;
            }
            const [min, max] = params.time;
            const seconds = params.randomInterval && max > min ? min + entity.random.next() * (max - min) : min;
            return seconds;
        };

        return {
            onInitialize: (entity) => {
                states.set(entity, { remaining: Math.round(draw(entity) * TICKS_PER_SECOND) });
            },
            onTick: (entity) => {
                const state = states.get(entity);
                if (state === undefined) return;
                state.remaining -= 1;
                if (state.remaining > 0) return;
                if (params.down?.event !== undefined)
                    entity.raise(params.down.event, params.down.target, 'minecraft:timer');
                if (params.looping) state.remaining = Math.round(draw(entity) * TICKS_PER_SECOND);
                else states.delete(entity);
            }
        };
    }
};

/** One entity or item configured in `minecraft:spawn_entity.entities`. */
interface SpawnEntityEntry {
    readonly request: EntitySpawnRequest;
    readonly minWait: number;
    readonly maxWait: number;
    readonly singleUse: boolean;
    readonly filters?: Filter;
}

/** The spawn entries active on one entity. */
interface SpawnEntityState {
    readonly remaining: number[];
    readonly used: Set<number>;
}

/** What `minecraft:spawn_entity` declares. */
export interface SpawnEntityParams {
    readonly entries: readonly SpawnEntityEntry[];
}

/** Draws an entry's next wait in server ticks. */
const spawnWaitTicks = (entity: EntityInstance, entry: SpawnEntityEntry): number => {
    const seconds =
        entry.minWait < entry.maxWait
            ? entry.minWait + entity.random.next() * (entry.maxWait - entry.minWait)
            : entry.minWait;
    return Math.max(0, Math.round(seconds * TICKS_PER_SECOND));
};

/**
 * `minecraft:spawn_entity`, which periodically creates the configured item or entity.
 *
 * Its schedule belongs to the active component instance: removing its group clears the clock,
 * and adding it again starts a new one.
 */
export const spawnEntity: ComponentFactory<EntityHooks, SpawnEntityParams> = {
    name: 'minecraft:spawn_entity',
    hooks: ['onInitialize', 'onRemove', 'onTick'],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');

        const entries: SpawnEntityEntry[] = [];
        for (const raw of asList(value.entities)) {
            if (!isRecord(raw)) return rejected('minecraft:spawn_entity entities must be objects');

            const entityIdentifier = stringAt(raw, 'spawn_entity');
            const itemIdentifier = stringAt(raw, 'spawn_item') ?? (entityIdentifier === undefined ? 'egg' : undefined);
            if (entityIdentifier === undefined && itemIdentifier === undefined)
                return rejected('minecraft:spawn_entity entries need spawn_entity or spawn_item');

            const filters =
                raw.filters === undefined ? undefined : parseFilterValue(raw.filters, 'minecraft:spawn_entity');
            if (filters !== undefined && !filters.ok) return filters;

            const minWait = numberAt(raw, 'min_wait_time', 300);
            const maxWait = numberAt(raw, 'max_wait_time', 600);
            const count = Math.max(1, Math.floor(numberAt(raw, 'num_to_spawn', 1)));
            const sound = stringAt(raw, 'spawn_sound') ?? 'plop';
            if (entityIdentifier !== undefined) {
                const spawnMethod = stringAt(raw, 'spawn_method');
                entries.push({
                    request: {
                        kind: 'entity',
                        identifier: qualifiedSpawnIdentifier(entityIdentifier),
                        count,
                        cause: spawnMethod === 'spawned' ? 'spawned' : 'born',
                        event: stringAt(raw, 'spawn_event') ?? 'minecraft:entity_born',
                        shouldLeash: booleanAt(raw, 'should_leash', false),
                        sound
                    },
                    minWait: Math.min(minWait, maxWait),
                    maxWait: Math.max(minWait, maxWait),
                    singleUse: booleanAt(raw, 'single_use', false),
                    ...(filters === undefined ? {} : { filters: filters.value })
                });
            } else if (itemIdentifier !== undefined) {
                const itemEvent = parseComponentTrigger(raw.spawn_item_event);
                entries.push({
                    request: {
                        kind: 'item',
                        identifier: qualifiedSpawnIdentifier(itemIdentifier),
                        count,
                        ...(itemEvent?.event === undefined
                            ? {}
                            : { itemEvent: { event: itemEvent.event, target: itemEvent.target } }),
                        sound
                    },
                    minWait: Math.min(minWait, maxWait),
                    maxWait: Math.max(minWait, maxWait),
                    singleUse: booleanAt(raw, 'single_use', false),
                    ...(filters === undefined ? {} : { filters: filters.value })
                });
            }
        }

        return accepted({ entries });
    },
    create: (params) => {
        const states = new WeakMap<EntityInstance, SpawnEntityState>();
        return {
            onInitialize: (entity) => {
                states.set(entity, {
                    remaining: params.entries.map((entry) => spawnWaitTicks(entity, entry)),
                    used: new Set()
                });
            },
            onRemove: (entity) => states.delete(entity),
            onTick: (entity) => {
                const state = states.get(entity);
                if (state === undefined) return;

                for (const [index, entry] of params.entries.entries()) {
                    if (state.used.has(index)) continue;
                    state.remaining[index] = Math.max(0, state.remaining[index]! - 1);
                    if (state.remaining[index]! > 0) continue;

                    if (entry.filters !== undefined && !evaluateFilter(entry.filters, entity.filterContext())) {
                        state.remaining[index] = spawnWaitTicks(entity, entry);
                        continue;
                    }

                    const spawned = entity.requestSpawn(entry.request);
                    if (entry.singleUse && spawned) state.used.add(index);
                    else state.remaining[index] = spawnWaitTicks(entity, entry);
                }
            }
        };
    }
};

/** What `minecraft:ageable` declares. */
export interface AgeableParams {
    /** How long the baby takes to grow up, in seconds; vanilla writes 1200 in all but one body. */
    readonly duration: number;
    /** The event fired when the entity finishes growing. */
    readonly growUp?: SensorTrigger;
    /** The event fired when one of `pause_growth_items` is used. */
    readonly pauseGrowth?: SensorTrigger;
    /** The event fired when one of `reset_growth_items` is used. */
    readonly resetGrowth?: SensorTrigger;
    /** Items that feed the baby, and the fraction of its remaining growth time each item advances. */
    readonly feedItems: readonly unknown[];
    /** Items that pause growth when fed to the baby. */
    readonly pauseGrowthItems: readonly unknown[];
    /** Items that reset the countdown when fed to the baby. */
    readonly resetGrowthItems: readonly unknown[];
    /** Items dropped when the entity grows up. */
    readonly dropItems: readonly unknown[];
    /** Gates the feeding interaction. */
    readonly interactFilters?: Filter;
}

/** Reads the identifier from a string or object ageable item entry. */
const ageableItemIdentifier = (item: unknown): string | undefined =>
    typeof item === 'string' ? item : isRecord(item) && typeof item.item === 'string' ? item.item : undefined;

/** Whether an ageable item list names the held item. */
const ageableItemMatches = (items: readonly unknown[], normalizedItem: string): boolean =>
    items.some((item) => {
        const identifier = ageableItemIdentifier(item);
        return identifier !== undefined && normalizedItemIdentifier(identifier) === normalizedItem;
    });

/** Reads the replacement stack a feed item declares. */
const ageableResultItem = (item: unknown): string | undefined => {
    if (!isRecord(item)) return undefined;
    const result =
        typeof item.result_item === 'string'
            ? item.result_item
            : typeof item.transform_to_item === 'string'
              ? item.transform_to_item
              : undefined;
    return result === undefined ? undefined : normalizedItemIdentifier(result);
};

interface AgeableState {
    remaining: number;
    paused: boolean;
}

/**
 * `minecraft:ageable`, carried by the baby group of 35 vanilla entities.
 *
 * The countdown runs while the component is active and fires `grow_up` when it
 * runs out, which is the event that swaps the baby group for the adult one.
 * Feeding, pausing, and resetting are routed through the active component, so
 * their item, event, timer, and filter data stay attached to the behavior that
 * owns the timer.
 */
export const ageable: ComponentFactory<EntityHooks, AgeableParams> = {
    name: 'minecraft:ageable',
    hooks: ['onInitialize', 'onRemove', 'onTick', 'onInteractWithItem'],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        let interactFilters: Filter | undefined;
        if (value.interact_filters !== undefined) {
            const parsed = parseFilterValue(value.interact_filters, 'minecraft:ageable interact_filters');
            if (!parsed.ok) return parsed;
            interactFilters = parsed.value;
        }
        return accepted({
            duration: numberAt(value, 'duration', 1200),
            growUp: parseComponentTrigger(value.grow_up),
            pauseGrowth: parseComponentTrigger(value.pause_growth),
            resetGrowth: parseComponentTrigger(value.reset_growth),
            feedItems: asList(value.feed_items),
            pauseGrowthItems: asList(value.pause_growth_items),
            resetGrowthItems: asList(value.reset_growth_items),
            dropItems: asList(value.drop_items),
            interactFilters
        });
    },
    create: (params) => {
        const states = new WeakMap<EntityInstance, AgeableState>();
        const durationTicks = params.duration < 0 ? -1 : Math.round(params.duration * TICKS_PER_SECOND);
        return {
            onInitialize: (entity) => {
                states.set(entity, { remaining: durationTicks, paused: false });
            },
            onRemove: (entity) => states.delete(entity),
            onInteractWithItem: (entity, itemIdentifier, other) => {
                const state = states.get(entity);
                if (state === undefined) return undefined;

                const normalizedItem = normalizedItemIdentifier(itemIdentifier);
                const pausesGrowth = ageableItemMatches(params.pauseGrowthItems, normalizedItem);
                const resetsGrowth = ageableItemMatches(params.resetGrowthItems, normalizedItem);
                const feedItem = params.feedItems.find((entry) => {
                    const identifier = ageableItemIdentifier(entry);
                    return identifier !== undefined && normalizedItemIdentifier(identifier) === normalizedItem;
                });
                if (!pausesGrowth && !resetsGrowth && (feedItem === undefined || state.remaining < 0)) return undefined;

                if (params.interactFilters !== undefined) {
                    const item: FilterItemView = { identifier: () => normalizedItem };
                    const subjects = other === undefined ? {} : { other, player: other };
                    if (
                        !evaluateFilter(params.interactFilters, {
                            ...entity.filterContext(),
                            ...subjects,
                            item
                        })
                    )
                        return undefined;
                }

                // Vanilla lists golden dandelion in both fields, so reset first and leave it paused.
                if (resetsGrowth) {
                    state.remaining = durationTicks;
                    if (params.resetGrowth?.event !== undefined)
                        entity.raise(params.resetGrowth.event, params.resetGrowth.target, 'minecraft:ageable');
                }
                if (pausesGrowth) {
                    state.paused = true;
                    if (params.pauseGrowth?.event !== undefined)
                        entity.raise(params.pauseGrowth.event, params.pauseGrowth.target, 'minecraft:ageable');
                }
                if (feedItem !== undefined && state.remaining >= 0) {
                    const growth = isRecord(feedItem) && typeof feedItem.growth === 'number' ? feedItem.growth : 0.1;
                    const secondsUntilAdult = Math.trunc(state.remaining / TICKS_PER_SECOND);
                    const secondsToAdvance = Math.trunc(secondsUntilAdult * Math.fround(growth));
                    state.remaining = Math.max(0, state.remaining - secondsToAdvance * TICKS_PER_SECOND);
                }
                const resultItem = ageableResultItem(feedItem);
                return resultItem === undefined ? true : { resultItem };
            },
            onTick: (entity) => {
                const state = states.get(entity);
                if (state === undefined || state.remaining < 0 || (state.paused && state.remaining > 0)) return;
                if (!state.paused) state.remaining -= 1;
                if (state.remaining > 0) return;
                states.delete(entity);
                for (const item of params.dropItems) {
                    const identifier = ageableItemIdentifier(item);
                    if (identifier === undefined) continue;
                    entity.requestSpawn(
                        { kind: 'item', identifier: normalizedItemIdentifier(identifier), count: 1 },
                        'minecraft:ageable'
                    );
                }
                if (params.growUp?.event !== undefined)
                    entity.raise(params.growUp.event, params.growUp.target, 'minecraft:ageable');
            }
        };
    }
};

/** One `{condition, event_name}` entry of `minecraft:ambient_sound_interval.event_names`. */
export interface AmbientSoundChoice {
    /** A Molang expression; the first entry whose condition holds wins. */
    readonly condition?: string;
    readonly eventName: string;
}

/** What `minecraft:ambient_sound_interval` declares. */
export interface AmbientSoundIntervalParams {
    /** The shortest wait between sounds, in seconds. */
    readonly value: number;
    /** How many more seconds the engine may add to the wait. */
    readonly range: number;
    /** The sound played when no conditional entry holds. */
    readonly eventName: string;
    readonly choices: readonly AmbientSoundChoice[];
}

/**
 * `minecraft:ambient_sound_interval`, carried by 32 vanilla entities.
 *
 * The component waits `value` seconds plus up to `range` more, plays its sound
 * through the world, and draws the next wait. A body whose `value` and `range`
 * are both zero, which the bee writes, names no interval and plays nothing.
 *
 * `event_names` entries win over `event_name`, in file order, and their
 * `condition` goes to the entity's Molang evaluator. An entry whose condition
 * does not evaluate is skipped rather than taken.
 */
export const ambientSoundInterval: ComponentFactory<EntityHooks, AmbientSoundIntervalParams> = {
    name: 'minecraft:ambient_sound_interval',
    hooks: ['onInitialize', 'onTick'],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        const choices: AmbientSoundChoice[] = [];
        for (const entry of asList(value.event_names)) {
            if (!isRecord(entry)) continue;
            const eventName = stringAt(entry, 'event_name');
            if (eventName === undefined) continue;
            choices.push({ condition: stringAt(entry, 'condition'), eventName });
        }
        return accepted({
            value: numberAt(value, 'value', 8),
            range: numberAt(value, 'range', 16),
            eventName: stringAt(value, 'event_name') ?? 'ambient',
            choices
        });
    },
    create: (params) => {
        const silent = params.value <= 0 && params.range <= 0;
        const states = new WeakMap<EntityInstance, IntervalState>();
        const draw = (entity: EntityInstance): number =>
            Math.round((params.value + entity.random.next() * params.range) * TICKS_PER_SECOND);

        /** The first conditional entry whose Molang holds, or the plain `event_name`. */
        const pick = (entity: EntityInstance): string => {
            for (const choice of params.choices) {
                if (choice.condition === undefined) return choice.eventName;
                const held = entity.evaluate(choice.condition);
                if (held === true || (typeof held === 'number' && held !== 0)) return choice.eventName;
            }
            return params.eventName;
        };

        return {
            onInitialize: (entity) => {
                if (!silent) states.set(entity, { remaining: draw(entity) });
            },
            onTick: (entity) => {
                const state = states.get(entity);
                if (state === undefined) return;
                state.remaining -= 1;
                if (state.remaining > 0) return;
                state.remaining = draw(entity);
                if (!entity.perform({ name: 'play_sound', sound: pick(entity) }))
                    entity.report('minecraft:ambient_sound_interval has no world to play its sound through');
            }
        };
    }
};

/** What `minecraft:transformation` declares. */
export interface TransformationParams {
    /** The entity to become, in the `identifier<event>` form when it names an event. */
    readonly into: string;
    /** How long the change takes, in seconds. */
    readonly delay: number;
    readonly addGroups: readonly string[];
    readonly keepLevel: boolean;
    readonly keepOwner: boolean;
    readonly preserveEquipment: boolean;
    readonly dropEquipment: boolean;
    readonly dropInventory: boolean;
}

interface TransformState {
    remaining: number;
}

/**
 * `minecraft:transformation`, which replaces the entity with another type
 * after a delay and runs `minecraft:entity_transformed` on the new one.
 */
export const transformation: ComponentFactory<EntityHooks, TransformationParams> = {
    name: 'minecraft:transformation',
    hooks: ['onInitialize', 'onTick'],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        const into = stringAt(value, 'into');
        if (into === undefined) return rejected('minecraft:transformation needs an into');
        const delay =
            typeof value.delay === 'number'
                ? value.delay
                : numberAt(isRecord(value.delay) ? value.delay : {}, 'value', 0);
        const add = isRecord(value.add) ? value.add : {};
        return accepted({
            into,
            delay,
            addGroups: Array.isArray(add.component_groups)
                ? add.component_groups.filter((name): name is string => typeof name === 'string')
                : [],
            keepLevel: booleanAt(value, 'keep_level', false),
            keepOwner: booleanAt(value, 'keep_owner', false),
            preserveEquipment: booleanAt(value, 'preserve_equipment', false),
            dropEquipment: booleanAt(value, 'drop_equipment', false),
            dropInventory: booleanAt(value, 'drop_inventory', false)
        });
    },
    create: (params) => {
        const states = new WeakMap<EntityInstance, TransformState>();
        const target = splitSpawnReference(params.into);
        return {
            onInitialize: (entity) => {
                states.set(entity, { remaining: Math.round(params.delay * TICKS_PER_SECOND) });
            },
            onTick: (entity) => {
                const state = states.get(entity);
                if (state === undefined) return;
                if (state.remaining > 0) {
                    state.remaining -= 1;
                    return;
                }
                states.delete(entity);
                entity.transform({
                    identifier: target.identifier,
                    event: target.event,
                    addGroups: params.addGroups,
                    keepLevel: params.keepLevel,
                    keepOwner: params.keepOwner,
                    preserveEquipment: params.preserveEquipment,
                    dropEquipment: params.dropEquipment,
                    dropInventory: params.dropInventory
                });
            }
        };
    }
};
