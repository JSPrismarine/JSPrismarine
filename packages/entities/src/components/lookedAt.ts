/** `minecraft:looked_at`: what an entity does when a player looks at it. */

import type { ComponentFactory } from '@jsprismarine/content';
import { accepted, rejected } from '@jsprismarine/content';
import type { Filter } from '@jsprismarine/packs';
import { defineComponentState, stateField } from '../componentState';
import type { EntityInstance, LookedAtLocation } from '../entityInstance';
import { parseEventTarget } from '../events';
import { evaluateFilter } from '../filters';
import type { EntityHooks } from '../hooks';
import { TICKS_PER_SECOND } from '../hooks';
import { asList, booleanAt, isRecord, numberAt, parseFilterValue, stringAt } from './schemas';
import type { SensorTrigger } from './shared';

/** When a stare makes the looker the entity's target. */
export type LookedAtSetTarget = 'never' | 'once_and_stop_scanning' | 'once_and_keep_scanning';

/** What `minecraft:looked_at` declares. */
export interface LookedAtParams {
    readonly searchRadius: number;
    readonly setTarget: LookedAtSetTarget;
    /** Ticks a player must keep looking before the stare counts. */
    readonly minLookedAtTicks: number;
    /** Java's `isLookingAtMe` tolerance the field of view stands for: `1 - cos(field_of_view / 2)`. */
    readonly tolerance: number;
    readonly scaleByDistance: boolean;
    readonly locations: readonly LookedAtLocation[];
    readonly filters?: Filter;
    readonly lookedAtEvent?: SensorTrigger;
    readonly notLookedAtEvent?: SensorTrigger;
}

/** Ticks the current stare has lasted, whether it has counted yet, and whether scanning stopped. */
const LOOKED_AT_STATE = defineComponentState('minecraft:looked_at', {
    lookedTicks: stateField.number,
    looked: stateField.boolean,
    stopped: stateField.boolean
});

const SET_TARGETS: readonly LookedAtSetTarget[] = ['never', 'once_and_stop_scanning', 'once_and_keep_scanning'];
const isSetTarget = (value: unknown): value is LookedAtSetTarget => SET_TARGETS.some((target) => target === value);

const LOCATIONS: readonly LookedAtLocation['location'][] = ['head', 'body', 'feet'];
const isLocation = (value: unknown): value is LookedAtLocation['location'] =>
    LOCATIONS.some((location) => location === value);

/** A `looked_at_event` or `not_looked_at_event`, whose target the pack writes as `target` or `filter`. */
const parseLookedAtEvent = (value: unknown): SensorTrigger | undefined => {
    if (!isRecord(value)) return undefined;
    const event = stringAt(value, 'event');
    if (event === undefined) return undefined;
    return { event, target: parseEventTarget(value.target ?? value.filter, () => undefined) };
};

const parseLookedAt = (
    value: unknown
): { readonly ok: true; readonly params: LookedAtParams } | { readonly ok: false; readonly message: string } => {
    if (!isRecord(value)) return { ok: false, message: 'expected an object' };
    const setTarget = value.set_target ?? 'once_and_stop_scanning';
    if (!isSetTarget(setTarget)) return { ok: false, message: `set_target must be one of ${SET_TARGETS.join(', ')}` };
    const fieldOfView = numberAt(value, 'field_of_view', 26);
    if (fieldOfView <= 0 || fieldOfView > 360) return { ok: false, message: 'field_of_view must be in (0, 360]' };

    const locations: LookedAtLocation[] = [];
    for (const [index, raw] of asList(value.look_at_locations).entries()) {
        const location = isRecord(raw) ? raw.location : raw;
        if (!isLocation(location))
            return { ok: false, message: `look_at_locations[${index}].location must be head, body or feet` };
        locations.push({ location, verticalOffset: isRecord(raw) ? numberAt(raw, 'vertical_offset', 0) : 0 });
    }

    let filters: Filter | undefined;
    if (value.filters !== undefined) {
        const parsed = parseFilterValue(value.filters, 'minecraft:looked_at filters');
        if (!parsed.ok) return { ok: false, message: parsed.message };
        filters = parsed.value;
    }

    const lookedAtEvent = parseLookedAtEvent(value.looked_at_event);
    const notLookedAtEvent = parseLookedAtEvent(value.not_looked_at_event);
    return {
        ok: true,
        params: {
            searchRadius: numberAt(value, 'search_radius', 10),
            setTarget,
            minLookedAtTicks: Math.ceil(numberAt(value, 'min_looked_at_duration', 0) * TICKS_PER_SECOND),
            tolerance: 1 - Math.cos(((fieldOfView / 2) * Math.PI) / 180),
            scaleByDistance: booleanAt(value, 'scale_fov_by_distance', true),
            locations: locations.length === 0 ? [{ location: 'head', verticalOffset: 0 }] : locations,
            ...(filters === undefined ? {} : { filters }),
            ...(lookedAtEvent === undefined ? {} : { lookedAtEvent }),
            ...(notLookedAtEvent === undefined ? {} : { notLookedAtEvent })
        }
    };
};

const raise = (entity: EntityInstance, trigger: SensorTrigger | undefined): void => {
    if (trigger?.event !== undefined) entity.raise(trigger.event, trigger.target, 'minecraft:looked_at');
};

/**
 * `minecraft:looked_at`, which raises its events when a player starts and stops looking at the
 * entity and can make that player its target.
 *
 * A look is Java's `LivingEntity.isLookingAtMe`: the field of view stands for its tolerance, so
 * the default 26 degrees scaled by distance is the enderman's stare check
 * (`EnderMan.isBeingStaredBy`, tolerance 0.025), and the creaking's 120 degrees unscaled is
 * `Creaking.checkCanMove`'s 0.5.
 */
export const lookedAt: ComponentFactory<EntityHooks, LookedAtParams> = {
    name: 'minecraft:looked_at',
    hooks: ['onInitialize', 'onTick'],
    schema: (value) => {
        const parsed = parseLookedAt(value);
        return parsed.ok ? accepted(parsed.params) : rejected(parsed.message);
    },
    create: (params) => ({
        onInitialize: (entity) =>
            entity.componentState.set(LOOKED_AT_STATE, { lookedTicks: 0, looked: false, stopped: false }),
        onTick: (entity) => {
            const state = entity.componentState.get(LOOKED_AT_STATE);
            if (state === undefined) return;
            // A search that stopped at its target starts again once the entity has none.
            if (state.stopped && entity.attackTarget !== undefined) return;
            const context = entity.filterContext();
            const looker = entity
                .lookers({
                    searchRadius: params.searchRadius,
                    tolerance: params.tolerance,
                    scaleByDistance: params.scaleByDistance,
                    locations: params.locations
                })
                .find(
                    (candidate) =>
                        params.filters === undefined ||
                        evaluateFilter(params.filters, { ...context, other: candidate.view })
                );
            if (looker === undefined) {
                if (state.looked && !state.stopped) raise(entity, params.notLookedAtEvent);
                entity.componentState.set(LOOKED_AT_STATE, { lookedTicks: 0, looked: false, stopped: false });
                return;
            }
            const lookedTicks = state.lookedTicks + 1;
            if (state.looked || lookedTicks < params.minLookedAtTicks) {
                entity.componentState.set(LOOKED_AT_STATE, { ...state, lookedTicks });
                return;
            }
            raise(entity, params.lookedAtEvent);
            if (params.setTarget !== 'never') entity.targetLooker(looker);
            entity.componentState.set(LOOKED_AT_STATE, {
                lookedTicks,
                looked: true,
                stopped: params.setTarget === 'once_and_stop_scanning'
            });
        }
    })
};
