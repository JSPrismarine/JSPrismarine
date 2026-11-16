/**
 * What a minecart does over an activator rail, after Java 26.3's `AbstractMinecart.activateMinecart`
 * and its overrides, as each cart's `minecraft:rail_sensor` writes it.
 *
 * Java calls `activateMinecart` every tick a cart is on an activator rail, with the rail's power.
 * `Minecart` drops its riders while the rail is powered, `MinecartTNT` primes its fuse on a
 * powered rail, `MinecartHopper` stops taking items while the rail is powered and takes them again
 * once it is not, and `MinecartCommandBlock` runs its command every four ticks while powered.
 * The server stores no command for a command block minecart yet (issue #3196), so its sensor's
 * events switch its groups and nothing more runs.
 *
 * The pack writes the same reactions as rail sensor fields: `eject_on_activate` for the riders,
 * and `on_activate` and `on_deactivate` events that prime the TNT cart and switch the hopper and
 * command block carts between their active and inactive groups. Riders are dropped every tick
 * the rail asks for it, as Java's `ejectPassengers` is called every tick. An event fires when the
 * rail's power differs from the power the cart last rode over, since a group the event adds is
 * already in place while the power stays the same.
 */
import { evaluateFilter, isRecord, parseEventTarget } from '@jsprismarine/entities';
import type { EventTarget } from '@jsprismarine/entities';
import { defineComponentState, stateField } from '@jsprismarine/entities/componentState';
import type { Filter } from '@jsprismarine/packs';
import { parseFilter } from '@jsprismarine/packs';

import type { DataEntity } from './DataEntity';

/** The component that reacts to an activator rail. */
export const RAIL_SENSOR = 'minecraft:rail_sensor';

/** One `{event, target, filters}` reaction. */
interface RailSensorEvent {
    readonly event: string;
    readonly target: EventTarget;
    readonly filters?: Filter;
}

/** What a cart's `minecraft:rail_sensor` asks for. */
interface RailSensor {
    /** Whether a powered rail drops the riders; Bedrock's default is true. */
    readonly ejectOnActivate: boolean;
    /** Whether an unpowered rail drops the riders; Bedrock's default is false. */
    readonly ejectOnDeactivate: boolean;
    readonly onActivate?: RailSensorEvent;
    readonly onDeactivate?: RailSensorEvent;
}

/** The power of the last activator rail a cart rode over. Java keeps no such memory. */
const activationState = defineComponentState(
    'jsprismarine:rail_activation',
    { powered: stateField.boolean },
    { saved: false }
);

const eventOf = (value: unknown): RailSensorEvent | undefined => {
    if (typeof value === 'string') return { event: value, target: 'self' };
    if (!isRecord(value) || typeof value.event !== 'string') return undefined;
    return {
        event: value.event,
        target: parseEventTarget(value.target, () => undefined),
        ...(value.filters === undefined ? {} : { filters: parseFilter(value.filters) })
    };
};

/** Each body's reading, as `breeding.ts` keeps its rules: the pack's bodies are shared and never change. */
const sensors = new WeakMap<object, RailSensor>();

const railSensorOf = (params: unknown): RailSensor | undefined => {
    if (!isRecord(params)) return undefined;
    const known = sensors.get(params);
    if (known !== undefined) return known;
    const onActivate = eventOf(params.on_activate);
    const onDeactivate = eventOf(params.on_deactivate);
    const sensor: RailSensor = {
        ejectOnActivate: params.eject_on_activate !== false,
        ejectOnDeactivate: params.eject_on_deactivate === true,
        ...(onActivate === undefined ? {} : { onActivate }),
        ...(onDeactivate === undefined ? {} : { onDeactivate })
    };
    sensors.set(params, sensor);
    return sensor;
};

/** What a cart's reaction to an activator rail does outside the cart. */
export interface RailSensorHost {
    /** Drops everything riding the cart. */
    ejectRiders(entity: DataEntity): void;
}

/**
 * Runs `activateMinecart` for one tick of a cart on an activator rail.
 * @param powered - Whether the rail is powered.
 */
export const activateMinecart = (entity: DataEntity, powered: boolean, host: RailSensorHost): void => {
    const { instance } = entity;
    const sensor = railSensorOf(instance.componentParams(RAIL_SENSOR));
    if (sensor === undefined) return;
    if (powered ? sensor.ejectOnActivate : sensor.ejectOnDeactivate) host.ejectRiders(entity);
    if (instance.componentState.get(activationState)?.powered === powered) return;
    instance.componentState.set(activationState, { powered });
    const reaction = powered ? sensor.onActivate : sensor.onDeactivate;
    if (reaction === undefined) return;
    if (reaction.filters !== undefined && !evaluateFilter(reaction.filters, instance.filterContext())) return;
    instance.raise(reaction.event, reaction.target, RAIL_SENSOR);
};
