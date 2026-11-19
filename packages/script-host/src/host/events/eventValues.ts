/**
 * The data behind the objects of the events in `world.afterEvents` and `world.beforeEvents` that
 * the world describes with a {@link ScriptGameEvent}, and the script values their members read.
 */
import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import type { ScriptCall } from '../../shape/implementations';
import type { ScriptValue } from '../../values';
import { ScriptHandle } from '../../values';
import type { PackHost } from '../minecraftServer';
import { itemState, TAG } from '../serverObjects';
import type { ScriptDamageSource, ScriptEventValue, ScriptGameEvent } from '../world';

/** The tags of the objects the world events make, in the 3001 to 3999 range this module owns. */
export const EVENT_TAG = {
    /** A block component a world event names, such as a piston's; its state is the block's location. */
    blockComponent: 3001,
    /** An `EntityHealSource`; its state is `{ cause }`. */
    healSource: 3002
} as const;

/** A {@link ScriptGameEvent} as its object's members read it, and a before-event's members write it. */
export interface GameEventData {
    readonly kind: 'game';
    /** The event's class, such as `PlayerPlaceBlockBeforeEvent`. */
    readonly event: string;
    /** Whether a before-event's script canceled it; always false for an after-event. */
    cancel: boolean;
    readonly fields: Record<string, ScriptEventValue>;
}

/** The data of a world event, with fields a before-event's script may change. */
export const gameEventData = ({ event, fields }: ScriptGameEvent): GameEventData => ({
    kind: 'game',
    event,
    cancel: false,
    fields: { ...fields }
});

/** A script array of values the caller made, which it frees once the array holds them. */
const arrayOf = (host: PackHost, values: readonly ScriptValue[]): ScriptHandle => {
    const array = host.engine.evaluate('[]');
    if (!(array instanceof ScriptHandle)) throw new ScriptHostErrors.LiteralEvaluatedToPrimitive({ kind: 'array' });
    values.forEach((value, index) => host.engine.set(array, String(index), value));
    return host.engine.release(array);
};

/**
 * A value of the engine's realm parsed from JSON, such as a list of strings, with `items` added
 * after its elements when it is an array.
 */
export const jsonValue = (host: PackHost, json: ScriptValue, items: readonly ScriptValue[] = []): ScriptValue => {
    if (typeof json !== 'string') return json;
    const made = host.engine.evaluate(`(${json})`);
    if (!(made instanceof ScriptHandle)) return made;
    const length = host.engine.get(made, 'length');
    const start = typeof length === 'number' ? length : 0;
    items.forEach((item, index) => host.engine.set(made, String(start + index), item));
    return host.engine.release(made);
};

/** A plain script object with the given members. */
export const plainObject = (host: PackHost, members: Readonly<Record<string, ScriptValue>>): ScriptHandle => {
    const made = host.engine.evaluate('({})');
    if (!(made instanceof ScriptHandle)) throw new ScriptHostErrors.LiteralEvaluatedToPrimitive({ kind: 'object' });
    for (const [name, value] of Object.entries(members)) if (value !== undefined) host.engine.set(made, name, value);
    return host.engine.release(made);
};

/** An `EntityDamageSource`, a plain object whose entities are the pack's entity objects. */
export const damageSourceObject = (
    host: PackHost,
    { cause, damagingEntity, damagingProjectile }: ScriptDamageSource
): ScriptHandle =>
    plainObject(host, {
        cause,
        damagingEntity: damagingEntity === undefined ? undefined : host.entity(damagingEntity),
        damagingProjectile: damagingProjectile === undefined ? undefined : host.entity(damagingProjectile)
    });

/**
 * The script value of an event's field: the value itself for a string, number or boolean, the
 * pack's object for an entity, a block, a permutation, a stack, a dimension or an effect, and
 * JSON the binding parses for a vector or other plain data.
 */
export const scriptValueOf = (host: PackHost, value: ScriptEventValue | undefined): ScriptValue => {
    if (value === undefined || typeof value !== 'object') return value;
    const make = (className: string, tag: number, state: string): ScriptHandle =>
        host.engine.release(host.create(className, tag, state));
    if ('entity' in value) return host.entity(value.entity);
    if ('entities' in value)
        return arrayOf(
            host,
            value.entities.map((entity) => host.entity(entity))
        );
    if ('block' in value) return make('Block', TAG.block, JSON.stringify(value.block));
    if ('blocks' in value) {
        return arrayOf(
            host,
            value.blocks.map((block) => make('Block', TAG.block, JSON.stringify(block)))
        );
    }
    if ('permutation' in value) return make('BlockPermutation', TAG.permutation, JSON.stringify(value.permutation));
    if ('item' in value) return make('ItemStack', TAG.itemStack, itemState(value.item));
    if ('items' in value)
        return arrayOf(
            host,
            value.items.map((item) => make('ItemStack', TAG.itemStack, itemState(item)))
        );
    if ('dimension' in value) return host.instance('Dimension', TAG.dimension, value.dimension);
    if ('vector' in value) return JSON.stringify(value.vector);
    if ('damageSource' in value) return damageSourceObject(host, value.damageSource);
    if ('effect' in value) return make('Effect', TAG.effect, JSON.stringify({ entity: value.holder, ...value.effect }));
    if ('blockComponent' in value)
        return make(value.blockComponent, EVENT_TAG.blockComponent, JSON.stringify(value.at));
    return value.json;
};

/** The event data behind an event object, or BDS's error once the event is over. */
export const gameDataOf = (host: PackHost, call: ScriptCall): GameEventData => {
    const found = host.eventData(call.tag);
    if (found?.kind !== 'game') throw new ScriptHostErrors.EventNoLongerValid();
    return found;
};
