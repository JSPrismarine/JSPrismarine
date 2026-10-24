import {
    asList,
    asNumber,
    asString,
    levelBasedValueAt,
    member,
    namespaced,
    rootContext
} from '@jsprismarine/predicates';
import type { LevelBasedValue, ParseContext, ParseOptions, ParseResult, RandomSource } from '@jsprismarine/predicates';

import { gaussianFrom } from './random';

/** The six members of `minecraft:enchantment_value_effect_type` in 26.3. */
export const VALUE_EFFECT_TYPES = ['add', 'all_of', 'exponential', 'multiply', 'remove_binomial', 'set'] as const;

/** One of {@link VALUE_EFFECT_TYPES}. */
export type ValueEffectType = (typeof VALUE_EFFECT_TYPES)[number];

/**
 * One step of an enchantment's arithmetic on a game value. Effects compose by
 * threading the running value through each in order, which is what `all_of`
 * and a component's list of entries both do.
 *
 * @param level - Level of the enchantment that owns the effect, counting from 1.
 * @param base - Value so far, which is the vanilla value on the first effect.
 */
export type ValueEffect = (level: number, base: number, random: RandomSource) => number;

/**
 * Thresholds at which `remove_binomial` stops drawing one float per unit and
 * switches to a normal approximation, read from `RemoveBinomial.process` in
 * the 26.3 server jar.
 */
const BINOMIAL_NORMAL_MINIMUM_TRIALS = 128;
const BINOMIAL_NORMAL_MINIMUM_EXPECTED = 20;

const removeBinomial =
    (chance: LevelBasedValue): ValueEffect =>
    (level, base, random) => {
        const probability = chance(level);
        const expectedHits = base * probability;
        const expectedMisses = base * (1 - probability);

        let removed = 0;
        if (
            base > BINOMIAL_NORMAL_MINIMUM_TRIALS &&
            expectedHits >= BINOMIAL_NORMAL_MINIMUM_EXPECTED &&
            expectedMisses >= BINOMIAL_NORMAL_MINIMUM_EXPECTED
        ) {
            const mean = Math.floor(expectedHits);
            const deviation = Math.sqrt(expectedHits * (1 - probability));
            removed = Math.min(Math.trunc(base), Math.max(0, Math.round(mean + gaussianFrom(random) * deviation)));
        } else {
            for (let trial = 0; trial < base; trial += 1) {
                if (random.nextFloat() < probability) removed += 1;
            }
        }

        return base - removed;
    };

const VALUE_EFFECTS: Readonly<Record<ValueEffectType, (value: unknown, context: ParseContext) => ValueEffect>> = {
    add: (value, context) => {
        const amount = levelBasedValueAt(member(value, 'value'), context.at('value'));
        return (level, base) => base + amount(level);
    },
    all_of: (value, context) => {
        const steps = asList(member(value, 'effects')).map((entry, index) =>
            valueEffectAt(entry, context.at('effects').at(index))
        );
        return (level, base, random) => steps.reduce((running, step) => step(level, running, random), base);
    },
    exponential: (value, context) => {
        const factor = levelBasedValueAt(member(value, 'base'), context.at('base'));
        const exponent = levelBasedValueAt(member(value, 'exponent'), context.at('exponent'));
        return (level, base) => base * factor(level) ** exponent(level);
    },
    multiply: (value, context) => {
        const factor = levelBasedValueAt(member(value, 'factor'), context.at('factor'));
        return (level, base) => base * factor(level);
    },
    remove_binomial: (value, context) =>
        removeBinomial(levelBasedValueAt(member(value, 'chance'), context.at('chance'))),
    set: (value, context) => {
        const amount = levelBasedValueAt(member(value, 'value'), context.at('value'));
        return (level) => amount(level);
    }
};

const isValueEffectType = (name: string): name is ValueEffectType =>
    (VALUE_EFFECT_TYPES as readonly string[]).includes(name);

/**
 * Compiles a value effect at a position inside a larger parse. An unknown type
 * reports and leaves the running value alone, so one bad effect does not
 * discard the enchantment around it.
 */
export const valueEffectAt = (value: unknown, context: ParseContext): ValueEffect => {
    const literal = asNumber(value);
    if (literal !== undefined) {
        context.error('a value effect needs a type, not a bare number');
        return (_level, base) => base;
    }

    const declared = asString(member(value, 'type'));
    if (declared === undefined) {
        context.error('a value effect needs a type');
        return (_level, base) => base;
    }

    const name = namespaced(declared).slice('minecraft:'.length);
    if (!isValueEffectType(name)) {
        context.error(`unknown value effect type ${declared}`);
        return (_level, base) => base;
    }
    return VALUE_EFFECTS[name](value, context);
};

/** Compiles a value effect from parsed JSON. */
export const parseValueEffect = (value: unknown, options?: ParseOptions): ParseResult<ValueEffect> => {
    const context = rootContext(options);
    return { value: valueEffectAt(value, context), diagnostics: context.diagnostics.entries };
};
