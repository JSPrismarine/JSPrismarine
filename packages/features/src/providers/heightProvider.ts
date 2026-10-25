import type { RandomSource } from '@jsprismarine/worldgen';

import { asInteger, asObject, fail } from '../json';
import type { Weighted } from '../placement/WorldgenRandom';
import { nextIntBetween, randomBetweenInclusive, randomWeighted } from '../placement/WorldgenRandom';
import { typeNameOf } from '../registry';
import { parseWeightedList } from './valueProviders';

/**
 * What a height provider needs from the dimension to turn an anchor into a y.
 *
 * It is the three numbers of Java's `WorldGenerationContext`, so a caller can resolve a height
 * without a world.
 */
export interface VerticalContext {
    /** The lowest generated y. */
    readonly minY: number;
    /** The number of generated y levels. */
    readonly height: number;
    /** The dimension's sea level. */
    readonly seaLevel: number;
}

/**
 * One end of a vertical range, Java's `VerticalAnchor`.
 *
 * The four forms exist so a datapack can express "eight above the bottom of whatever dimension
 * this is" without knowing the dimension's height.
 */
export type VerticalAnchor =
    | { readonly kind: 'absolute'; readonly y: number }
    | { readonly kind: 'above_bottom'; readonly offset: number }
    | { readonly kind: 'below_top'; readonly offset: number }
    | { readonly kind: 'relative_to_sea_level'; readonly offset: number };

/** Resolves an anchor to a y in the given dimension. */
export const resolveAnchor = (anchor: VerticalAnchor, context: VerticalContext): number => {
    switch (anchor.kind) {
        case 'absolute':
            return anchor.y;
        case 'above_bottom':
            return context.minY + anchor.offset;
        case 'below_top':
            return context.height - 1 + context.minY - anchor.offset;
        case 'relative_to_sea_level':
            return context.seaLevel + anchor.offset;
    }
};

/** Reads a `VerticalAnchor`, which is an object with exactly one of the four keys. */
export const parseVerticalAnchor = (source: unknown, path: string): VerticalAnchor => {
    const raw = asObject(source, path);
    if ('absolute' in raw) return { kind: 'absolute', y: asInteger(raw['absolute'], `${path}.absolute`) };
    if ('above_bottom' in raw) {
        return { kind: 'above_bottom', offset: asInteger(raw['above_bottom'], `${path}.above_bottom`) };
    }
    if ('below_top' in raw) return { kind: 'below_top', offset: asInteger(raw['below_top'], `${path}.below_top`) };
    if ('relative_to_sea_level' in raw) {
        return {
            kind: 'relative_to_sea_level',
            offset: asInteger(raw['relative_to_sea_level'], `${path}.relative_to_sea_level`)
        };
    }
    return fail(path, 'expected one of absolute, above_bottom, below_top or relative_to_sea_level');
};

/**
 * A draw of one y, Java's `HeightProvider`.
 *
 * It differs from an {@link import('./valueProviders').IntProvider} in taking a
 * {@link VerticalContext}, because its bounds are anchors rather than numbers.
 */
export interface HeightProvider {
    /** The provider's registry name. */
    readonly type: HeightProviderType;
    /** Draws one y. */
    sample(random: RandomSource, context: VerticalContext): number;
}

/** The six types Java 26.3 registers in `height_provider_type`. */
export type HeightProviderType =
    'constant' | 'uniform' | 'biased_to_bottom' | 'very_biased_to_bottom' | 'trapezoid' | 'weighted_list';

/** A fixed anchor. Costs no draws. */
export const constantHeight = (value: VerticalAnchor): HeightProvider => ({
    type: 'constant',
    sample: (_random, context) => resolveAnchor(value, context)
});

/**
 * A uniform y in `[min, max]`. Costs one draw.
 *
 * Java collapses an inverted range to `min` with a warning rather than failing, because the range
 * depends on the dimension and a datapack cannot always know it is valid. Reproduced here.
 */
export const uniformHeight = (min: VerticalAnchor, max: VerticalAnchor): HeightProvider => ({
    type: 'uniform',
    sample: (random, context) => {
        const low = resolveAnchor(min, context);
        const high = resolveAnchor(max, context);
        return low > high ? low : randomBetweenInclusive(random, low, high);
    }
});

/** A y weighted toward the bottom of `[min + inner, max]`. Costs two draws. */
export const biasedToBottomHeight = (min: VerticalAnchor, max: VerticalAnchor, inner: number): HeightProvider => ({
    type: 'biased_to_bottom',
    sample: (random, context) => {
        const low = resolveAnchor(min, context);
        const high = resolveAnchor(max, context);
        if (high - low - inner + 1 <= 0) return low;
        const limit = random.nextIntBounded(high - low - inner + 1);
        return random.nextIntBounded(limit + inner) + low;
    }
});

/** A y weighted hard toward the bottom. Costs three draws. */
export const veryBiasedToBottomHeight = (min: VerticalAnchor, max: VerticalAnchor, inner: number): HeightProvider => ({
    type: 'very_biased_to_bottom',
    sample: (random, context) => {
        const low = resolveAnchor(min, context);
        const high = resolveAnchor(max, context);
        if (high - low - inner + 1 <= 0) return low;
        const upper = nextIntBetween(random, low + inner, high);
        const biasedUpper = nextIntBetween(random, low, upper - 1);
        return nextIntBetween(random, low, biasedUpper - 1 + inner);
    }
});

/** A trapezoidal y distribution with a flat top `plateau` wide. Costs one or two draws. */
export const trapezoidHeight = (min: VerticalAnchor, max: VerticalAnchor, plateau: number): HeightProvider => ({
    type: 'trapezoid',
    sample: (random, context) => {
        const low = resolveAnchor(min, context);
        const high = resolveAnchor(max, context);
        if (low > high) return low;
        const range = high - low;
        if (plateau >= range) return randomBetweenInclusive(random, low, high);
        const plateauStart = Math.trunc((range - plateau) / 2);
        const plateauEnd = range - plateauStart;
        return low + randomBetweenInclusive(random, 0, plateauEnd) + randomBetweenInclusive(random, 0, plateauStart);
    }
});

/** Picks a nested provider by weight, then draws from it. */
export const weightedListHeight = (entries: readonly Weighted<HeightProvider>[]): HeightProvider => ({
    type: 'weighted_list',
    sample: (random, context) => randomWeighted(entries, random).sample(random, context)
});

/** Reads a `HeightProvider`. A bare anchor object is a constant. */
export const parseHeightProvider = (source: unknown, path: string): HeightProvider => {
    if (typeof source === 'number') {
        return constantHeight({ kind: 'absolute', y: asInteger(source, path) });
    }
    const raw = asObject(source, path);
    if (!('type' in raw)) return constantHeight(parseVerticalAnchor(raw, path));

    const type = typeNameOf(raw['type'], path);
    switch (type) {
        case 'constant':
            return constantHeight(parseVerticalAnchor(raw['value'], `${path}.value`));
        case 'uniform':
            return uniformHeight(
                parseVerticalAnchor(raw['min_inclusive'], `${path}.min_inclusive`),
                parseVerticalAnchor(raw['max_inclusive'], `${path}.max_inclusive`)
            );
        case 'biased_to_bottom':
            return biasedToBottomHeight(
                parseVerticalAnchor(raw['min_inclusive'], `${path}.min_inclusive`),
                parseVerticalAnchor(raw['max_inclusive'], `${path}.max_inclusive`),
                asInteger(raw['inner'], `${path}.inner`, 1)
            );
        case 'very_biased_to_bottom':
            return veryBiasedToBottomHeight(
                parseVerticalAnchor(raw['min_inclusive'], `${path}.min_inclusive`),
                parseVerticalAnchor(raw['max_inclusive'], `${path}.max_inclusive`),
                asInteger(raw['inner'], `${path}.inner`, 1)
            );
        case 'trapezoid':
            return trapezoidHeight(
                parseVerticalAnchor(raw['min_inclusive'], `${path}.min_inclusive`),
                parseVerticalAnchor(raw['max_inclusive'], `${path}.max_inclusive`),
                asInteger(raw['plateau'], `${path}.plateau`, 0)
            );
        case 'weighted_list':
            return weightedListHeight(
                parseWeightedList(raw['distribution'], `${path}.distribution`, (value, entryPath) =>
                    parseHeightProvider(value, entryPath)
                )
            );
        default:
            return fail(path, `unknown height provider type ${JSON.stringify(type)}`);
    }
};
