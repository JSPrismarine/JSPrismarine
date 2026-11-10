/** Components that apply status effects: `minecraft:mob_effect` and `minecraft:spell_effects`. */

import type { ComponentFactory } from '@jsprismarine/content';
import { accepted, rejected } from '@jsprismarine/content';
import type { Filter } from '@jsprismarine/packs';
import { defineComponentState, stateField } from '../componentState';
import { evaluateFilter } from '../filters';
import type { EntityHooks, EntityStatusEffect } from '../hooks';
import { TICKS_PER_SECOND } from '../hooks';
import { asList, booleanAt, isRecord, numberAt, parseFilterValue, stringAt } from './schemas';

import { sensorNumber } from './shared';

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

/** Ticks until `minecraft:mob_effect` may apply its effect again. */
const MOB_EFFECT_STATE = defineComponentState('minecraft:mob_effect', { cooldownTicks: stateField.number });

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
    hooks: ['onInitialize', 'onTick'],
    schema: (value) => {
        const parsed = mobEffectParamsOf(value);
        return parsed.ok ? accepted(parsed.params) : rejected(parsed.message);
    },
    create: (params) => {
        return {
            onInitialize: (entity) => entity.componentState.set(MOB_EFFECT_STATE, { cooldownTicks: 0 }),
            onTick: (entity) => {
                const state = entity.componentState.get(MOB_EFFECT_STATE);
                if (state === undefined) return;
                if (state.cooldownTicks > 0) {
                    entity.componentState.set(MOB_EFFECT_STATE, { cooldownTicks: state.cooldownTicks - 1 });
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
                if (applied && params.cooldownTicks > 0)
                    entity.componentState.set(MOB_EFFECT_STATE, { cooldownTicks: params.cooldownTicks - 1 });
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
