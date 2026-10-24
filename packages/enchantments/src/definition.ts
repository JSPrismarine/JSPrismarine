import {
    asNumber,
    asString,
    isJsonObject,
    member,
    namespaced,
    resolveMembers,
    rootContext
} from '@jsprismarine/predicates';
import type { MemberSet, ParseContext, ParseOptions, ParseResult } from '@jsprismarine/predicates';

import { effectsAt } from './components';
import type { EnchantmentEffects } from './components';

/** The 11 equipment slot groups an enchantment's `slots` may name in 26.3. */
export const EQUIPMENT_SLOT_GROUPS = [
    'any',
    'mainhand',
    'offhand',
    'hand',
    'feet',
    'legs',
    'chest',
    'head',
    'armor',
    'body',
    'saddle'
] as const;

/** One of {@link EQUIPMENT_SLOT_GROUPS}. */
export type EquipmentSlotGroup = (typeof EQUIPMENT_SLOT_GROUPS)[number];

/** Java hardcodes the lowest level of every enchantment to 1. */
export const MIN_ENCHANTMENT_LEVEL = 1;

/**
 * A `base` plus `per_level_above_first` pair, which `min_cost` and `max_cost`
 * both are. Java evaluates it as `base + perLevelAboveFirst * (level - 1)` and
 * keeps the result an integer.
 */
export interface LevelCost {
    readonly base: number;
    readonly perLevelAboveFirst: number;
}

/** Evaluates a {@link LevelCost} at one level, counting levels from 1. */
export const costAt = (cost: LevelCost, level: number): number =>
    cost.base + cost.perLevelAboveFirst * (level - MIN_ENCHANTMENT_LEVEL);

/**
 * One enchantment as a datapack writes it. Every field of the 26.3 format is
 * here; `description` stays as the parsed chat component because the text
 * format belongs to another package.
 */
export interface EnchantmentDefinition {
    /** Namespaced id, taken from the file path rather than the file body. */
    readonly id: string;
    readonly description: unknown;
    /** Items the enchantment may sit on at all, as ids and unexpanded item tags. */
    readonly supportedItems: MemberSet;
    /** Items the enchanting table may offer it for; absent means every supported item. */
    readonly primaryItems: MemberSet | undefined;
    /** Relative chance in the enchanting table draw. */
    readonly weight: number;
    readonly maxLevel: number;
    readonly minCost: LevelCost;
    readonly maxCost: LevelCost;
    /** Levels the anvil charges per level of this enchantment. */
    readonly anvilCost: number;
    readonly slots: readonly EquipmentSlotGroup[];
    /** Enchantments that cannot share an item with this one. */
    readonly exclusiveSet: MemberSet;
    readonly effects: EnchantmentEffects;
}

const costAtMember = (value: unknown, key: string, context: ParseContext): LevelCost => {
    const body = member(value, key);
    if (body === undefined) {
        context.at(key).error(`an enchantment needs ${key}`);
        return { base: 0, perLevelAboveFirst: 0 };
    }

    const literal = asNumber(body);
    if (literal !== undefined) return { base: literal, perLevelAboveFirst: 0 };
    if (!isJsonObject(body)) {
        context.at(key).error(`${key} must be a number or a base and per level pair`);
        return { base: 0, perLevelAboveFirst: 0 };
    }

    return {
        base: asNumber(member(body, 'base')) ?? 0,
        perLevelAboveFirst: asNumber(member(body, 'per_level_above_first')) ?? 0
    };
};

const integerAtMember = (value: unknown, key: string, fallback: number, context: ParseContext): number => {
    const declared = member(value, key);
    if (declared === undefined) {
        context.at(key).error(`an enchantment needs ${key}`);
        return fallback;
    }

    const read = asNumber(declared);
    if (read === undefined) {
        context.at(key).error(`${key} must be a number`);
        return fallback;
    }
    return Math.trunc(read);
};

const slotsAt = (value: unknown, context: ParseContext): readonly EquipmentSlotGroup[] => {
    const declared = member(value, 'slots');
    if (declared === undefined) {
        context.at('slots').error('an enchantment needs slots');
        return [];
    }

    return (Array.isArray(declared) ? declared : [declared]).flatMap((entry, index) => {
        const name = asString(entry);
        const group = EQUIPMENT_SLOT_GROUPS.find((candidate) => candidate === name);
        if (group === undefined) {
            context
                .at('slots')
                .at(index)
                .error(`unknown equipment slot group ${String(entry)}`);
            return [];
        }
        return [group];
    });
};

/**
 * Parses one enchantment file. Nothing throws: a missing or malformed field
 * reports through the parse context and takes a safe default, so one bad file
 * does not take the pack down with it.
 *
 * @param id - Namespaced id of the enchantment, which the file body does not carry.
 */
export const enchantmentAt = (id: string, value: unknown, context: ParseContext): EnchantmentDefinition => {
    if (!isJsonObject(value)) {
        context.error('an enchantment file must be a JSON object');
    }

    return {
        id: namespaced(id),
        description: member(value, 'description'),
        supportedItems: resolveMembers(member(value, 'supported_items'), 'item', context.at('supported_items')),
        primaryItems:
            member(value, 'primary_items') === undefined
                ? undefined
                : resolveMembers(member(value, 'primary_items'), 'item', context.at('primary_items')),
        weight: integerAtMember(value, 'weight', 1, context),
        maxLevel: Math.max(MIN_ENCHANTMENT_LEVEL, integerAtMember(value, 'max_level', 1, context)),
        minCost: costAtMember(value, 'min_cost', context),
        maxCost: costAtMember(value, 'max_cost', context),
        anvilCost: integerAtMember(value, 'anvil_cost', 0, context),
        slots: slotsAt(value, context),
        exclusiveSet: resolveMembers(member(value, 'exclusive_set'), 'enchantment', context.at('exclusive_set')),
        effects: effectsAt(member(value, 'effects'), context.at('effects'))
    };
};

/** Compiles one enchantment definition from parsed JSON. */
export const parseEnchantment = (
    id: string,
    value: unknown,
    options?: ParseOptions
): ParseResult<EnchantmentDefinition> => {
    const context = rootContext(options);
    return { value: enchantmentAt(id, value, context), diagnostics: context.diagnostics.entries };
};

/** Every level an enchantment offers, from 1 up to its `max_level`. */
export const levelsOf = (definition: EnchantmentDefinition): readonly number[] =>
    Array.from({ length: Math.max(0, definition.maxLevel) }, (_entry, index) => index + MIN_ENCHANTMENT_LEVEL);
