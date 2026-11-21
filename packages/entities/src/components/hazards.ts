/** Components that hurt an entity over time: hurt conditions, daylight, damage over time and air supply. */

import type { ComponentFactory } from '@jsprismarine/content';
import { accepted, rejected } from '@jsprismarine/content';
import type { Filter } from '@jsprismarine/packs';
import { defineComponentState, stateField } from '../componentState';
import type { EntityInstance } from '../entityInstance';
import { evaluateFilter } from '../filters';
import type { EntityHooks } from '../hooks';
import { ENTITY_EQUIPMENT_SLOT_NAMES, TICKS_PER_SECOND } from '../hooks';
import { asList, booleanAt, isRecord, numberAt, parseFilterValue, stringAt } from './schemas';
import type { SensorTrigger } from './shared';
import { parseComponentTrigger } from './shared';

/**
 * How many ticks apart an environmental hurt lands on an entity with health.
 *
 * Both editions give a living entity half a second of invulnerability after
 * environmental damage, which is what makes `minecraft:hurt_on_condition`'s
 * `damage_per_tick: 4` in lava the four damage per half second a player sees
 * rather than eighty a second.
 */
export const HURT_INTERVAL_TICKS = 10;

/**
 * How many ticks apart a hurt lands on an entity that declares no health, such as a boat. Java's
 * invulnerable time is `LivingEntity.hurtServer`'s, and `VehicleEntity.hurtServer` has none, so
 * `Entity.lavaHurt` reaches a boat every tick.
 */
const UNGUARDED_HURT_INTERVAL_TICKS = 1;

/** One entry of `minecraft:hurt_on_condition.damage_conditions`. */
export interface DamageCondition {
    /** Gates the condition; absent means it always hurts. */
    readonly filters?: Filter;
    /** The damage cause to apply, such as `lava`. */
    readonly cause: string;
    readonly damagePerTick: number;
}

/** What `minecraft:hurt_on_condition` declares. */
export interface HurtOnConditionParams {
    readonly conditions: readonly DamageCondition[];
}

/** Ticks until `minecraft:hurt_on_condition` next checks its conditions. */
const HURT_ON_CONDITION_STATE = defineComponentState('minecraft:hurt_on_condition', { remaining: stateField.number });

/**
 * `minecraft:hurt_on_condition`, carried by 87 vanilla entities and in all but
 * a few of them the lava rule.
 *
 * Every condition whose filters pass hurts, on the {@link HURT_INTERVAL_TICKS}
 * cadence, or every tick for an entity with no health, so the damage reaches the sensors, the immunities and the hurt
 * triggers through {@link EntityInstance.damage} like any other.
 */
export const hurtOnCondition: ComponentFactory<EntityHooks, HurtOnConditionParams> = {
    name: 'minecraft:hurt_on_condition',
    hooks: ['onInitialize', 'onTick'],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        const conditions: DamageCondition[] = [];
        for (const entry of asList(value.damage_conditions)) {
            if (!isRecord(entry)) return rejected('minecraft:hurt_on_condition damage_conditions must be objects');
            let filters: Filter | undefined;
            if (entry.filters !== undefined) {
                const parsed = parseFilterValue(entry.filters, 'minecraft:hurt_on_condition filters');
                if (!parsed.ok) return parsed;
                filters = parsed.value;
            }
            conditions.push({
                filters,
                cause: stringAt(entry, 'cause') ?? 'none',
                damagePerTick: numberAt(entry, 'damage_per_tick', 0)
            });
        }
        return accepted({ conditions });
    },
    create: (params) => {
        return {
            onInitialize: (entity) => {
                entity.componentState.set(HURT_ON_CONDITION_STATE, { remaining: 0 });
            },
            onTick: (entity) => {
                const state = entity.componentState.get(HURT_ON_CONDITION_STATE);
                if (state === undefined) return;
                const remaining = state.remaining - 1;
                if (remaining > 0) {
                    entity.componentState.set(HURT_ON_CONDITION_STATE, { remaining });
                    return;
                }

                const context = entity.filterContext();
                let hurt = false;
                for (const condition of params.conditions) {
                    if (condition.damagePerTick <= 0) continue;
                    if (condition.filters !== undefined && !evaluateFilter(condition.filters, context)) continue;
                    entity.damage({ cause: condition.cause, amount: condition.damagePerTick });
                    hurt = true;
                }
                const interval =
                    entity.attributes.get('health') === undefined ? UNGUARDED_HURT_INTERVAL_TICKS : HURT_INTERVAL_TICKS;
                entity.componentState.set(HURT_ON_CONDITION_STATE, { remaining: hurt ? interval : 0 });
            }
        };
    }
};

/** Equipment slots accepted for `minecraft:burns_in_daylight` protection: every equipment slot. */
export const BURNS_IN_DAYLIGHT_PROTECTION_SLOTS = ENTITY_EQUIPMENT_SLOT_NAMES;

/** A Bedrock protection slot accepted by `minecraft:burns_in_daylight`. */
export type BurnsInDaylightProtectionSlot = (typeof BURNS_IN_DAYLIGHT_PROTECTION_SLOTS)[number];

/** Whether a value is one of the Bedrock equipment slots sunlight protection accepts. */
const isBurnsInDaylightProtectionSlot = (value: unknown): value is BurnsInDaylightProtectionSlot =>
    typeof value === 'string' && BURNS_IN_DAYLIGHT_PROTECTION_SLOTS.some((slot) => slot === value);

/** The sunlight protection slot declared by `minecraft:burns_in_daylight`. */
export interface BurnsInDaylightParams {
    /** The occupied slot that protects the entity, defaulting to its head. */
    readonly protectionSlot: BurnsInDaylightProtectionSlot;
}

/**
 * `minecraft:burns_in_daylight`, whose direct-sun test and fire state belong to the world runtime.
 *
 * The component package validates the Bedrock equipment slot. The dimension runtime owns sky
 * exposure, rain, fire ticks, damage, and the `minecraft:on_ignite` fixed point.
 */
export const burnsInDaylight: ComponentFactory<EntityHooks, BurnsInDaylightParams> = {
    name: 'minecraft:burns_in_daylight',
    hooks: [],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        const slot = value['protection_slot'] === undefined ? 'slot.armor.head' : value['protection_slot'];
        if (!isBurnsInDaylightProtectionSlot(slot)) {
            return rejected('protection_slot must name a supported armor or weapon slot');
        }
        return accepted({ protectionSlot: slot });
    },
    create: () => ({})
};

/** What `minecraft:damage_over_time` declares. */
export interface DamageOverTimeParams {
    readonly damagePerHurt: number;
    /** Seconds between hurts; a zero falls back to the half-second hurt interval. */
    readonly timeBetweenHurt: number;
}

/** Ticks until `minecraft:damage_over_time` next hurts. */
const DAMAGE_OVER_TIME_STATE = defineComponentState('minecraft:damage_over_time', { remaining: stateField.number });

/**
 * `minecraft:damage_over_time`, which hurts the entity while it is active.
 *
 * The axolotl, the dolphin and the vex are the three vanilla users, and two of
 * them write `time_between_hurt: 0`, which the engine floors at
 * {@link HURT_INTERVAL_TICKS} rather than hurting every tick. The first blow lands on the
 * component's first tick, as Java's `Vex.tick` hurts a vex the tick its life runs out and
 * `Dolphin.tick` a dolphin the tick it dries.
 */
export const damageOverTime: ComponentFactory<EntityHooks, DamageOverTimeParams> = {
    name: 'minecraft:damage_over_time',
    hooks: ['onInitialize', 'onTick'],
    schema: (value) =>
        isRecord(value)
            ? accepted({
                  damagePerHurt: numberAt(value, 'damage_per_hurt', 0),
                  timeBetweenHurt: numberAt(value, 'time_between_hurt', 0)
              })
            : rejected('expected an object'),
    create: (params) => {
        const interval = Math.max(HURT_INTERVAL_TICKS, Math.round(params.timeBetweenHurt * TICKS_PER_SECOND));
        return {
            onInitialize: (entity) => {
                entity.componentState.set(DAMAGE_OVER_TIME_STATE, { remaining: 1 });
            },
            onTick: (entity) => {
                const state = entity.componentState.get(DAMAGE_OVER_TIME_STATE);
                if (state === undefined || params.damagePerHurt <= 0) return;
                const remaining = state.remaining - 1;
                entity.componentState.set(DAMAGE_OVER_TIME_STATE, { remaining: remaining > 0 ? remaining : interval });
                if (remaining > 0) return;
                entity.damage({ cause: 'none', amount: params.damagePerHurt });
            }
        };
    }
};

/** What `minecraft:drying_out_timer` declares. */
export interface DryingOutTimerParams {
    /** Seconds out of water and rain before the entity has dried out. */
    readonly totalTime: number;
    readonly driedOut?: SensorTrigger;
    readonly stoppedDryingOut?: SensorTrigger;
    readonly recoverAfterDriedOut?: SensorTrigger;
}

/** Ticks an entity has spent drying out, and whether it has dried out. */
const DRYING_OUT_STATE = defineComponentState('minecraft:drying_out_timer', {
    elapsed: stateField.number,
    dried: stateField.boolean
});

/**
 * `minecraft:drying_out_timer`, the axolotl's and the dolphin's time out of water.
 *
 * Out of water and rain the timer counts up, and once it reaches `total_time` it fires
 * `dried_out_event`, which is where the vanilla files hurt the entity. Water or rain stops it and
 * fires `stopped_drying_out_event`, or `recover_after_dried_out_event` for an entity that had
 * dried out. The vanilla numbers are Java's: an axolotl's 300 seconds are `Axolotl`'s 6000 ticks
 * of air, and a dolphin's 120 seconds are `Dolphin.TOTAL_MOISTNESS_LEVEL`.
 */
export const dryingOutTimer: ComponentFactory<EntityHooks, DryingOutTimerParams> = {
    name: 'minecraft:drying_out_timer',
    hooks: ['onInitialize', 'onTick'],
    schema: (value) =>
        isRecord(value)
            ? accepted({
                  totalTime: numberAt(value, 'total_time', 0),
                  driedOut: parseComponentTrigger(value.dried_out_event),
                  stoppedDryingOut: parseComponentTrigger(value.stopped_drying_out_event),
                  recoverAfterDriedOut: parseComponentTrigger(value.recover_after_dried_out_event)
              })
            : rejected('expected an object'),
    create: (params) => {
        const total = Math.round(params.totalTime * TICKS_PER_SECOND);
        const raise = (entity: EntityInstance, trigger: SensorTrigger | undefined): void => {
            if (trigger?.event !== undefined) entity.raise(trigger.event, trigger.target, 'minecraft:drying_out_timer');
        };
        return {
            onInitialize: (entity) => {
                entity.componentState.set(DRYING_OUT_STATE, { elapsed: 0, dried: false });
            },
            onTick: (entity) => {
                const state = entity.componentState.get(DRYING_OUT_STATE);
                if (state === undefined) return;
                if (entity.filterContext().self.flag?.('in_water_or_rain') === true) {
                    if (state.elapsed === 0 && !state.dried) return;
                    entity.componentState.set(DRYING_OUT_STATE, { elapsed: 0, dried: false });
                    raise(entity, state.dried ? params.recoverAfterDriedOut : params.stoppedDryingOut);
                    return;
                }
                if (state.dried) return;
                const elapsed = state.elapsed + 1;
                entity.componentState.set(DRYING_OUT_STATE, { elapsed, dried: elapsed >= total });
                if (elapsed >= total) raise(entity, params.driedOut);
            }
        };
    }
};

/** What `minecraft:breathable` declares. */
export interface BreathableParams {
    /** How many seconds of air the entity holds. */
    readonly totalSupply: number;
    /** How many seconds between suffocation ticks; -1 means the entity does not suffocate. */
    readonly suffocateTime: number;
    readonly breathesAir: boolean;
    readonly breathesWater: boolean;
    /** Whether lava is breathable, which Bedrock defaults to true and Java agrees with: only water spends air. */
    readonly breathesLava: boolean;
    readonly generatesBubbles: boolean;
    readonly inhaleTime: number;
}

/** How much health one suffocation hurt takes, which both editions put at one heart. */
export const SUFFOCATION_DAMAGE = 2;

/**
 * How many ticks apart an entity out of air is hurt when its body leaves `suffocate_time` at the
 * vanilla `0`.
 *
 * Java's `LivingEntity.baseTick` keeps spending air below zero and hurts once it reaches -20
 * (`shouldTakeDrowningDamage`), setting it back to 0, so the first blow lands 20 ticks after the
 * air runs out and the next 20 ticks after that.
 */
export const DROWNING_INTERVAL_TICKS = 20;

/**
 * How much air a land breather regains a tick in a medium it breathes, when its body names no
 * `inhale_time`: Java's `LivingEntity.increaseAirSupply`.
 */
export const AIR_REGAIN_PER_TICK = 4;

/**
 * One entity's air: `remaining` ticks of supply left, and `untilHurt` ticks until the next
 * suffocation hurt once the supply is gone.
 */
export const AIR_STATE = defineComponentState('minecraft:breathable', {
    remaining: stateField.number,
    untilHurt: stateField.number
});

/**
 * `minecraft:breathable`, carried by 84 vanilla entities.
 *
 * The component holds the air supply and spends it. An entity in a medium it
 * cannot breathe loses a tick of supply per tick. One back in a medium it can
 * breathe refills over `inhale_time` when the body names one; otherwise it
 * regains {@link AIR_REGAIN_PER_TICK} a tick, as Java's land breathers do, and
 * a water breather back in water refills at once, as Java's
 * `WaterAnimal.handleAirSupply` does. An entity out of supply suffocates every
 * `suffocate_time` seconds, or every {@link DROWNING_INTERVAL_TICKS} when the
 * body writes the vanilla `0`.
 *
 * Which medium the entity is in comes from the `in_water` and `in_lava` filter
 * facts, so an environment that answers neither leaves the entity breathing.
 *
 * Two vanilla files still write the pre-rename `totalSupply` and
 * `suffocateTime`, so both spellings read.
 */
export const breathable: ComponentFactory<EntityHooks, BreathableParams> = {
    name: 'minecraft:breathable',
    hooks: ['onInitialize', 'onTick'],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        const totalSupply = numberAt(value, 'total_supply', numberAt(value, 'totalSupply', 15));
        const suffocateTime = numberAt(value, 'suffocate_time', numberAt(value, 'suffocateTime', 0));
        return accepted({
            totalSupply,
            suffocateTime,
            breathesAir: booleanAt(value, 'breathes_air', true),
            breathesWater: booleanAt(value, 'breathes_water', false),
            breathesLava: booleanAt(value, 'breathes_lava', true),
            generatesBubbles: booleanAt(value, 'generates_bubbles', true),
            inhaleTime: numberAt(value, 'inhale_time', 0)
        });
    },
    create: (params) => {
        const supply = Math.max(0, Math.round(params.totalSupply * TICKS_PER_SECOND));
        const hurtInterval =
            params.suffocateTime > 0 ? Math.round(params.suffocateTime * TICKS_PER_SECOND) : DROWNING_INTERVAL_TICKS;
        const inhale = Math.round(params.inhaleTime * TICKS_PER_SECOND);
        const waterBreather = params.breathesWater && !params.breathesAir;
        /** The air one tick in a breathable medium gives back. */
        const regain = (entity: EntityInstance): number => {
            if (inhale > 0) return Math.ceil(supply / inhale);
            return waterBreather && entity.filterContext().self.flag?.('in_water') === true
                ? supply
                : AIR_REGAIN_PER_TICK;
        };

        /** Whether the medium the entity is in is one the component says it breathes. */
        const canBreathe = (entity: EntityInstance): boolean => {
            const self = entity.filterContext().self;
            if (self.flag?.('in_lava') === true) return params.breathesLava;
            if (self.flag?.('in_water') === true) return params.breathesWater;
            return params.breathesAir;
        };

        return {
            onInitialize: (entity) => {
                entity.componentState.set(AIR_STATE, { remaining: supply, untilHurt: hurtInterval });
            },
            onTick: (entity) => {
                const state = entity.componentState.get(AIR_STATE);
                if (state === undefined) return;

                if (canBreathe(entity)) {
                    entity.componentState.set(AIR_STATE, {
                        remaining: Math.min(supply, state.remaining + regain(entity)),
                        untilHurt: hurtInterval
                    });
                    return;
                }

                if (state.remaining > 0) {
                    entity.componentState.set(AIR_STATE, { ...state, remaining: state.remaining - 1 });
                    return;
                }

                const untilHurt = state.untilHurt - 1;
                entity.componentState.set(AIR_STATE, { ...state, untilHurt: untilHurt > 0 ? untilHurt : hurtInterval });
                if (untilHurt > 0) return;
                entity.damage({ cause: 'drowning', amount: SUFFOCATION_DAMAGE });
            }
        };
    }
};
