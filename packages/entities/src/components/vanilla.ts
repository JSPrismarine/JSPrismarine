import type { ComponentFactory } from '@jsprismarine/content';
import { accepted, rejected } from '@jsprismarine/content';
import type { Filter } from '@jsprismarine/packs';

import type { EntityInstance } from '../entityInstance';
import { splitSpawnReference } from '../eventEngine';
import type { EventTarget } from '../events';
import { parseEventTarget } from '../events';
import { damagerSubjects, isPlayerView } from '../filterContext';
import type { FilterEntityView, FilterItemView } from '../filterContext';
import { evaluateFilter } from '../filters';
import type { EntityEquipmentSlot, EntityHooks, EntityStatusEffect } from '../hooks';
import type {
    EntityAddItemsRequest,
    EntityItemInteractionEffect,
    EntityItemInteractionState,
    EntityRepairItemRequest,
    EntitySpawnItemsRequest,
    EntityTameInteractionEffect
} from '../hooks';
import { TICKS_PER_SECOND } from '../hooks';
import type { EntitySpawnRequest } from '../hooks';
import type { RideableParams } from '../riding';
import type { TriggerComponentParams } from '../triggers';
import type { ComponentRecord } from './schemas';
import {
    asList,
    attributeComponent,
    booleanAt,
    isRecord,
    numberAt,
    numberComponent,
    parseFilterValue,
    recordSchema,
    stringAt
} from './schemas';

/**
 * The entity components this package implements with behavior, as opposed to
 * the ones it parses and exposes for another system to read.
 *
 * The order here follows the coverage curve in the research note: the stats
 * every mob needs first, then the sensors and timers that drive events.
 */

/** The component default used when an entity has no underwater movement component. */
export const DEFAULT_UNDERWATER_MOVEMENT = 0.02;

/** The attribute components, each one number the server reads off the entity. */
export const attributeComponents: readonly ComponentFactory<
    EntityHooks,
    { readonly value: number; readonly max: number }
>[] = [
    attributeComponent('minecraft:health', 'health', 20),
    attributeComponent('minecraft:movement', 'movement', 0.25),
    attributeComponent('minecraft:underwater_movement', 'underwater_movement', DEFAULT_UNDERWATER_MOVEMENT),
    attributeComponent('minecraft:lava_movement', 'lava_movement', 0.02),
    attributeComponent('minecraft:flying_speed', 'flying_speed', 0.02),
    attributeComponent('minecraft:follow_range', 'follow_range', 16),
    attributeComponent('minecraft:knockback_resistance', 'knockback_resistance', 0),
    attributeComponent('minecraft:attack_damage', 'attack_damage', 1),
    attributeComponent('minecraft:horse.jump_strength', 'jump_strength', 0.7)
];

/** A damage amount, which vanilla writes as a number or a `{range_min, range_max}` object. */
export interface DamageRange {
    readonly min: number;
    readonly max: number;
}

const parseDamageRange = (value: unknown): DamageRange => {
    if (typeof value === 'number') return { min: value, max: value };
    if (isRecord(value)) {
        const min = numberAt(value, 'range_min', 0);
        return { min, max: numberAt(value, 'range_max', min) };
    }
    return { min: 0, max: 0 };
};

/** What `minecraft:attack` declares. */
export interface AttackParams {
    readonly damage: DamageRange;
    /** The status effect a hit applies, such as `poison`. */
    readonly effectName?: string;
    /** How long the effect lasts, in seconds. */
    readonly effectDuration: number;
    /** One below the displayed potency of the effect. */
    readonly effectAmplifier: number;
}

/** What `minecraft:area_attack` declares. */
export interface AreaAttackParams {
    /** Damage cause reported to damage sensors and death handling. */
    readonly cause: string;
    /** Seconds between hits to the same target. */
    readonly damageCooldown: number;
    /** Damage dealt to each eligible target. */
    readonly damagePerTick: number;
    /** Maximum distance between the entities' collision boxes. */
    readonly damageRange: number;
    /** Filter a target has to pass before this component damages it. */
    readonly entityFilter: Filter | undefined;
    /** Localization key used when this attack kills a player. */
    readonly deathMessageOverride: string | undefined;
    /** Whether to play the attack sound for each eligible hit. */
    readonly playAttackSound: boolean;
    /** Whether the attacker is recorded as the source of damage. */
    readonly useSelfAsDamageSource: boolean;
}

/** `minecraft:area_attack`, whose range damage is applied by the dimension runtime. */
export const areaAttack: ComponentFactory<EntityHooks, AreaAttackParams> = {
    name: 'minecraft:area_attack',
    hooks: [],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        if (value.cause !== undefined && (typeof value.cause !== 'string' || value.cause.length === 0))
            return rejected('cause must be a non-empty string');
        if (
            value.damage_cooldown !== undefined &&
            (typeof value.damage_cooldown !== 'number' ||
                !Number.isFinite(value.damage_cooldown) ||
                value.damage_cooldown < 0)
        )
            return rejected('damage_cooldown must be a non-negative number');
        if (
            value.damage_per_tick !== undefined &&
            (typeof value.damage_per_tick !== 'number' ||
                !Number.isInteger(value.damage_per_tick) ||
                value.damage_per_tick < 0)
        )
            return rejected('damage_per_tick must be a non-negative integer');
        if (
            value.damage_range !== undefined &&
            (typeof value.damage_range !== 'number' || !Number.isFinite(value.damage_range) || value.damage_range < 0)
        )
            return rejected('damage_range must be a non-negative number');
        if (value.play_attack_sound !== undefined && typeof value.play_attack_sound !== 'boolean')
            return rejected('play_attack_sound must be a boolean');
        if (value.use_self_as_damage_source !== undefined && typeof value.use_self_as_damage_source !== 'boolean')
            return rejected('use_self_as_damage_source must be a boolean');
        if (value.death_message_override !== undefined && typeof value.death_message_override !== 'string')
            return rejected('death_message_override must be a string');

        let entityFilter: Filter | undefined;
        if (value.entity_filter !== undefined) {
            const parsed = parseFilterValue(value.entity_filter, 'minecraft:area_attack entity_filter');
            if (!parsed.ok) return parsed;
            entityFilter = parsed.value;
        }

        return accepted({
            cause: stringAt(value, 'cause') ?? 'entity_attack',
            damageCooldown: numberAt(value, 'damage_cooldown', 0),
            damagePerTick: numberAt(value, 'damage_per_tick', 2),
            damageRange: numberAt(value, 'damage_range', 0.2),
            entityFilter,
            deathMessageOverride: stringAt(value, 'death_message_override') || undefined,
            playAttackSound: booleanAt(value, 'play_attack_sound', true),
            useSelfAsDamageSource: booleanAt(value, 'use_self_as_damage_source', true)
        });
    },
    create: () => ({})
};

/** Whether one parsed filter has the normalized shape this component stores. */
const isParsedFilter = (value: unknown): value is Filter => {
    if (!isRecord(value)) return false;
    if (value.kind === 'test')
        return (
            typeof value.test === 'string' && typeof value.subject === 'string' && typeof value.operator === 'string'
        );
    return (
        value.kind === 'group' &&
        ['all_of', 'any_of', 'none_of'].includes(String(value.combinator)) &&
        Array.isArray(value.filters) &&
        value.filters.every(isParsedFilter)
    );
};

/** Checks the parsed component parameters before the runtime reads them. */
export const isAreaAttackParams = (value: unknown): value is AreaAttackParams =>
    isRecord(value) &&
    typeof value.cause === 'string' &&
    typeof value.damageCooldown === 'number' &&
    Number.isFinite(value.damageCooldown) &&
    value.damageCooldown >= 0 &&
    typeof value.damagePerTick === 'number' &&
    Number.isInteger(value.damagePerTick) &&
    value.damagePerTick >= 0 &&
    typeof value.damageRange === 'number' &&
    Number.isFinite(value.damageRange) &&
    value.damageRange >= 0 &&
    (value.entityFilter === undefined || isParsedFilter(value.entityFilter)) &&
    (value.deathMessageOverride === undefined || typeof value.deathMessageOverride === 'string') &&
    typeof value.playAttackSound === 'boolean' &&
    typeof value.useSelfAsDamageSource === 'boolean';

/**
 * `minecraft:attack`, the melee damage an entity deals. It also declares the
 * `attack_damage` attribute, so a group that swaps the component changes the
 * stat.
 */
export const attack: ComponentFactory<EntityHooks, AttackParams> = {
    name: 'minecraft:attack',
    hooks: ['onInitialize'],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        return accepted({
            damage: parseDamageRange(value.damage),
            effectName: stringAt(value, 'effect_name'),
            effectDuration: numberAt(value, 'effect_duration', 0),
            effectAmplifier: numberAt(value, 'effect_amplifier', 0)
        });
    },
    create: (params) => ({
        onInitialize: (entity) => {
            entity.attributes.define('attack_damage', { base: params.damage.min, max: params.damage.max });
        }
    })
};

/** What `minecraft:combat_regeneration` declares. */
export interface CombatRegenerationParams {
    /** Whether a same-family mob that kills this entity's attack target receives the buffs. */
    readonly applyToFamily: boolean;
    /** Whether this entity receives the buffs when it kills its attack target. */
    readonly applyToSelf: boolean;
    /** Regeneration duration in ticks, or `-1` when it never expires. */
    readonly regenerationDurationTicks: number;
}

/**
 * `minecraft:combat_regeneration`, which rewards the killer of the entity's
 * current attack target with Regeneration I and removes Mining Fatigue.
 */
export const combatRegeneration: ComponentFactory<EntityHooks, CombatRegenerationParams> = {
    name: 'minecraft:combat_regeneration',
    hooks: ['onAttackTargetKilled'],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');

        const duration = value.regeneration_duration ?? 5;
        const regenerationDurationTicks =
            duration === 'infinite'
                ? -1
                : typeof duration === 'number' && Number.isInteger(duration) && duration > 0
                  ? duration * TICKS_PER_SECOND
                  : undefined;
        if (regenerationDurationTicks === undefined)
            return rejected('regeneration_duration must be a positive integer or "infinite"');

        return accepted({
            applyToFamily: booleanAt(value, 'apply_to_family', false),
            applyToSelf: booleanAt(value, 'apply_to_self', false),
            regenerationDurationTicks
        });
    },
    create: (params) => ({
        onAttackTargetKilled: (entity, killer) => {
            const self = entity.filterContext().self;
            const selfId = self.id?.();
            const killerId = killer.id?.();
            const isSelf = selfId !== undefined && killerId === selfId;
            const sameFamily = entity.families().some((family) => killer.names?.('is_family')?.includes(family));
            const recipient =
                (isSelf && params.applyToSelf) || (!isSelf && sameFamily && params.applyToFamily) ? killer : undefined;
            if (recipient === undefined) return;

            entity.applyStatusEffect(recipient, {
                id: 'minecraft:regeneration',
                durationTicks: params.regenerationDurationTicks,
                amplifier: 0
            });
            entity.removeStatusEffect(recipient, 'minecraft:mining_fatigue');
        }
    })
};

/** What `minecraft:collision_box` declares, in blocks. */
export interface CollisionBoxParams {
    readonly width: number;
    readonly height: number;
}

/** `minecraft:collision_box`, the entity's hitbox. */
export const collisionBox: ComponentFactory<EntityHooks, CollisionBoxParams> = {
    name: 'minecraft:collision_box',
    hooks: [],
    schema: (value) =>
        isRecord(value)
            ? accepted({ width: numberAt(value, 'width', 1), height: numberAt(value, 'height', 1) })
            : rejected('expected an object'),
    create: () => ({})
};

/** What `minecraft:type_family` declares. */
export interface TypeFamilyParams {
    /** The families `is_family` matches against. */
    readonly family: readonly string[];
}

/** `minecraft:type_family`, the families the most used filter test reads. */
export const typeFamily: ComponentFactory<EntityHooks, TypeFamilyParams> = {
    name: 'minecraft:type_family',
    hooks: [],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        const family = asList(value.family).filter((name): name is string => typeof name === 'string');
        return accepted({ family });
    },
    create: () => ({})
};

/** What `minecraft:ignore_cannot_be_attacked` declares. */
export interface IgnoreCannotBeAttackedParams {
    /** Targets this entity may attack despite their `minecraft:cannot_be_attacked` component. */
    readonly filters: Filter | undefined;
}

const attackExceptions = new WeakMap<EntityInstance, Filter | undefined>();
const angryAttackFilters = new WeakMap<EntityInstance, Filter | undefined>();

/** `minecraft:ignore_cannot_be_attacked`, with its exception filter scoped to the active component. */
export const ignoreCannotBeAttacked: ComponentFactory<EntityHooks, IgnoreCannotBeAttackedParams> = {
    name: 'minecraft:ignore_cannot_be_attacked',
    hooks: ['onInitialize', 'onRemove'],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        if (value.filters === undefined) return accepted({ filters: undefined });
        const filters = parseFilterValue(value.filters, 'minecraft:ignore_cannot_be_attacked filters');
        return filters.ok ? accepted({ filters: filters.value }) : filters;
    },
    create: (params) => ({
        onInitialize: (entity) => attackExceptions.set(entity, params.filters),
        onRemove: (entity) => attackExceptions.delete(entity)
    })
};

/** Whether the attacker may damage a target view under the active attack filters. */
export const canEntityAttackView = (attacker: EntityInstance, target: FilterEntityView): boolean => {
    if (target.hasComponent?.('minecraft:cannot_be_attacked') === true) {
        if (!attackExceptions.has(attacker)) return false;

        const exceptions = attackExceptions.get(attacker);
        if (exceptions !== undefined && !evaluateFilter(exceptions, { ...attacker.filterContext(), other: target }))
            return false;
    }

    const filters = angryAttackFilters.get(attacker);
    return filters === undefined || !evaluateFilter(filters, { ...attacker.filterContext(), other: target });
};

/** Whether the attacker may damage the entity under the active attack filters. */
export const canEntityAttack = (attacker: EntityInstance, target: EntityInstance): boolean =>
    canEntityAttackView(attacker, target.filterContext().self);

/** What `minecraft:loot` declares. */
export interface LootParams {
    /** The pack-relative path of the loot table, such as `loot_tables/entities/zombie.json`. */
    readonly table?: string;
}

/** `minecraft:loot`, the table a later agent rolls on death. */
export const loot: ComponentFactory<EntityHooks, LootParams> = {
    name: 'minecraft:loot',
    hooks: [],
    schema: (value) =>
        isRecord(value) ? accepted({ table: stringAt(value, 'table') }) : rejected('expected an object'),
    create: () => ({})
};

/** What `minecraft:experience_reward` declares; both fields are Molang expressions. */
export interface ExperienceRewardParams {
    readonly onDeath?: string;
    readonly onBred?: string;
}

/** `minecraft:experience_reward`, the experience an entity drops. */
export const experienceReward: ComponentFactory<EntityHooks, ExperienceRewardParams> = {
    name: 'minecraft:experience_reward',
    hooks: [],
    schema: (value) =>
        isRecord(value)
            ? accepted({ onDeath: stringAt(value, 'on_death'), onBred: stringAt(value, 'on_bred') })
            : rejected('expected an object'),
    create: () => ({})
};

/** What `minecraft:physics` declares. */
export interface PhysicsParams {
    readonly hasGravity: boolean;
    readonly hasCollision: boolean;
    readonly pushTowardsClosestSpace: boolean;
}

/** `minecraft:physics`, carried by 126 of the 129 vanilla entities. */
export const physics: ComponentFactory<EntityHooks, PhysicsParams> = {
    name: 'minecraft:physics',
    hooks: [],
    schema: (value) =>
        isRecord(value)
            ? accepted({
                  hasGravity: booleanAt(value, 'has_gravity', true),
                  hasCollision: booleanAt(value, 'has_collision', true),
                  pushTowardsClosestSpace: booleanAt(value, 'push_towards_closest_space', false)
              })
            : rejected('expected an object'),
    create: () => ({})
};

/**
 * How many ticks apart an environmental hurt lands.
 *
 * Both editions give an entity half a second of invulnerability after
 * environmental damage, which is what makes `minecraft:hurt_on_condition`'s
 * `damage_per_tick: 4` in lava the four damage per half second a player sees
 * rather than eighty a second.
 */
export const HURT_INTERVAL_TICKS = 10;

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

interface IntervalState {
    remaining: number;
}

/**
 * `minecraft:hurt_on_condition`, carried by 87 vanilla entities and in all but
 * a few of them the lava rule.
 *
 * Every condition whose filters pass hurts, on the {@link HURT_INTERVAL_TICKS}
 * cadence, so the damage reaches the sensors, the immunities and the hurt
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
        const states = new WeakMap<EntityInstance, IntervalState>();
        return {
            onInitialize: (entity) => {
                states.set(entity, { remaining: 0 });
            },
            onTick: (entity) => {
                const state = states.get(entity);
                if (state === undefined) return;
                state.remaining -= 1;
                if (state.remaining > 0) return;

                const context = entity.filterContext();
                let hurt = false;
                for (const condition of params.conditions) {
                    if (condition.damagePerTick <= 0) continue;
                    if (condition.filters !== undefined && !evaluateFilter(condition.filters, context)) continue;
                    entity.damage({ cause: condition.cause, amount: condition.damagePerTick });
                    hurt = true;
                }
                state.remaining = hurt ? HURT_INTERVAL_TICKS : 0;
            }
        };
    }
};

/** Equipment slots accepted for `minecraft:burns_in_daylight` protection. */
export const BURNS_IN_DAYLIGHT_PROTECTION_SLOTS = [
    'slot.armor.body',
    'slot.armor.chest',
    'slot.armor.feet',
    'slot.armor.head',
    'slot.armor.legs',
    'slot.weapon.mainhand',
    'slot.weapon.offhand'
] as const;

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

/**
 * `minecraft:damage_over_time`, which hurts the entity while it is active.
 *
 * The axolotl, the dolphin and the vex are the three vanilla users, and two of
 * them write `time_between_hurt: 0`, which the engine floors at
 * {@link HURT_INTERVAL_TICKS} rather than hurting every tick.
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
        const states = new WeakMap<EntityInstance, IntervalState>();
        return {
            onInitialize: (entity) => {
                states.set(entity, { remaining: interval });
            },
            onTick: (entity) => {
                const state = states.get(entity);
                if (state === undefined || params.damagePerHurt <= 0) return;
                state.remaining -= 1;
                if (state.remaining > 0) return;
                state.remaining = interval;
                entity.damage({ cause: 'none', amount: params.damagePerHurt });
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
    readonly breathesLava: boolean;
    readonly generatesBubbles: boolean;
    readonly inhaleTime: number;
}

/** How much health one suffocation hurt takes, which both editions put at one heart. */
export const SUFFOCATION_DAMAGE = 2;

/** One entity's air, in ticks of supply left. */
interface AirState {
    remaining: number;
    /** Ticks until the next suffocation hurt, once the supply is gone. */
    untilHurt: number;
}

/**
 * `minecraft:breathable`, carried by 84 vanilla entities.
 *
 * The component holds the air supply and spends it. An entity in a medium it
 * cannot breathe loses a tick of supply per tick; one back in a medium it can
 * breathe refills to full, over `inhale_time` when the body names one. An
 * entity out of supply suffocates every `suffocate_time` seconds, or every
 * half second when the body writes the vanilla `0`.
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
            breathesLava: booleanAt(value, 'breathes_lava', false),
            generatesBubbles: booleanAt(value, 'generates_bubbles', true),
            inhaleTime: numberAt(value, 'inhale_time', 0)
        });
    },
    create: (params) => {
        const supply = Math.max(0, Math.round(params.totalSupply * TICKS_PER_SECOND));
        const hurtInterval =
            params.suffocateTime > 0 ? Math.round(params.suffocateTime * TICKS_PER_SECOND) : HURT_INTERVAL_TICKS;
        const inhale = Math.max(1, Math.round(params.inhaleTime * TICKS_PER_SECOND));
        const states = new WeakMap<EntityInstance, AirState>();

        /** Whether the medium the entity is in is one the component says it breathes. */
        const canBreathe = (entity: EntityInstance): boolean => {
            const self = entity.filterContext().self;
            if (self.flag?.('in_lava') === true) return params.breathesLava;
            if (self.flag?.('in_water') === true) return params.breathesWater;
            return params.breathesAir;
        };

        return {
            onInitialize: (entity) => {
                states.set(entity, { remaining: supply, untilHurt: hurtInterval });
            },
            onTick: (entity) => {
                const state = states.get(entity);
                if (state === undefined) return;

                if (canBreathe(entity)) {
                    state.remaining = Math.min(supply, state.remaining + Math.ceil(supply / inhale));
                    state.untilHurt = hurtInterval;
                    return;
                }

                if (state.remaining > 0) {
                    state.remaining -= 1;
                    return;
                }

                state.untilHurt -= 1;
                if (state.untilHurt > 0) return;
                state.untilHurt = hurtInterval;
                entity.damage({ cause: 'drowning', amount: SUFFOCATION_DAMAGE });
            }
        };
    }
};

/** What `minecraft:pushable` declares. */
export interface PushableParams {
    readonly isPushable: boolean;
    readonly isPushableByPiston: boolean;
}

/** `minecraft:pushable`, which the 1.26.50 component schema omits but 27 entities use. */
export const pushable: ComponentFactory<EntityHooks, PushableParams> = {
    name: 'minecraft:pushable',
    hooks: [],
    schema: (value) =>
        isRecord(value)
            ? accepted({
                  isPushable: booleanAt(value, 'is_pushable', true),
                  isPushableByPiston: booleanAt(value, 'is_pushable_by_piston', true)
              })
            : rejected('expected an object'),
    create: () => ({})
};

/** What `minecraft:inventory` declares. */
export interface InventoryParams {
    readonly containerType: string;
    readonly inventorySize: number;
    readonly isPrivate: boolean;
    readonly restrictToOwner: boolean;
    readonly additionalSlotsPerStrength: number;
    readonly canBeSiphonedFrom: boolean;
}

/** `minecraft:inventory`, the container a mob carries. */
export const inventory: ComponentFactory<EntityHooks, InventoryParams> = {
    name: 'minecraft:inventory',
    hooks: [],
    schema: (value) =>
        isRecord(value)
            ? accepted({
                  containerType: stringAt(value, 'container_type') ?? 'inventory',
                  inventorySize: numberAt(value, 'inventory_size', 5),
                  isPrivate: booleanAt(value, 'private', false),
                  restrictToOwner: booleanAt(value, 'restrict_to_owner', false),
                  additionalSlotsPerStrength: numberAt(value, 'additional_slots_per_strength', 0),
                  canBeSiphonedFrom: booleanAt(value, 'can_be_siphoned_from', false)
              })
            : rejected('expected an object'),
    create: () => ({})
};

/** One entry of `minecraft:equipment.slot_drop_chance`. */
export interface SlotDropChance {
    readonly slot: string;
    readonly dropChance: number;
}

/** What `minecraft:equipment` declares. */
export interface EquipmentParams {
    /** The loot table the entity equips from. */
    readonly table?: string;
    readonly slotDropChance: readonly SlotDropChance[];
}

/** `minecraft:equipment`, the loot table a mob wears. */
export const equipment: ComponentFactory<EntityHooks, EquipmentParams> = {
    name: 'minecraft:equipment',
    hooks: [],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        const slotDropChance = asList(value.slot_drop_chance)
            .filter(isRecord)
            .map((entry) => ({
                slot: stringAt(entry, 'slot') ?? '',
                dropChance: numberAt(entry, 'drop_chance', 0)
            }));
        return accepted({ table: stringAt(value, 'table'), slotDropChance });
    },
    create: () => ({})
};

/**
 * `minecraft:rideable`, carried by 36 vanilla entities.
 *
 * The seats themselves are state the vehicle holds, so mounting goes through
 * {@link EntityInstance.mount} and the component's part is the seat count, the
 * families allowed in and the two events. Taking the component off empties the
 * seats, which is what a group swap that removes a saddle does.
 */
export const rideable: ComponentFactory<EntityHooks, RideableParams> = {
    name: 'minecraft:rideable',
    hooks: ['onRemove'],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        const seats = asList(value.seats)
            .filter(isRecord)
            .map((seat) => {
                const position = Array.isArray(seat.position)
                    ? seat.position.filter((part): part is number => typeof part === 'number')
                    : [];
                const minRiderCount = numberAt(seat, 'min_rider_count', 0);
                const rotate = seat.rotate_rider_by;
                return {
                    position: [position[0] ?? 0, position[1] ?? 0, position[2] ?? 0] as const,
                    minRiderCount,
                    maxRiderCount: numberAt(seat, 'max_rider_count', minRiderCount),
                    lockRiderRotation: numberAt(seat, 'lock_rider_rotation', 181),
                    rotateRiderBy: typeof rotate === 'number' || typeof rotate === 'string' ? rotate : undefined
                };
            });
        return accepted({
            seatCount: numberAt(value, 'seat_count', 1),
            seats,
            familyTypes: asList(value.family_types).filter((name): name is string => typeof name === 'string'),
            interactText: stringAt(value, 'interact_text'),
            crouchingSkipInteract: booleanAt(value, 'crouching_skip_interact', true),
            pullInEntities: booleanAt(value, 'pull_in_entities', false),
            onRiderEnterEvent: stringAt(value, 'on_rider_enter_event'),
            onRiderExitEvent: stringAt(value, 'on_rider_exit_event')
        });
    },
    create: () => ({
        onRemove: (entity) => entity.ejectRiders()
    })
};

/** What `minecraft:navigation.*` declares; every field is a capability of the path finder. */
export interface NavigationParams {
    /** The navigation flavor, such as `walk` or `generic`. */
    readonly kind: string;
    readonly canPathOverWater: boolean;
    readonly canPathOverLava: boolean;
    readonly canPathFromAir: boolean;
    readonly canFloat: boolean;
    readonly canSink: boolean;
    readonly canSwim: boolean;
    readonly canWalk: boolean;
    readonly canWalkInLava: boolean;
    readonly canFly: boolean;
    readonly canBreach: boolean;
    readonly canJump: boolean;
    readonly canOpenDoors: boolean;
    readonly canOpenIronDoors: boolean;
    readonly canPassDoors: boolean;
    readonly canBreakDoors: boolean;
    readonly usingDoorAnnotation: boolean;
    readonly avoidWater: boolean;
    readonly avoidSun: boolean;
    readonly avoidPortals: boolean;
    readonly avoidDamageBlocks: boolean;
    readonly isAmphibious: boolean;
    /** Block names and tags the path finder treats as impassable. */
    readonly blocksToAvoid: readonly unknown[];
}

/** Builds one `minecraft:navigation.<kind>` component. */
export const navigationComponent = (kind: string): ComponentFactory<EntityHooks, NavigationParams> => ({
    name: `minecraft:navigation.${kind}`,
    hooks: [],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        return accepted({
            kind,
            canPathOverWater: booleanAt(value, 'can_path_over_water', false),
            canPathOverLava: booleanAt(value, 'can_path_over_lava', false),
            canPathFromAir: booleanAt(value, 'can_path_from_air', false),
            canFloat: booleanAt(value, 'can_float', false),
            canSink: booleanAt(value, 'can_sink', true),
            canSwim: booleanAt(value, 'can_swim', kind === 'swim'),
            canWalk: booleanAt(value, 'can_walk', kind !== 'fly' && kind !== 'hover' && kind !== 'float'),
            canWalkInLava: booleanAt(value, 'can_walk_in_lava', false),
            canFly: booleanAt(value, 'can_fly', kind === 'fly' || kind === 'hover' || kind === 'float'),
            canBreach: booleanAt(value, 'can_breach', false),
            canJump: booleanAt(value, 'can_jump', true),
            canOpenDoors: booleanAt(value, 'can_open_doors', false),
            canOpenIronDoors: booleanAt(value, 'can_open_iron_doors', false),
            canPassDoors: booleanAt(value, 'can_pass_doors', true),
            canBreakDoors: booleanAt(value, 'can_break_doors', false),
            usingDoorAnnotation: booleanAt(value, 'using_door_annotation', false),
            avoidWater: booleanAt(value, 'avoid_water', false),
            avoidSun: booleanAt(value, 'avoid_sun', false),
            avoidPortals: booleanAt(value, 'avoid_portals', false),
            avoidDamageBlocks: booleanAt(value, 'avoid_damage_blocks', false),
            isAmphibious: booleanAt(value, 'is_amphibious', false),
            blocksToAvoid: asList(value.blocks_to_avoid)
        });
    },
    create: () => ({})
});

/** What a `minecraft:movement.*` component declares. */
export interface MovementModeParams {
    /** The movement flavor, such as `basic` or `sway`. */
    readonly kind: string;
    /** The most degrees the entity turns per tick. */
    readonly maxTurn: number;
}

/** Builds one `minecraft:movement.<kind>` component. */
export const movementComponent = (
    kind: string,
    defaultMaxTurn = 30
): ComponentFactory<EntityHooks, MovementModeParams> => ({
    name: `minecraft:movement.${kind}`,
    hooks: [],
    schema: (value) =>
        isRecord(value)
            ? accepted({ kind, maxTurn: numberAt(value, 'max_turn', defaultMaxTurn) })
            : rejected('expected an object'),
    create: () => ({})
});

/** What `minecraft:jump.static` declares. */
export interface JumpParams {
    readonly jumpPower: number;
}

/** `minecraft:jump.static`, the fixed jump height 79 entities use. */
export const jumpStatic: ComponentFactory<EntityHooks, JumpParams> = {
    name: 'minecraft:jump.static',
    hooks: [],
    schema: (value) =>
        isRecord(value) ? accepted({ jumpPower: numberAt(value, 'jump_power', 0.42) }) : rejected('expected an object'),
    create: () => ({})
};

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

const parseTimeRange = (value: unknown): readonly [number, number] => {
    if (typeof value === 'number') return [value, value];
    if (Array.isArray(value)) {
        const parts = value.filter((part): part is number => typeof part === 'number');
        return [parts[0] ?? 0, parts[1] ?? parts[0] ?? 0];
    }
    return [0, 0];
};

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

/** Adds the default vanilla namespace to a component identifier that omits it. */
const qualifiedSpawnIdentifier = (identifier: string): string =>
    identifier.includes(':') ? identifier : `minecraft:${identifier}`;

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

/** `minecraft:spawn_egg_interaction`, which creates the entity's offspring from its matching egg. */
export const spawnEggInteraction: ComponentFactory<EntityHooks, ComponentRecord> = {
    name: 'minecraft:spawn_egg_interaction',
    hooks: ['onInteractWithItem'],
    schema: recordSchema,
    create: () => ({
        onInteractWithItem: (entity, _itemIdentifier, _other, state?: EntityItemInteractionState) => {
            const spawnEgg = state?.spawnEgg;
            if (spawnEgg === undefined || spawnEgg.identifier !== entity.type.identifier) return false;
            return { spawnOffspring: spawnEgg.offspringIdentifier };
        }
    })
};

/** One `{filters, event, target}` trigger, which five component bodies share. */
export interface SensorTrigger {
    readonly filters?: Filter;
    readonly event?: string;
    readonly target: EventTarget;
}

/** Reads an event trigger written as a string or `{event, target}` object. */
const parseComponentTrigger = (value: unknown): SensorTrigger | undefined => {
    if (typeof value === 'string') return { event: value, target: 'self' };
    if (!isRecord(value)) return undefined;
    const event = stringAt(value, 'event');
    if (event === undefined) return undefined;
    return { event, target: parseEventTarget(value.target, () => undefined) };
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

interface InteractCooldownState {
    readonly interactions: number[];
    readonly attacked: number[];
}

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
    hooks: ['onInitialize', 'onRemove', 'onTick', 'onDamageProcessed', 'onInteractWithItem'],
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
        const cooldowns = new WeakMap<EntityInstance, InteractCooldownState>();
        const cooldownsFor = (entity: EntityInstance): InteractCooldownState => {
            let state = cooldowns.get(entity);
            if (state === undefined) {
                state = {
                    interactions: params.interactions.map(() => 0),
                    attacked: params.interactions.map(() => 0)
                };
                cooldowns.set(entity, state);
            }
            return state;
        };
        return {
            onInitialize: (entity) => {
                cooldowns.set(entity, {
                    interactions: params.interactions.map(() => 0),
                    attacked: params.interactions.map(() => 0)
                });
                if (reported.has(entity)) return;
                reported.add(entity);
                const unsupported = [...new Set(params.interactions.flatMap((entry) => entry.unsupportedFields))];
                if (unsupported.length > 0)
                    entity.report(`minecraft:interact fields ${unsupported.join(', ')} are not carried out`);
            },
            onRemove: (entity) => {
                cooldowns.delete(entity);
            },
            onTick: (entity) => {
                const state = cooldownsFor(entity);
                for (let index = 0; index < params.interactions.length; index += 1) {
                    state.interactions[index] = Math.max(0, (state.interactions[index] ?? 0) - 1);
                    state.attacked[index] = Math.max(0, (state.attacked[index] ?? 0) - 1);
                }
            },
            onDamageProcessed: (entity) => {
                const state = cooldownsFor(entity);
                for (let index = 0; index < params.interactions.length; index += 1) {
                    const delay = params.interactions[index]?.cooldownAfterBeingAttacked ?? 0;
                    if (delay > 0) state.attacked[index] = interactionCooldownTicks(delay);
                }
            },
            onInteractWithItem: (entity, itemIdentifier, other): boolean | EntityItemInteractionEffect | undefined => {
                const normalizedItem = normalizedItemIdentifier(itemIdentifier);
                const heldItem = other?.equipment?.('hand', 0) ?? { identifier: () => normalizedItem };
                const subjects = other === undefined ? {} : { other, player: other };
                const context = { ...entity.filterContext(), ...subjects, item: heldItem };
                const state = cooldownsFor(entity);
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
                    state.interactions[index] = interactionCooldownTicks(entry.cooldown);
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

interface EntitySensorState {
    readonly cooldowns: number[];
}

const isEntitySensorRange = (value: unknown): value is readonly [number, number] =>
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    Number.isFinite(value[0]) &&
    value[0] >= 0 &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[1]) &&
    value[1] >= 0;

const sensorNumber = (record: ComponentRecord, key: string, fallback: number): number | undefined => {
    const value = record[key];
    if (value === undefined) return fallback;
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

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
    hooks: ['onInitialize', 'onRemove', 'onTick'],
    schema: (value) => {
        const parsed = parseEntitySensor(value);
        return parsed.ok ? accepted(parsed.params) : rejected(parsed.message);
    },
    create: (params) => {
        const states = new WeakMap<EntityInstance, EntitySensorState>();
        return {
            onInitialize: (entity) => states.set(entity, { cooldowns: params.subsensors.map(() => 0) }),
            onRemove: (entity) => states.delete(entity),
            onTick: (entity) => {
                const state = states.get(entity);
                if (state === undefined) return;

                for (const [index, subsensor] of params.subsensors.entries()) {
                    const remaining = state.cooldowns[index] ?? 0;
                    if (remaining > 0) {
                        state.cooldowns[index] = remaining - 1;
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
                    if (subsensor.cooldown >= 0)
                        state.cooldowns[index] = Math.ceil(subsensor.cooldown * TICKS_PER_SECOND);
                }
            }
        };
    }
};

/** What `minecraft:mob_effect` declares. */
export interface MobEffectParams {
    /** The effect applied to matching entities. */
    readonly effect: string;
    /** The effect duration, or `-1` when it never expires. */
    readonly durationTicks: number;
    /** Distance to search in the horizontal and vertical axes. */
    readonly effectRange: number;
    /** Ticks to wait between applications after one or more targets accept it. */
    readonly cooldownTicks: number;
    /** Optional filter evaluated with the source as `self` and each candidate as `other`. */
    readonly entityFilter?: Filter;
    /** Whether the applied effect uses the ambient visual style. */
    readonly ambient: boolean;
}

/** The accepted status-effect request produced by `minecraft:spell_effects`. */
export interface SpellEffectParams extends EntityStatusEffect {
    /** Whether the target displays the effect's particles and HUD icon. */
    readonly visible: boolean;
}

/** What `minecraft:spell_effects` declares. */
export interface SpellEffectsParams {
    readonly addEffects: readonly SpellEffectParams[];
    readonly removeEffects: readonly string[];
}

interface MobEffectState {
    cooldownTicks: number;
}

const effectDurationTicksOf = (value: unknown): number | undefined => {
    if (value === 'infinite') return -1;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
    return Math.max(1, Math.round(value * TICKS_PER_SECOND));
};

const mobEffectParamsOf = (
    value: unknown
): { readonly ok: true; readonly params: MobEffectParams } | { readonly ok: false; readonly message: string } => {
    if (!isRecord(value)) return { ok: false, message: 'expected an object' };

    const effect = stringAt(value, 'mob_effect');
    if (effect === undefined || effect.length === 0)
        return { ok: false, message: 'mob_effect must name a status effect' };

    const effectRange = sensorNumber(value, 'effect_range', 0.2);
    if (effectRange === undefined || effectRange < 0)
        return { ok: false, message: 'effect_range must be a non-negative number' };

    const durationTicks = effectDurationTicksOf(value.effect_time ?? 10);
    if (durationTicks === undefined)
        return { ok: false, message: "effect_time must be a positive number or 'infinite'" };

    const cooldownSeconds = sensorNumber(value, 'cooldown_time', 0);
    if (cooldownSeconds === undefined || cooldownSeconds < 0)
        return { ok: false, message: 'cooldown_time must be a non-negative number' };
    if (value.ambient !== undefined && typeof value.ambient !== 'boolean')
        return { ok: false, message: 'ambient must be a boolean' };

    let entityFilter: Filter | undefined;
    if (value.entity_filter !== undefined) {
        const parsed = parseFilterValue(value.entity_filter, 'minecraft:mob_effect entity_filter');
        if (!parsed.ok) return { ok: false, message: parsed.message };
        entityFilter = parsed.value;
    }

    return {
        ok: true,
        params: {
            effect,
            durationTicks,
            effectRange,
            cooldownTicks: Math.ceil(cooldownSeconds * TICKS_PER_SECOND),
            ...(entityFilter === undefined ? {} : { entityFilter }),
            ambient: booleanAt(value, 'ambient', false)
        }
    };
};

/** `minecraft:mob_effect`, which applies an effect to matching nearby entities and players. */
export const mobEffect: ComponentFactory<EntityHooks, MobEffectParams> = {
    name: 'minecraft:mob_effect',
    hooks: ['onInitialize', 'onRemove', 'onTick'],
    schema: (value) => {
        const parsed = mobEffectParamsOf(value);
        return parsed.ok ? accepted(parsed.params) : rejected(parsed.message);
    },
    create: (params) => {
        const states = new WeakMap<EntityInstance, MobEffectState>();
        return {
            onInitialize: (entity) => states.set(entity, { cooldownTicks: 0 }),
            onRemove: (entity) => states.delete(entity),
            onTick: (entity) => {
                const state = states.get(entity);
                if (state === undefined) return;
                if (state.cooldownTicks > 0) {
                    state.cooldownTicks -= 1;
                    return;
                }

                const candidates = entity.entitySensorCandidates({
                    horizontalRange: params.effectRange,
                    verticalRange: params.effectRange,
                    yOffset: 0,
                    relativeRange: false,
                    findPlayersOnly: false
                });
                const context = entity.filterContext();
                let applied = false;
                for (const candidate of candidates) {
                    if (
                        params.entityFilter !== undefined &&
                        !evaluateFilter(params.entityFilter, { ...context, other: candidate.view })
                    )
                        continue;

                    applied =
                        entity.applyStatusEffect(candidate.view, {
                            id: params.effect,
                            durationTicks: params.durationTicks,
                            amplifier: 0,
                            ambient: params.ambient
                        }) || applied;
                }
                if (applied && params.cooldownTicks > 0) state.cooldownTicks = params.cooldownTicks - 1;
            }
        };
    }
};

const spellEffectsParamsOf = (
    value: unknown
): { readonly ok: true; readonly params: SpellEffectsParams } | { readonly ok: false; readonly message: string } => {
    if (!isRecord(value)) return { ok: false, message: 'expected an object' };

    const addEffects: SpellEffectParams[] = [];
    if (value.add_effects !== undefined && !Array.isArray(value.add_effects))
        return { ok: false, message: 'add_effects must be an array' };
    for (const [index, raw] of asList(value.add_effects).entries()) {
        if (!isRecord(raw) || typeof raw.effect !== 'string' || raw.effect.length === 0)
            return { ok: false, message: `add_effects[${index}].effect must name a status effect` };
        const durationTicks = effectDurationTicksOf(raw.duration);
        if (durationTicks === undefined)
            return { ok: false, message: `add_effects[${index}].duration must be a positive number or 'infinite'` };
        if (raw.amplifier !== undefined && (typeof raw.amplifier !== 'number' || !Number.isFinite(raw.amplifier)))
            return { ok: false, message: `add_effects[${index}].amplifier must be a finite number` };
        if (raw.ambient !== undefined && typeof raw.ambient !== 'boolean')
            return { ok: false, message: `add_effects[${index}].ambient must be a boolean` };
        if (raw.visible !== undefined && typeof raw.visible !== 'boolean')
            return { ok: false, message: `add_effects[${index}].visible must be a boolean` };

        const visible = booleanAt(raw, 'visible', true);
        addEffects.push({
            id: raw.effect,
            durationTicks,
            amplifier: numberAt(raw, 'amplifier', 0),
            ambient: booleanAt(raw, 'ambient', false),
            visible,
            showParticles: visible,
            showIcon: visible
        });
    }

    const removeValue = value.remove_effects;
    const removeEffects =
        typeof removeValue === 'string'
            ? [removeValue]
            : removeValue === undefined
              ? []
              : asList(removeValue).filter((identifier): identifier is string => typeof identifier === 'string');
    if (removeValue !== undefined && typeof removeValue !== 'string' && !Array.isArray(removeValue))
        return { ok: false, message: 'remove_effects must be a string or an array of strings' };
    if (Array.isArray(removeValue) && !removeValue.every((identifier) => typeof identifier === 'string'))
        return { ok: false, message: 'remove_effects must contain only strings' };
    if (removeEffects.some((identifier) => identifier.length === 0))
        return { ok: false, message: 'remove_effects identifiers must be non-empty strings' };

    return { ok: true, params: { addEffects, removeEffects } };
};

/** `minecraft:spell_effects`, the one-time effect operation performed when the component is added. */
export const spellEffects: ComponentFactory<EntityHooks, SpellEffectsParams> = {
    name: 'minecraft:spell_effects',
    hooks: ['onInitialize'],
    schema: (value) => {
        const parsed = spellEffectsParamsOf(value);
        return parsed.ok ? accepted(parsed.params) : rejected(parsed.message);
    },
    create: (params) => ({
        onInitialize: (entity) => {
            if (entity.restoring) return;
            const target = entity.filterContext().self;
            for (const effect of params.addEffects)
                entity.applyStatusEffect(target, {
                    id: effect.id,
                    durationTicks: effect.durationTicks,
                    amplifier: effect.amplifier,
                    ambient: effect.ambient,
                    showParticles: effect.showParticles,
                    showIcon: effect.showIcon
                });
            for (const effect of params.removeEffects) entity.removeStatusEffect(target, effect);
        }
    })
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

const insideBlockNotifierState = new WeakMap<EntityInstance, ReadonlySet<number>>();

/** `minecraft:inside_block_notifier`, which raises events on block-state transitions. */
export const insideBlockNotifier: ComponentFactory<EntityHooks, InsideBlockNotifierParams> = {
    name: 'minecraft:inside_block_notifier',
    hooks: ['onInitialize', 'onRemove', 'onTick'],
    schema: (value) => {
        const parsed = parseInsideBlockNotifier(value);
        return parsed.ok ? accepted(parsed.params) : rejected(parsed.message);
    },
    create: (params) => ({
        onInitialize: (entity) => insideBlockNotifierState.set(entity, new Set()),
        onRemove: (entity) => insideBlockNotifierState.delete(entity),
        onTick: (entity) => {
            const previous = insideBlockNotifierState.get(entity);
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

            const next = new Set<number>();
            for (const [index, entry] of params.blockList.entries()) {
                const matches = blocks.some(
                    (block) =>
                        block !== undefined &&
                        block.identifier === entry.blockName &&
                        Object.entries(entry.states).every(([name, expected]) => block.states[name] === expected)
                );
                const wasInside = previous.has(index);
                if (matches) {
                    next.add(index);
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
                    next.add(index);
                }
            }
            insideBlockNotifierState.set(entity, next);
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

interface TargetNearbySensorState {
    targetId: string | number | undefined;
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
    hooks: ['onInitialize', 'onRemove', 'onTick'],
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
        const states = new WeakMap<EntityInstance, TargetNearbySensorState>();
        return {
            onInitialize: (entity) => {
                states.set(entity, {
                    targetId: undefined,
                    inRange: false,
                    visibleInsideRange: false,
                    insideEventFired: false
                });
            },
            onRemove: (entity) => states.delete(entity),
            onTick: (entity) => {
                const state = states.get(entity);
                if (state === undefined) return;

                const target = entity.targetProximity();
                if (state.targetId !== target?.id) {
                    if (state.inRange) raiseTargetNearbyEvent(entity, params.onOutsideRange);
                    state.targetId = target?.id;
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

/** Normalizes an item identifier with Bedrock's default namespace. */
const normalizedItemIdentifier = (identifier: string): string =>
    identifier.includes(':') ? identifier : `minecraft:${identifier}`;

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

/** What `minecraft:angry` declares. */
export interface AngryParams {
    /** How long the anger lasts, in seconds. */
    readonly duration: number;
    /** How far either side of `duration` the engine draws the real length. */
    readonly durationDelta: number;
    /** The event fired when the anger runs out. */
    readonly calm?: SensorTrigger;
    /** Whether anger spreads to nearby matching entities. */
    readonly broadcastAnger: boolean;
    /** Whether this entity broadcasts anger when it attacks. */
    readonly broadcastAngerOnAttack: boolean;
    /** Whether this entity broadcasts anger when another entity attacks it. */
    readonly broadcastAngerOnBeingAttacked: boolean;
    /** Whether this entity broadcasts anger when it dies; defaults to true. */
    readonly broadcastAngerWhenDying: boolean;
    readonly broadcastRange: number;
    /** A mob that passes this filter is excluded from attack targets while this component is active. */
    readonly filters?: Filter;
    readonly angrySound?: string;
    /** Integer seconds between repeated angry sounds; a zero interval disables repeats. */
    readonly soundInterval: readonly [number, number];
    readonly broadcastFilters?: Filter;
    /** Entity families that receive the anger; omitted means the same entity type. */
    readonly broadcastTargets?: readonly string[];
}

/**
 * `minecraft:angry`, carried by 20 vanilla entities.
 *
 * The component counts the anger down and fires `calm_event` when it runs out,
 * which is what takes the angry group back off. `broadcast_anger` asks the
 * world to notify nearby matching entities when anger starts, the mob attacks,
 * it is attacked, or it dies. Its filters exclude targets and its angry sound
 * repeats on the configured interval.
 *
 * The bee and the dolphin write the pre-rename `broadcastAnger` and
 * `broadcastRange`, so both spellings read.
 */
export const angry: ComponentFactory<EntityHooks, AngryParams> = {
    name: 'minecraft:angry',
    hooks: ['onInitialize', 'onRemove', 'onTick', 'onFriendlyAnger', 'onAttack', 'onDamageProcessed'],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        let filters: Filter | undefined;
        if (value.filters !== undefined) {
            const parsed = parseFilterValue(value.filters, 'minecraft:angry filters');
            if (!parsed.ok) return parsed;
            filters = parsed.value;
        }
        let broadcastFilters: Filter | undefined;
        if (value.broadcast_filters !== undefined) {
            const parsed = parseFilterValue(value.broadcast_filters, 'minecraft:angry broadcast_filters');
            if (!parsed.ok) return parsed;
            broadcastFilters = parsed.value;
        }
        let broadcastTargets: readonly string[] | undefined;
        if (value.broadcast_targets !== undefined) {
            if (!Array.isArray(value.broadcast_targets))
                return rejected('broadcast_targets must be an array of strings');
            const targets: string[] = [];
            for (const target of value.broadcast_targets) {
                if (typeof target !== 'string' || target.length === 0)
                    return rejected('broadcast_targets entries must be non-empty strings');
                targets.push(target);
            }
            broadcastTargets = targets;
        }
        return accepted({
            duration: numberAt(value, 'duration', 25),
            durationDelta: numberAt(value, 'duration_delta', 0),
            calm: parseComponentTrigger(value.calm_event),
            broadcastAnger: booleanAt(value, 'broadcast_anger', booleanAt(value, 'broadcastAnger', false)),
            broadcastAngerOnAttack: booleanAt(value, 'broadcast_anger_on_attack', false),
            broadcastAngerOnBeingAttacked: booleanAt(value, 'broadcast_anger_on_being_attacked', false),
            broadcastAngerWhenDying: booleanAt(value, 'broadcast_anger_when_dying', true),
            broadcastRange: numberAt(value, 'broadcast_range', numberAt(value, 'broadcastRange', 20)),
            filters,
            angrySound: stringAt(value, 'angry_sound'),
            soundInterval: parseTimeRange(value.sound_interval),
            broadcastFilters,
            broadcastTargets
        });
    },
    create: (params) => {
        const states = new WeakMap<EntityInstance, IntervalState>();
        const soundStates = new WeakMap<EntityInstance, IntervalState>();
        const pendingBroadcasts = new WeakSet<EntityInstance>();
        const soundInterval = (entity: EntityInstance): number => {
            const [first, second] = params.soundInterval;
            const min = Math.max(0, Math.ceil(Math.min(first, second)));
            const max = Math.max(min, Math.floor(Math.max(first, second)));
            return max === min ? min : min + Math.floor(entity.random.next() * (max - min + 1));
        };
        const playSound = (entity: EntityInstance): void => {
            if (params.angrySound === undefined) return;
            if (!entity.perform({ name: 'play_sound', sound: params.angrySound }))
                entity.report(`minecraft:angry cannot play sound ${params.angrySound}, which nothing handles`);
        };
        const broadcast = (entity: EntityInstance, target?: FilterEntityView): void => {
            entity.broadcastAnger({
                range: params.broadcastRange,
                ...(params.broadcastFilters === undefined ? {} : { filters: params.broadcastFilters }),
                ...(params.broadcastTargets === undefined ? {} : { targets: params.broadcastTargets }),
                ...(target === undefined ? {} : { target })
            });
        };
        const restart = (entity: EntityInstance): void => {
            const delta = params.durationDelta * (entity.random.next() * 2 - 1);
            states.set(entity, { remaining: Math.round((params.duration + delta) * TICKS_PER_SECOND) });
            angryAttackFilters.set(entity, params.filters);
            soundStates.delete(entity);
            if (params.angrySound !== undefined) {
                playSound(entity);
                const interval = soundInterval(entity);
                if (interval > 0) soundStates.set(entity, { remaining: interval * TICKS_PER_SECOND });
            }
            if (params.broadcastAnger) pendingBroadcasts.add(entity);
        };
        return {
            onInitialize: restart,
            onFriendlyAnger: restart,
            onAttack: (entity, target) => {
                if (params.broadcastAngerOnAttack) broadcast(entity, target);
            },
            onDamageProcessed: (entity, damage, result) => {
                if (result.died) {
                    pendingBroadcasts.delete(entity);
                    if (params.broadcastAngerWhenDying) broadcast(entity, damage.damager);
                    return;
                }
                if (params.broadcastAngerOnBeingAttacked && damage.damager !== undefined)
                    broadcast(entity, damage.damager);
            },
            onRemove: (entity) => {
                states.delete(entity);
                soundStates.delete(entity);
                pendingBroadcasts.delete(entity);
                angryAttackFilters.delete(entity);
            },
            onTick: (entity) => {
                if (pendingBroadcasts.delete(entity)) broadcast(entity);
                const sound = soundStates.get(entity);
                if (sound !== undefined) {
                    sound.remaining -= 1;
                    if (sound.remaining <= 0) {
                        playSound(entity);
                        const interval = soundInterval(entity);
                        if (interval > 0) sound.remaining = interval * TICKS_PER_SECOND;
                        else soundStates.delete(entity);
                    }
                }
                const state = states.get(entity);
                if (state === undefined) return;
                state.remaining -= 1;
                if (state.remaining > 0) return;
                states.delete(entity);
                if (params.calm?.event !== undefined)
                    entity.raise(params.calm.event, params.calm.target, 'minecraft:angry');
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

/** The three integer state components filters and the wire both read. */
export const integerStateComponents: readonly ComponentFactory<EntityHooks, number>[] = [
    numberComponent('minecraft:variant', 'value', 0),
    numberComponent('minecraft:mark_variant', 'value', 0),
    numberComponent('minecraft:skin_id', 'value', 0),
    numberComponent('minecraft:scale', 'value', 1),
    numberComponent('minecraft:color', 'value', 0),
    numberComponent('minecraft:color2', 'value', 0)
];

/** `minecraft:air_drag_modifier`, the multiplier on air resistance. */
export const airDragModifier = numberComponent('minecraft:air_drag_modifier', 'value', 1);

/** `minecraft:friction_modifier`, the multiplier on ground friction. */
export const frictionModifier = numberComponent('minecraft:friction_modifier', 'value', 1);

/** `minecraft:bounciness`, the fraction of impact velocity restored on a collision. */
export const bounciness = numberComponent('minecraft:bounciness', 'value', 0);
