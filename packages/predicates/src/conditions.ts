import type { PredicateContext } from './context';
import { asBoolean, asList, asNumber, asString, isJsonObject, member, namespaced } from './json';
import { rootContext } from './parse';
import type { ParseContext, ParseOptions, ParseResult } from './parse';
import { floatProviderAt, intProviderAt, isEntityTarget, levelBasedValueAt, targetEntity } from './providers';
import type { EntityTarget } from './providers';
import { parseComposed, parseComposedOne } from './reference';
import {
    blockPredicate,
    damageSourcePredicate,
    entityPredicate,
    floatRange,
    intRange,
    itemPredicate,
    locationPredicate
} from './subpredicates';

/** A compiled loot condition, which Java also stores on its own as a `predicate` file. */
export type Predicate = (context: PredicateContext) => boolean;

/** The 20 loot condition types Java 26.3 registers in `LootItemConditionTypes`. */
export const LOOT_CONDITION_TYPES = [
    'inverted',
    'any_of',
    'all_of',
    'random_chance',
    'random_chance_with_enchanted_bonus',
    'entity_properties',
    'killed_by_player',
    'entity_scores',
    'match_block',
    'match_tool',
    'table_bonus',
    'survives_explosion',
    'damage_source_properties',
    'location_check',
    'weather_check',
    'time_check',
    'int_value_check',
    'float_value_check',
    'enchantment_active_check',
    'environment_attribute_check'
] as const;

/** One of {@link LOOT_CONDITION_TYPES}. */
export type LootConditionType = (typeof LOOT_CONDITION_TYPES)[number];

const parseTarget = (value: unknown, context: ParseContext): EntityTarget | undefined => {
    const target = asString(value) ?? 'this';
    if (!isEntityTarget(target)) {
        context.error(`unknown entity target ${target}`);
        return undefined;
    }
    return target;
};

const heldEnchantmentLevel = (context: PredicateContext, enchantment: string, path: string): number => {
    const attacker = context.parameter('attacking_entity', path);
    const weapon = attacker?.equipment?.mainhand;
    if (!weapon) return 0;
    const read = context.enchantments.levelOn;
    if (!read) {
        context.diagnostics.error(path, 'the enchantment view does not implement levelOn');
        return 0;
    }
    return read(weapon, enchantment);
};

type ConditionParser = (value: unknown, context: ParseContext) => Predicate;

const CONDITIONS: Readonly<Record<LootConditionType, ConditionParser>> = {
    inverted: (value, context) => {
        const term = parseComposedOne(member(value, 'term'), 'predicate', context.at('term'), inlineCondition);
        if (!term) {
            context.at('term').error('an inverted condition needs a term');
            return () => false;
        }
        return (evaluation) => !term(evaluation);
    },
    all_of: (value, context) => {
        const terms = parseComposed(member(value, 'terms'), 'predicate', context.at('terms'), inlineCondition);
        return (evaluation) => terms.every((term) => term(evaluation));
    },
    any_of: (value, context) => {
        const terms = parseComposed(member(value, 'terms'), 'predicate', context.at('terms'), inlineCondition);
        return (evaluation) => terms.some((term) => term(evaluation));
    },
    random_chance: (value, context) => {
        const chance = floatProviderAt(member(value, 'chance'), context.at('chance'));
        return (evaluation) => evaluation.random.nextFloat() < chance(evaluation);
    },
    random_chance_with_enchanted_bonus: (value, context) => {
        const unenchanted = asNumber(member(value, 'unenchanted_chance')) ?? 0;
        const enchanted = levelBasedValueAt(member(value, 'enchanted_chance'), context.at('enchanted_chance'));
        const enchantment = namespaced(asString(member(value, 'enchantment')) ?? '');
        const path = context.path;
        return (evaluation) => {
            const level = heldEnchantmentLevel(evaluation, enchantment, path);
            const chance = level > 0 ? enchanted(level) : unenchanted;
            return evaluation.random.nextFloat() < chance;
        };
    },
    entity_properties: (value, context) => {
        const target = parseTarget(member(value, 'entity'), context.at('entity'));
        const matches = entityPredicate(member(value, 'predicate'), context.at('predicate'));
        const path = context.path;
        return (evaluation) => target !== undefined && matches(targetEntity(evaluation, target, path), evaluation);
    },
    killed_by_player: (_value, context) => {
        const path = context.path;
        return (evaluation) => evaluation.parameter('last_damage_player', path) !== undefined;
    },
    entity_scores: (value, context) => {
        const target = parseTarget(member(value, 'entity'), context.at('entity'));
        const scores = member(value, 'scores');
        const wanted = Object.entries(isJsonObject(scores) ? scores : {}).map(
            ([objective, bounds]) => [objective, intRange(bounds, context.at('scores').at(objective))] as const
        );
        const path = context.path;
        return (evaluation) => {
            if (target === undefined) return false;
            const entity = targetEntity(evaluation, target, path);
            if (!entity) return false;
            return wanted.every(([objective, test]) => {
                const score = entity.scores?.get(objective);
                if (score === undefined) {
                    evaluation.diagnostics.error(path, `the entity view has no score for ${objective}`);
                    return false;
                }
                return test(score, evaluation);
            });
        };
    },
    match_block: (value, context) => {
        const matches = blockPredicate(value, context);
        const path = context.path;
        return (evaluation) =>
            matches(evaluation.parameter('block_state', path), evaluation.parameter('block_entity', path), evaluation);
    },
    match_tool: (value, context) => {
        const matches = itemPredicate(member(value, 'predicate'), context.at('predicate'));
        const path = context.path;
        return (evaluation) => matches(evaluation.parameter('tool', path), evaluation);
    },
    table_bonus: (value, context) => {
        const enchantment = namespaced(asString(member(value, 'enchantment')) ?? '');
        const chances = asList(member(value, 'chances')).map((entry) => asNumber(entry) ?? 0);
        if (chances.length === 0) context.at('chances').error('a table bonus needs at least one chance');
        const path = context.path;
        return (evaluation) => {
            const tool = evaluation.parameter('tool', path);
            const read = evaluation.enchantments.levelOn;
            if (!read) {
                evaluation.diagnostics.error(path, 'the enchantment view does not implement levelOn');
                return false;
            }
            const level = tool ? read(tool, enchantment) : 0;
            const chance = chances[Math.min(level, chances.length - 1)] ?? 0;
            return evaluation.random.nextFloat() < chance;
        };
    },
    survives_explosion: (_value, context) => {
        const path = context.path;
        return (evaluation) => {
            const radius = evaluation.parameter('explosion_radius', path);
            if (radius === undefined) return true;
            return evaluation.random.nextFloat() <= 1 / radius;
        };
    },
    damage_source_properties: (value, context) => {
        const matches = damageSourcePredicate(member(value, 'predicate'), context.at('predicate'));
        const path = context.path;
        return (evaluation) => matches(evaluation.parameter('damage_source', path), evaluation);
    },
    location_check: (value, context) => {
        const matches = locationPredicate(member(value, 'predicate'), context.at('predicate'));
        const offset = {
            x: asNumber(member(value, 'offsetX')) ?? 0,
            y: asNumber(member(value, 'offsetY')) ?? 0,
            z: asNumber(member(value, 'offsetZ')) ?? 0
        };
        const path = context.path;
        return (evaluation) => {
            const origin = evaluation.parameter('origin', path);
            if (!origin) return false;
            return matches({ x: origin.x + offset.x, y: origin.y + offset.y, z: origin.z + offset.z }, evaluation);
        };
    },
    weather_check: (value, context) => {
        const raining = asBoolean(member(value, 'raining'));
        const thundering = asBoolean(member(value, 'thundering'));
        const path = context.path;
        return (evaluation) => {
            if (raining !== undefined) {
                const level = evaluation.levelWith('isRaining', path);
                if (!level || level.isRaining() !== raining) return false;
            }
            if (thundering !== undefined) {
                const level = evaluation.levelWith('isThundering', path);
                if (!level || level.isThundering() !== thundering) return false;
            }
            return true;
        };
    },
    time_check: (value, context) => {
        const clock = namespaced(asString(member(value, 'clock')) ?? 'overworld');
        const period = asNumber(member(value, 'period'));
        const test = intRange(member(value, 'value'), context.at('value'));
        const path = context.path;
        return (evaluation) => {
            const level = evaluation.levelWith('clockTicks', path);
            if (!level) return false;
            const ticks = level.clockTicks(clock);
            return test(period === undefined || period === 0 ? ticks : ticks % period, evaluation);
        };
    },
    int_value_check: (value, context) => {
        const subject = intProviderAt(member(value, 'value'), context.at('value'));
        const test = intRange(member(value, 'range'), context.at('range'));
        return (evaluation) => test(subject(evaluation), evaluation);
    },
    float_value_check: (value, context) => {
        const subject = floatProviderAt(member(value, 'value'), context.at('value'));
        const test = floatRange(member(value, 'range'), context.at('range'));
        return (evaluation) => test(subject(evaluation), evaluation);
    },
    enchantment_active_check: (value, context) => {
        const active = asBoolean(member(value, 'active')) ?? true;
        const path = context.path;
        return (evaluation) => evaluation.parameter('enchantment_active', path) === active;
    },
    environment_attribute_check: (value, context) => {
        const attribute = namespaced(asString(member(value, 'attribute')) ?? '');
        if (attribute === 'minecraft:') context.at('attribute').error('an environment attribute check needs a name');
        const test = floatRange(member(value, 'value'), context.at('value'));
        const path = context.path;
        return (evaluation) => {
            const level = evaluation.levelWith('environmentAttribute', path);
            if (!level) return false;
            const reading = level.environmentAttribute(attribute, evaluation.parameters.origin);
            return reading !== undefined && test(reading, evaluation);
        };
    }
};

const isConditionType = (value: string): value is LootConditionType =>
    LOOT_CONDITION_TYPES.some((known) => known === value);

const inlineCondition = (value: unknown, context: ParseContext): Predicate | undefined => {
    if (!isJsonObject(value)) {
        context.error('a loot condition must be an object or a reference');
        return undefined;
    }

    const declared = asString(value['type']);
    if (declared === undefined) {
        context.error('a loot condition needs a type');
        return undefined;
    }

    const name = namespaced(declared).slice('minecraft:'.length);
    if (!isConditionType(name)) {
        context.error(`unknown loot condition type ${declared}`);
        return undefined;
    }
    return CONDITIONS[name](value, context);
};

/**
 * Parses a predicate field under 26.3's composition rule and folds the result
 * with `and`, which is how Java treats a list of conditions. A field that
 * resolves to nothing passes, matching an absent `conditions` list.
 */
export const predicateAt = (value: unknown, context: ParseContext): Predicate => {
    const terms = parseComposed(value, 'predicate', context, inlineCondition);
    if (terms.length === 1) return terms[0]!;
    return (evaluation) => terms.every((term) => term(evaluation));
};

/** Compiles a predicate, a `predicate` file, or a loot condition field from parsed JSON. */
export const parsePredicate = (value: unknown, options?: ParseOptions): ParseResult<Predicate> => {
    const context = rootContext(options);
    return { value: predicateAt(value, context), diagnostics: context.diagnostics.entries };
};
