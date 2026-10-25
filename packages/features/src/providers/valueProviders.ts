import type { RandomSource } from '@jsprismarine/worldgen';

import { asArray, asInteger, asNumber, asObject, fail } from '../json';
import type { Weighted } from '../placement/WorldgenRandom';
import { normal, randomBetween, randomBetweenInclusive, randomWeighted } from '../placement/WorldgenRandom';
import { typeNameOf } from '../registry';

const f32 = Math.fround;

/**
 * A draw of one integer, Java's `IntProvider`.
 *
 * Counts, heights, radii and offsets throughout the feature data are providers rather than
 * numbers, and the number of draws each one costs is part of the world's seed contract: a
 * `very_biased_to_bottom` costs three draws where a `uniform` costs one, so substituting a
 * distribution changes every value drawn after it.
 */
export interface IntProvider {
    /** The provider's registry name, for example `uniform`. */
    readonly type: IntProviderType;
    /** The lowest value the provider can return. */
    readonly minValue: number;
    /** The highest value the provider can return. */
    readonly maxValue: number;
    /** Draws one value, consuming the provider's fixed number of draws. */
    sample(random: RandomSource): number;
}

/** The eight types Java 26.3 registers in `int_provider_type`. */
export type IntProviderType =
    | 'constant'
    | 'uniform'
    | 'biased_to_bottom'
    | 'very_biased_to_bottom'
    | 'trapezoid'
    | 'clamped'
    | 'clamped_normal'
    | 'weighted_list';

/** A constant. Costs no draws. */
export const constantInt = (value: number): IntProvider => ({
    type: 'constant',
    minValue: value,
    maxValue: value,
    sample: () => value
});

/** A uniform integer in `[min, max]`. Costs one draw. */
export const uniformInt = (min: number, max: number): IntProvider => {
    if (max < min) throw new RangeError(`uniform int max ${max} is below min ${min}`);
    return {
        type: 'uniform',
        minValue: min,
        maxValue: max,
        sample: (random) => randomBetweenInclusive(random, min, max)
    };
};

/** A value in `[min, max]` weighted toward `min`. Costs two draws. */
export const biasedToBottomInt = (min: number, max: number): IntProvider => {
    if (max < min) throw new RangeError(`biased_to_bottom int max ${max} is below min ${min}`);
    return {
        type: 'biased_to_bottom',
        minValue: min,
        maxValue: max,
        sample: (random) => min + random.nextIntBounded(random.nextIntBounded(max - min + 1) + 1)
    };
};

/** A value in `[min, max]` weighted hard toward `min`. Costs three draws. */
export const veryBiasedToBottomInt = (min: number, max: number): IntProvider => {
    if (max < min) throw new RangeError(`very_biased_to_bottom int max ${max} is below min ${min}`);
    return {
        type: 'very_biased_to_bottom',
        minValue: min,
        maxValue: max,
        sample: (random) =>
            min + random.nextIntBounded(random.nextIntBounded(random.nextIntBounded(max - min + 1) + 1) + 1)
    };
};

/**
 * A trapezoidal distribution over `[min, max]` with a flat top `plateau` wide.
 *
 * The symmetric triangle case, which the `offset` modifier uses everywhere, takes a shortcut of
 * two draws from the same bound rather than the general two-draw form.
 */
export const trapezoidInt = (min: number, max: number, plateau: number): IntProvider => {
    if (max < min) throw new RangeError(`trapezoid int max ${max} is below min ${min}`);
    if (plateau > max - min) throw new RangeError(`trapezoid int plateau ${plateau} exceeds the span`);
    const range = max - min;
    const plateauStart = Math.trunc((range - plateau) / 2);
    const plateauEnd = range - plateauStart;
    return {
        type: 'trapezoid',
        minValue: min,
        maxValue: max,
        sample: (random) => {
            if (plateau === 0 && max === -min) {
                return random.nextIntBounded(max + 1) - random.nextIntBounded(max + 1);
            }
            if (plateau === range) return randomBetweenInclusive(random, min, max);
            return (
                min + randomBetweenInclusive(random, 0, plateauEnd) + randomBetweenInclusive(random, 0, plateauStart)
            );
        }
    };
};

/** Clamps another provider's draw into `[min, max]`. Costs whatever the source costs. */
export const clampedInt = (source: IntProvider, min: number, max: number): IntProvider => ({
    type: 'clamped',
    minValue: Math.max(min, source.minValue),
    maxValue: Math.min(max, source.maxValue),
    sample: (random) => Math.min(Math.max(source.sample(random), min), max)
});

/** A normal distribution truncated into `[min, max]`. Costs the gaussian's draws. */
export const clampedNormalInt = (mean: number, deviation: number, min: number, max: number): IntProvider => ({
    type: 'clamped_normal',
    minValue: min,
    maxValue: max,
    sample: (random) => Math.trunc(Math.min(Math.max(normal(random, mean, deviation), min), max))
});

/** Picks a nested provider by weight, then draws from it. Costs one draw plus the nested cost. */
export const weightedListInt = (entries: readonly Weighted<IntProvider>[]): IntProvider => {
    if (entries.length === 0) throw new RangeError('weighted_list int needs at least one entry');
    let minValue = Number.POSITIVE_INFINITY;
    let maxValue = Number.NEGATIVE_INFINITY;
    for (const entry of entries) {
        minValue = Math.min(minValue, entry.value.minValue);
        maxValue = Math.max(maxValue, entry.value.maxValue);
    }
    return {
        type: 'weighted_list',
        minValue,
        maxValue,
        sample: (random) => randomWeighted(entries, random).sample(random)
    };
};

/**
 * Reads an `IntProvider`.
 *
 * A bare number is a constant, which is how most of the data spells a fixed count.
 */
export const parseIntProvider = (source: unknown, path: string): IntProvider => {
    if (typeof source === 'number') return constantInt(asInteger(source, path));
    const raw = asObject(source, path);
    const type = typeNameOf(raw['type'], path);
    switch (type) {
        case 'constant':
            return constantInt(asInteger(raw['value'], `${path}.value`));
        case 'uniform':
            return uniformInt(
                asInteger(raw['min_inclusive'], `${path}.min_inclusive`),
                asInteger(raw['max_inclusive'], `${path}.max_inclusive`)
            );
        case 'biased_to_bottom':
            return biasedToBottomInt(
                asInteger(raw['min_inclusive'], `${path}.min_inclusive`),
                asInteger(raw['max_inclusive'], `${path}.max_inclusive`)
            );
        case 'very_biased_to_bottom':
            return veryBiasedToBottomInt(
                asInteger(raw['min_inclusive'], `${path}.min_inclusive`),
                asInteger(raw['max_inclusive'], `${path}.max_inclusive`)
            );
        case 'trapezoid':
            return trapezoidInt(
                asInteger(raw['min_inclusive'], `${path}.min_inclusive`),
                asInteger(raw['max_inclusive'], `${path}.max_inclusive`),
                asInteger(raw['plateau'], `${path}.plateau`, 0)
            );
        case 'clamped':
            return clampedInt(
                parseIntProvider(raw['source'], `${path}.source`),
                asInteger(raw['min_inclusive'], `${path}.min_inclusive`),
                asInteger(raw['max_inclusive'], `${path}.max_inclusive`)
            );
        case 'clamped_normal':
            return clampedNormalInt(
                asNumber(raw['mean'], `${path}.mean`),
                asNumber(raw['deviation'], `${path}.deviation`),
                asInteger(raw['min_inclusive'], `${path}.min_inclusive`),
                asInteger(raw['max_inclusive'], `${path}.max_inclusive`)
            );
        case 'weighted_list':
            return weightedListInt(
                parseWeightedList(raw['distribution'], `${path}.distribution`, (value, entryPath) =>
                    parseIntProvider(value, entryPath)
                )
            );
        default:
            return fail(path, `unknown int provider type ${JSON.stringify(type)}`);
    }
};

/**
 * A draw of one float, Java's `FloatProvider`.
 *
 * Four types are registered and vanilla uses all four.
 */
export interface FloatProvider {
    /** The provider's registry name. */
    readonly type: FloatProviderType;
    /** The lowest value the provider can return. */
    readonly minValue: number;
    /** The highest value the provider can return. */
    readonly maxValue: number;
    /** Draws one value. */
    sample(random: RandomSource): number;
}

/** The four types Java 26.3 registers in `float_provider_type`. */
export type FloatProviderType = 'constant' | 'uniform' | 'trapezoid' | 'clamped_normal';

/** A constant. Costs no draws. */
export const constantFloat = (value: number): FloatProvider => ({
    type: 'constant',
    minValue: value,
    maxValue: value,
    sample: () => value
});

/** A uniform float in `[min, max)`. Costs one draw. */
export const uniformFloat = (min: number, max: number): FloatProvider => ({
    type: 'uniform',
    minValue: min,
    maxValue: max,
    sample: (random) => randomBetween(random, min, max)
});

/** A trapezoidal float distribution. Costs two draws. */
export const trapezoidFloat = (min: number, max: number, plateau: number): FloatProvider => {
    const range = f32(max - min);
    const plateauStart = f32(f32(range - plateau) / 2);
    const plateauEnd = f32(range - plateauStart);
    return {
        type: 'trapezoid',
        minValue: min,
        maxValue: max,
        sample: (random) =>
            f32(f32(min + f32(random.nextFloat() * plateauEnd)) + f32(random.nextFloat() * plateauStart))
    };
};

/** A normal distribution truncated into `[min, max]`. */
export const clampedNormalFloat = (mean: number, deviation: number, min: number, max: number): FloatProvider => ({
    type: 'clamped_normal',
    minValue: min,
    maxValue: max,
    sample: (random) => Math.min(Math.max(normal(random, mean, deviation), min), max)
});

/** Reads a `FloatProvider`. A bare number is a constant. */
export const parseFloatProvider = (source: unknown, path: string): FloatProvider => {
    if (typeof source === 'number') return constantFloat(asNumber(source, path));
    const raw = asObject(source, path);
    const type = typeNameOf(raw['type'], path);
    switch (type) {
        case 'constant':
            return constantFloat(asNumber(raw['value'], `${path}.value`));
        case 'uniform':
            return uniformFloat(
                asNumber(raw['min_inclusive'], `${path}.min_inclusive`),
                asNumber(raw['max_exclusive'], `${path}.max_exclusive`)
            );
        case 'trapezoid':
            return trapezoidFloat(
                asNumber(raw['min'], `${path}.min`),
                asNumber(raw['max'], `${path}.max`),
                asNumber(raw['plateau'], `${path}.plateau`)
            );
        case 'clamped_normal':
            return clampedNormalFloat(
                asNumber(raw['mean'], `${path}.mean`),
                asNumber(raw['deviation'], `${path}.deviation`),
                asNumber(raw['min'], `${path}.min`),
                asNumber(raw['max'], `${path}.max`)
            );
        default:
            return fail(path, `unknown float provider type ${JSON.stringify(type)}`);
    }
};

/**
 * Reads a Java `WeightedList`, which is a list of `{data, weight}` entries.
 *
 * The declared order is kept, because `randomWeighted` walks it and a reordering would change
 * which entry a given draw selects.
 */
export const parseWeightedList = <T>(
    source: unknown,
    path: string,
    parseEntry: (value: unknown, path: string) => T
): Weighted<T>[] => {
    const entries = asArray(source, path);
    if (entries.length === 0) return fail(path, 'expected a non-empty weighted list');
    return entries.map((entry, index) => {
        const entryPath = `${path}[${index}]`;
        const raw = asObject(entry, entryPath);
        return {
            value: parseEntry(raw['data'], `${entryPath}.data`),
            weight: asInteger(raw['weight'], `${entryPath}.weight`, 1)
        };
    });
};
