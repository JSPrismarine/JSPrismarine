/**
 * `minecraft:tamemount`, the temper of an untamed horse, donkey, mule, zombie horse or llama.
 *
 * Java's `AbstractHorse` keeps a temper that starts at 0. Feeding raises it, and each time the
 * horse bucks while a player rides it, `RunAroundLikeCrazyGoal` tames it when
 * `random.nextInt(maxTemper)` falls below the temper, or adds 5 and throws the player off.
 */

import type { ComponentFactory } from '@jsprismarine/content';
import { accepted, rejected } from '@jsprismarine/content';

import { defineComponentState, stateField } from '../componentState';
import type { EntityInstance } from '../entityInstance';
import type { EntityHooks } from '../hooks';
import { temperOf } from '../javaTaming';
import { asList, isRecord, numberAt } from './schemas';
import type { SensorTrigger } from './shared';
import { normalizedItemIdentifier, parseComponentTrigger } from './shared';

/** What `minecraft:tamemount` declares. */
export interface TamemountParams {
    /** The temper a fresh mount starts with. */
    readonly minTemper: number;
    /** The temper the taming roll is drawn against, which feeding never raises it past. */
    readonly maxTemper: number;
    /** The temper each food adds, by namespaced item. */
    readonly feedItems: ReadonlyMap<string, number>;
    /** Event raised when the mount is tamed. */
    readonly tameEvent?: SensorTrigger;
}

/** The mount's current temper. */
const TEMPER_STATE = defineComponentState('minecraft:tamemount', { temper: stateField.number });

/** Java's `AbstractHorse.modifyTemper` clamp. */
const clampTemper = (temper: number, params: TamemountParams): number =>
    Math.max(0, Math.min(params.maxTemper, temper));

/** The temper a buck that fails to tame adds, from Java's `RunAroundLikeCrazyGoal.tick`. */
const BUCK_TEMPER = 5;

/** Whether a value is parsed `minecraft:tamemount` params. */
const isTamemountParams = (value: unknown): value is TamemountParams =>
    isRecord(value) && typeof value.maxTemper === 'number' && value.feedItems instanceof Map;

/** The active `minecraft:tamemount` of an entity and its temper, when it carries one. */
const mountOf = (entity: EntityInstance): { params: TamemountParams; temper: number } | undefined => {
    const params = entity.componentParams('minecraft:tamemount');
    if (!isTamemountParams(params)) return undefined;
    return { params, temper: entity.componentState.get(TEMPER_STATE)?.temper ?? params.minTemper };
};

/**
 * The temper of an untamed mount, or undefined for an entity without `minecraft:tamemount`.
 */
export const temperOfMount = (entity: EntityInstance): number | undefined => mountOf(entity)?.temper;

/**
 * Feeds an untamed mount, which is the temper half of Java's `handleEating`: the food raises the
 * temper by its amount while the temper is below the maximum.
 *
 * @returns Whether the temper rose, which on its own is reason enough for Java to eat the food.
 */
export const feedMount = (entity: EntityInstance, item: string): boolean => {
    const mount = mountOf(entity);
    if (mount === undefined || mount.temper >= mount.params.maxTemper) return false;
    const amount = temperOf(entity.type.identifier, normalizedItemIdentifier(item), mount.params.feedItems);
    if (amount === undefined || amount <= 0) return false;
    entity.componentState.set(TEMPER_STATE, { temper: clampTemper(mount.temper + amount, mount.params) });
    return true;
};

/**
 * One buck with a player on the mount's back, from Java's `RunAroundLikeCrazyGoal.tick`: the
 * mount is tamed when `nextInt(maxTemper)` falls below its temper, and otherwise grows 5 more
 * patient and throws the player off.
 *
 * @returns Whether the buck tamed the mount, or undefined for an entity without
 *   `minecraft:tamemount`.
 */
export const buckMount = (entity: EntityInstance): boolean | undefined => {
    const mount = mountOf(entity);
    if (mount === undefined) return undefined;
    const { maxTemper } = mount.params;
    if (maxTemper > 0) {
        const draw = entity.random.nextInt?.(maxTemper) ?? Math.floor(entity.random.next() * maxTemper);
        if (draw < mount.temper) return true;
    }
    entity.componentState.set(TEMPER_STATE, { temper: clampTemper(mount.temper + BUCK_TEMPER, mount.params) });
    return false;
};

/** The event an entity's `minecraft:tamemount` raises once it is tamed. */
export const mountTameEvent = (entity: EntityInstance): SensorTrigger | undefined => mountOf(entity)?.params.tameEvent;

/** `minecraft:tamemount`, whose temper {@link feedMount} and {@link buckMount} drive. */
export const tamemount: ComponentFactory<EntityHooks, TamemountParams> = {
    name: 'minecraft:tamemount',
    hooks: ['onInitialize'],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        const feedItems = new Map<string, number>();
        for (const raw of asList(value.feed_items)) {
            if (!isRecord(raw) || typeof raw.item !== 'string') continue;
            feedItems.set(normalizedItemIdentifier(raw.item), numberAt(raw, 'temper_mod', 0));
        }
        const tameEvent = parseComponentTrigger(value.tame_event);
        return accepted({
            minTemper: numberAt(value, 'min_temper', 0),
            maxTemper: numberAt(value, 'max_temper', 100),
            feedItems,
            ...(tameEvent === undefined ? {} : { tameEvent })
        });
    },
    create: (params) => ({
        onInitialize: (entity) => {
            if (entity.componentState.get(TEMPER_STATE) === undefined)
                entity.componentState.set(TEMPER_STATE, { temper: params.minTemper });
        }
    })
};
