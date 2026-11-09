/** Components that decide how an entity attacks, what it may attack, and how it gets angry. */

import type { ComponentFactory } from '@jsprismarine/content';
import { accepted, rejected } from '@jsprismarine/content';
import type { Filter } from '@jsprismarine/packs';
import type { EntityInstance } from '../entityInstance';
import type { FilterEntityView } from '../filterContext';
import { evaluateFilter } from '../filters';
import type { EntityHooks } from '../hooks';
import { TICKS_PER_SECOND } from '../hooks';
import { booleanAt, isRecord, numberAt, parseFilterValue, stringAt } from './schemas';

import type { IntervalState, SensorTrigger } from './shared';
import { parseComponentTrigger, parseTimeRange } from './shared';

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
