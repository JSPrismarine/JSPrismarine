import type { Filter } from '@jsprismarine/packs';

import type { EventTarget } from './events';
import { EVENT_TARGETS } from './events';

/**
 * The ten `minecraft:on_*` components, which name an event the engine fires at
 * a fixed point rather than on a schedule the component owns. The
 * slot-specific `minecraft:on_equipment_changed` is defined separately.
 *
 * The parsed parameters live here rather than beside the component factory so
 * {@link EntityInstance.trigger} can read them back without importing the
 * component module.
 */

/** The ten event-shaped `minecraft:on_*` components. */
export const EVENT_TRIGGER_COMPONENTS = [
    'minecraft:on_death',
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

/** One of {@link EVENT_TRIGGER_COMPONENTS}, which can be fired directly. */
export type TriggerComponentName = (typeof EVENT_TRIGGER_COMPONENTS)[number];

/**
 * Event-shaped trigger components fired at fixed points the entity runtime owns.
 *
 * {@link EntityInstance.damage} fires the hurt and death triggers,
 * {@link EntityInstance.setAttackTarget} fires the target triggers, and the
 * entity runtime fires friendly anger, ignition, landing, and takeoff. The pet
 * sleep goal fires the owner-wake trigger.
 */
export const SELF_FIRED_TRIGGERS: readonly TriggerComponentName[] = [
    'minecraft:on_death',
    'minecraft:on_friendly_anger',
    'minecraft:on_hurt',
    'minecraft:on_hurt_by_player',
    'minecraft:on_ignite',
    'minecraft:on_start_landing',
    'minecraft:on_start_takeoff',
    'minecraft:on_target_acquired',
    'minecraft:on_target_escape',
    'minecraft:on_wake_with_owner'
];

/** What an event-shaped `minecraft:on_*` component declares. */
export interface TriggerComponentParams {
    /** The event to fire; a body with none fires nothing, which four vanilla bodies do. */
    readonly event?: string;
    /** Whom the event fires on, `self` when the body names none. */
    readonly target: EventTarget;
    /** Gates the whole trigger, evaluated when the engine reaches the fixed point. */
    readonly filters?: Filter;
}

/** Whether a value is the parsed body of an event-shaped trigger component. */
export const isTriggerParams = (value: unknown): value is TriggerComponentParams => {
    if (typeof value !== 'object' || value === null || !('target' in value)) return false;
    const target: unknown = value.target;
    if (typeof target !== 'string' || !EVENT_TARGETS.some((name) => name === target)) return false;
    const event: unknown = 'event' in value ? value.event : undefined;
    return event === undefined || typeof event === 'string';
};
