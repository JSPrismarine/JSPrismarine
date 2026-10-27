import type { Filter } from '@jsprismarine/packs';

import type { EventTarget } from './events';
import { EVENT_TARGETS } from './events';

/**
 * The `minecraft:on_*` components, which name an event the engine fires at a
 * fixed point rather than on a schedule the component owns.
 *
 * The parsed parameters live here rather than beside the component factory so
 * {@link EntityInstance.trigger} can read them back without importing the
 * component module.
 */

/** The eleven `minecraft:on_*` components vanilla declares. */
export const TRIGGER_COMPONENTS = [
    'minecraft:on_death',
    'minecraft:on_equipment_changed',
    'minecraft:on_friendly_anger',
    'minecraft:on_hurt',
    'minecraft:on_hurt_by_player',
    'minecraft:on_ignite',
    'minecraft:on_start_landing',
    'minecraft:on_start_takeoff',
    'minecraft:on_target_acquired',
    'minecraft:on_target_escape',
    'minecraft:on_wake_with_owner'
] as const;

/** One of {@link TRIGGER_COMPONENTS}. */
export type TriggerComponentName = (typeof TRIGGER_COMPONENTS)[number];

/**
 * The six trigger components this package fires itself.
 *
 * `minecraft:damage_sensor` and {@link EntityInstance.damage} fire the three
 * hurt and death ones, {@link EntityInstance.setAttackTarget} fires the two
 * target ones, and the entity runtime fires friendly anger when a nearby mob
 * broadcasts it. The other five name states no part of this package owns, so
 * a caller fires them through {@link EntityInstance.trigger} once it has
 * equipment, fire, flight and sleep.
 */
export const SELF_FIRED_TRIGGERS: readonly TriggerComponentName[] = [
    'minecraft:on_death',
    'minecraft:on_hurt',
    'minecraft:on_hurt_by_player',
    'minecraft:on_friendly_anger',
    'minecraft:on_target_acquired',
    'minecraft:on_target_escape'
];

/** What one of the eleven `minecraft:on_*` components declares. */
export interface TriggerComponentParams {
    /** The event to fire; a body with none fires nothing, which four vanilla bodies do. */
    readonly event?: string;
    /** Whom the event fires on, `self` when the body names none. */
    readonly target: EventTarget;
    /** Gates the whole trigger, evaluated when the engine reaches the fixed point. */
    readonly filters?: Filter;
}

/** Whether a value is the parsed body of a trigger component. */
export const isTriggerParams = (value: unknown): value is TriggerComponentParams => {
    if (typeof value !== 'object' || value === null || !('target' in value)) return false;
    const target: unknown = value.target;
    if (typeof target !== 'string' || !EVENT_TARGETS.some((name) => name === target)) return false;
    const event: unknown = 'event' in value ? value.event : undefined;
    return event === undefined || typeof event === 'string';
};
