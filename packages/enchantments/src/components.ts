import { asList, asString, isJsonObject, member, namespaced, predicateAt, rootContext } from '@jsprismarine/predicates';
import type {
    ContextParameterSetName,
    ParseContext,
    ParseOptions,
    ParseResult,
    Predicate
} from '@jsprismarine/predicates';

import { effectAt } from './effects';
import type { CompiledEffect } from './effects';
import { valueEffectAt } from './values';
import type { ValueEffect } from './values';

/** The three entities a `post_attack` or `equipment_drops` entry can name. */
export const ENCHANTMENT_TARGETS = ['attacker', 'damaging_entity', 'victim'] as const;

/** One of {@link ENCHANTMENT_TARGETS}. */
export type EnchantmentTarget = (typeof ENCHANTMENT_TARGETS)[number];

/**
 * How a component's body is shaped, which decides what parsing it and running
 * it mean. The kinds come from the codec each component registers in
 * `EnchantmentEffectComponents` in the 26.3 server jar.
 */
export type EffectComponentKind =
    | 'value'
    | 'targeted_value'
    | 'unconditional_value'
    | 'entity_effect'
    | 'targeted_entity_effect'
    | 'location_effect'
    | 'conditional_marker'
    | 'marker'
    | 'attributes'
    | 'charging_sounds'
    | 'sound_list';

/** What one entry of a component needs to know before it can be parsed or run. */
export interface EffectComponentDeclaration {
    readonly kind: EffectComponentKind;
    /**
     * Loot context key set the `requirements` of each entry evaluate against.
     * A component whose entries carry no conditions has none.
     */
    readonly parameterSet?: ContextParameterSetName;
}

/**
 * The 31 members of `minecraft:enchantment_effect_component_type` in 26.3,
 * each with the codec shape and the loot context key set it registers with.
 * Vanilla's 43 enchantment files use 30 of them; `mob_experience` is the one
 * nothing declares.
 */
export const EFFECT_COMPONENTS = {
    damage_protection: { kind: 'value', parameterSet: 'enchanted_damage' },
    damage_immunity: { kind: 'conditional_marker', parameterSet: 'enchanted_damage' },
    damage: { kind: 'value', parameterSet: 'enchanted_damage' },
    smash_damage_per_fallen_block: { kind: 'value', parameterSet: 'enchanted_damage' },
    knockback: { kind: 'value', parameterSet: 'enchanted_damage' },
    armor_effectiveness: { kind: 'value', parameterSet: 'enchanted_damage' },
    post_attack: { kind: 'targeted_entity_effect', parameterSet: 'enchanted_damage' },
    post_piercing_attack: { kind: 'entity_effect', parameterSet: 'enchanted_damage' },
    hit_block: { kind: 'entity_effect', parameterSet: 'hit_block' },
    item_damage: { kind: 'value', parameterSet: 'enchanted_item' },
    equipment_drops: { kind: 'targeted_value', parameterSet: 'enchanted_damage' },
    location_changed: { kind: 'location_effect', parameterSet: 'enchanted_location' },
    tick: { kind: 'entity_effect', parameterSet: 'enchanted_entity' },
    ammo_use: { kind: 'value', parameterSet: 'enchanted_item' },
    projectile_piercing: { kind: 'value', parameterSet: 'enchanted_item' },
    projectile_spawned: { kind: 'entity_effect', parameterSet: 'enchanted_entity' },
    projectile_spread: { kind: 'value', parameterSet: 'enchanted_entity' },
    projectile_count: { kind: 'value', parameterSet: 'enchanted_entity' },
    trident_return_acceleration: { kind: 'value', parameterSet: 'enchanted_entity' },
    fishing_time_reduction: { kind: 'value', parameterSet: 'enchanted_entity' },
    fishing_luck_bonus: { kind: 'value', parameterSet: 'enchanted_entity' },
    block_experience: { kind: 'value', parameterSet: 'enchanted_item' },
    mob_experience: { kind: 'value', parameterSet: 'enchanted_entity' },
    repair_with_xp: { kind: 'value', parameterSet: 'enchanted_item' },
    attributes: { kind: 'attributes' },
    crossbow_charge_time: { kind: 'unconditional_value' },
    crossbow_charging_sounds: { kind: 'charging_sounds' },
    trident_sound: { kind: 'sound_list' },
    prevent_equipment_drop: { kind: 'marker' },
    prevent_armor_change: { kind: 'marker' },
    trident_spin_attack_strength: { kind: 'unconditional_value' }
} as const satisfies Record<string, EffectComponentDeclaration>;

/** One of the keys of {@link EFFECT_COMPONENTS}. */
export type EffectComponentType = keyof typeof EFFECT_COMPONENTS;

/** Whether a bare name is one of the 31 components. */
export const isEffectComponentType = (name: string): name is EffectComponentType => name in EFFECT_COMPONENTS;

/** The 31 component names, in the order the 26.3 registry declares them. */
export const EFFECT_COMPONENT_TYPES: readonly EffectComponentType[] =
    Object.keys(EFFECT_COMPONENTS).filter(isEffectComponentType);

/**
 * One component's declaration, widened to {@link EffectComponentDeclaration}.
 * Reading {@link EFFECT_COMPONENTS} directly keeps each entry's literal type,
 * which means a component with no key set has no `parameterSet` property at
 * all; this returns the common shape instead.
 */
export const declarationOf = (component: EffectComponentType): EffectComponentDeclaration =>
    EFFECT_COMPONENTS[component];

/** One entry of a value effect component: the arithmetic and the condition that gates it. */
export interface ConditionalValueEntry {
    readonly effect: ValueEffect;
    /** Undefined when the entry always applies. */
    readonly requirements: Predicate | undefined;
    /** Whose copy of the enchantment fires, which only `equipment_drops` names. */
    readonly enchanted: EnchantmentTarget | undefined;
}

/** One entry of an entity or location effect component. */
export interface ConditionalEffectEntry {
    readonly effect: CompiledEffect;
    readonly requirements: Predicate | undefined;
    /** Whose copy of the enchantment fires, which only `post_attack` names. */
    readonly enchanted: EnchantmentTarget | undefined;
    /** Which entity the effect acts on, which only `post_attack` names. */
    readonly affected: EnchantmentTarget | undefined;
}

/** One entry of `damage_immunity`, which carries a condition and nothing else. */
export interface ConditionalMarkerEntry {
    readonly requirements: Predicate | undefined;
}

/** One level's worth of crossbow charging sounds. */
export interface ChargingSounds {
    readonly start: string | undefined;
    readonly mid: string | undefined;
    readonly end: string | undefined;
}

/**
 * The parsed body of one effect component, discriminated by the kind its
 * declaration gives it, so a caller narrows once and then has the right shape.
 */
export type ParsedComponent =
    | { readonly kind: 'value' | 'targeted_value'; readonly entries: readonly ConditionalValueEntry[] }
    | { readonly kind: 'unconditional_value'; readonly effect: ValueEffect }
    | {
          readonly kind: 'entity_effect' | 'targeted_entity_effect' | 'location_effect';
          readonly entries: readonly ConditionalEffectEntry[];
      }
    | { readonly kind: 'conditional_marker'; readonly entries: readonly ConditionalMarkerEntry[] }
    | { readonly kind: 'marker' }
    | { readonly kind: 'attributes'; readonly modifiers: readonly CompiledEffect[] }
    | { readonly kind: 'charging_sounds'; readonly perLevel: readonly ChargingSounds[] }
    | { readonly kind: 'sound_list'; readonly perLevel: readonly string[] };

/** Every effect component one enchantment declares, keyed by component name. */
export type EnchantmentEffects = ReadonlyMap<EffectComponentType, ParsedComponent>;

const targetAt = (value: unknown, key: string, context: ParseContext): EnchantmentTarget | undefined => {
    const declared = asString(member(value, key));
    if (declared === undefined) return undefined;

    const target = ENCHANTMENT_TARGETS.find((candidate) => candidate === declared);
    if (target === undefined) context.at(key).error(`unknown enchantment target ${declared}`);
    return target;
};

const requirementsAt = (value: unknown, context: ParseContext): Predicate | undefined =>
    member(value, 'requirements') === undefined
        ? undefined
        : predicateAt(member(value, 'requirements'), context.at('requirements'));

const soundAt = (value: unknown, key: string): string | undefined => {
    const declared = asString(member(value, key));
    return declared === undefined ? undefined : namespaced(declared);
};

/**
 * Reads a component body that Java writes as a list but a single entry may
 * stand in for, which is how its list codecs behave.
 */
const entriesOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : [value]);

const parseComponent = (component: EffectComponentType, value: unknown, context: ParseContext): ParsedComponent => {
    const declaration: EffectComponentDeclaration = EFFECT_COMPONENTS[component];

    switch (declaration.kind) {
        case 'value':
        case 'targeted_value':
            return {
                kind: declaration.kind,
                entries: entriesOf(value).map((entry, index) => {
                    const at = Array.isArray(value) ? context.at(index) : context;
                    return {
                        effect: valueEffectAt(member(entry, 'effect'), at.at('effect')),
                        requirements: requirementsAt(entry, at),
                        enchanted: targetAt(entry, 'enchanted', at)
                    };
                })
            };
        case 'unconditional_value':
            return { kind: 'unconditional_value', effect: valueEffectAt(value, context) };
        case 'entity_effect':
        case 'targeted_entity_effect':
        case 'location_effect': {
            const scope = declaration.kind === 'location_effect' ? 'location' : 'entity';
            return {
                kind: declaration.kind,
                entries: entriesOf(value).map((entry, index) => {
                    const at = Array.isArray(value) ? context.at(index) : context;
                    return {
                        effect: effectAt(member(entry, 'effect'), scope, at.at('effect')),
                        requirements: requirementsAt(entry, at),
                        enchanted: targetAt(entry, 'enchanted', at),
                        affected: targetAt(entry, 'affected', at)
                    };
                })
            };
        }
        case 'conditional_marker':
            return {
                kind: 'conditional_marker',
                entries: entriesOf(value).map((entry, index) => ({
                    requirements: requirementsAt(entry, Array.isArray(value) ? context.at(index) : context)
                }))
            };
        case 'marker':
            if (isJsonObject(value) && Object.keys(value).length > 0) {
                context.warn(`${component} takes no fields and ignores the ones given`);
            }
            return { kind: 'marker' };
        case 'attributes':
            return {
                kind: 'attributes',
                modifiers: asList(value).map((entry, index) =>
                    effectAt(
                        { ...(isJsonObject(entry) ? entry : {}), type: 'minecraft:attribute' },
                        'location',
                        context.at(index)
                    )
                )
            };
        case 'charging_sounds':
            return {
                kind: 'charging_sounds',
                perLevel: asList(value).map((entry) => ({
                    start: soundAt(entry, 'start'),
                    mid: soundAt(entry, 'mid'),
                    end: soundAt(entry, 'end')
                }))
            };
        case 'sound_list':
            return {
                kind: 'sound_list',
                perLevel: asList(value).flatMap((entry) => {
                    const declared = asString(entry);
                    return declared === undefined ? [] : [namespaced(declared)];
                })
            };
    }
};

/**
 * Parses an enchantment's `effects` map. A key that is not one of the 31
 * components reports and is dropped, because a datapack cannot add a component
 * type; only the enchantment files that use the existing ones.
 */
export const effectsAt = (value: unknown, context: ParseContext): EnchantmentEffects => {
    const effects = new Map<EffectComponentType, ParsedComponent>();
    if (value === undefined) return effects;
    if (!isJsonObject(value)) {
        context.error('effects must be a map of component type to body');
        return effects;
    }

    for (const [key, body] of Object.entries(value)) {
        const name = namespaced(key).slice('minecraft:'.length);
        if (!isEffectComponentType(name)) {
            context.at(key).error(`unknown enchantment effect component ${key}`);
            continue;
        }
        effects.set(name, parseComponent(name, body, context.at(key)));
    }
    return effects;
};

/** Parses an enchantment's `effects` map from parsed JSON. */
export const parseEffects = (value: unknown, options?: ParseOptions): ParseResult<EnchantmentEffects> => {
    const context = rootContext(options);
    return { value: effectsAt(value, context), diagnostics: context.diagnostics.entries };
};
