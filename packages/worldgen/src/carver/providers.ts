import { f32 } from '../math';
import type { RandomSource } from '../random/RandomSource';
import type { VerticalAnchor, WorldGenerationContext } from '../surface/VerticalAnchor';
import { parseVerticalAnchor, resolveAnchorY } from '../surface/VerticalAnchor';
import { randomBetween } from './trig';

/** A single-precision value provider: a constant, a uniform draw or a trapezoid draw. */
export type FloatProvider =
    | { readonly type: 'constant'; readonly value: number }
    | { readonly type: 'uniform'; readonly min: number; readonly maxExclusive: number }
    | { readonly type: 'trapezoid'; readonly min: number; readonly max: number; readonly plateau: number };

/** An integer value provider. The carvers use the constant and the two biased forms. */
export type IntProvider =
    | { readonly type: 'constant'; readonly value: number }
    | { readonly type: 'uniform'; readonly minInclusive: number; readonly maxInclusive: number }
    | { readonly type: 'biased_to_bottom'; readonly minInclusive: number; readonly maxInclusive: number }
    | { readonly type: 'very_biased_to_bottom'; readonly minInclusive: number; readonly maxInclusive: number };

/** A y level provider, which resolves its anchors against the dimension before drawing. */
export type HeightProvider =
    | { readonly type: 'constant'; readonly value: VerticalAnchor }
    | { readonly type: 'uniform'; readonly minInclusive: VerticalAnchor; readonly maxInclusive: VerticalAnchor };

const asObject = (value: unknown, path: string): Record<string, unknown> => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new TypeError(`${path}: expected an object, got ${JSON.stringify(value)}`);
    }
    // A parsed JSON document is `unknown`; every field read below is checked.
    return value as Record<string, unknown>;
};

const number = (value: unknown, path: string): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(`${path}: expected a finite number, got ${JSON.stringify(value)}`);
    }
    return value;
};

const integer = (value: unknown, path: string): number => {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new TypeError(`${path}: expected an integer, got ${JSON.stringify(value)}`);
    }
    return value;
};

const providerType = (raw: Record<string, unknown>, path: string): string => {
    const type = raw['type'];
    if (typeof type !== 'string') throw new TypeError(`${path}.type: expected a string, got ${JSON.stringify(type)}`);
    return type.startsWith('minecraft:') ? type.slice('minecraft:'.length) : type;
};

/**
 * Reads a float provider, which Java writes as a bare number for the constant case.
 *
 * @throws When the type is unknown or a bound is missing.
 */
export const parseFloatProvider = (source: unknown, path = '<float_provider>'): FloatProvider => {
    if (typeof source === 'number') return { type: 'constant', value: f32(source) };
    const raw = asObject(source, path);
    switch (providerType(raw, path)) {
        case 'constant':
            return { type: 'constant', value: f32(number(raw['value'], `${path}.value`)) };
        case 'uniform':
            return {
                type: 'uniform',
                min: f32(number(raw['min_inclusive'], `${path}.min_inclusive`)),
                maxExclusive: f32(number(raw['max_exclusive'], `${path}.max_exclusive`))
            };
        case 'trapezoid':
            return {
                type: 'trapezoid',
                min: f32(number(raw['min'], `${path}.min`)),
                max: f32(number(raw['max'], `${path}.max`)),
                plateau: f32(number(raw['plateau'], `${path}.plateau`))
            };
        default:
            throw new TypeError(`${path}: unknown float provider type ${JSON.stringify(raw['type'])}`);
    }
};

/**
 * Reads an integer provider, which Java writes as a bare number for the constant case.
 *
 * @throws When the type is unknown or a bound is missing.
 */
export const parseIntProvider = (source: unknown, path = '<int_provider>'): IntProvider => {
    if (typeof source === 'number') return { type: 'constant', value: integer(source, path) };
    const raw = asObject(source, path);
    const type = providerType(raw, path);
    if (type === 'constant') return { type: 'constant', value: integer(raw['value'], `${path}.value`) };
    if (type === 'uniform' || type === 'biased_to_bottom' || type === 'very_biased_to_bottom') {
        return {
            type,
            minInclusive: integer(raw['min_inclusive'], `${path}.min_inclusive`),
            maxInclusive: integer(raw['max_inclusive'], `${path}.max_inclusive`)
        };
    }
    throw new TypeError(`${path}: unknown int provider type ${JSON.stringify(raw['type'])}`);
};

/**
 * Reads a height provider.
 *
 * @throws When the type is unknown or an anchor is missing.
 */
export const parseHeightProvider = (source: unknown, path = '<height_provider>'): HeightProvider => {
    const raw = asObject(source, path);
    switch (providerType(raw, path)) {
        case 'constant':
            return { type: 'constant', value: parseVerticalAnchor(raw['value'], `${path}.value`) };
        case 'uniform':
            return {
                type: 'uniform',
                minInclusive: parseVerticalAnchor(raw['min_inclusive'], `${path}.min_inclusive`),
                maxInclusive: parseVerticalAnchor(raw['max_inclusive'], `${path}.max_inclusive`)
            };
        default:
            throw new TypeError(`${path}: unknown height provider type ${JSON.stringify(raw['type'])}`);
    }
};

/** Draws one value from a float provider, consuming the draws Java consumes. */
export const sampleFloat = (provider: FloatProvider, random: RandomSource): number => {
    switch (provider.type) {
        case 'constant':
            return provider.value;
        case 'uniform':
            return randomBetween(random.nextFloat(), provider.min, provider.maxExclusive);
        case 'trapezoid': {
            const range = f32(provider.max - provider.min);
            const plateauStart = f32(f32(range - provider.plateau) / 2);
            const plateauEnd = f32(range - plateauStart);
            return f32(
                f32(provider.min + f32(random.nextFloat() * plateauEnd)) + f32(random.nextFloat() * plateauStart)
            );
        }
    }
};

/** Draws one value from an integer provider, consuming the draws Java consumes. */
export const sampleInt = (provider: IntProvider, random: RandomSource): number => {
    switch (provider.type) {
        case 'constant':
            return provider.value;
        case 'uniform':
            return random.nextIntBounded(provider.maxInclusive - provider.minInclusive + 1) + provider.minInclusive;
        case 'biased_to_bottom':
            return (
                provider.minInclusive +
                random.nextIntBounded(random.nextIntBounded(provider.maxInclusive - provider.minInclusive + 1) + 1)
            );
        case 'very_biased_to_bottom':
            return (
                provider.minInclusive +
                random.nextIntBounded(
                    random.nextIntBounded(
                        random.nextIntBounded(provider.maxInclusive - provider.minInclusive + 1) + 1
                    ) + 1
                )
            );
    }
};

/** Draws one y level from a height provider. */
export const sampleHeight = (
    provider: HeightProvider,
    random: RandomSource,
    context: WorldGenerationContext
): number => {
    if (provider.type === 'constant') return resolveAnchorY(provider.value, context);
    const min = resolveAnchorY(provider.minInclusive, context);
    const max = resolveAnchorY(provider.maxInclusive, context);
    // Java logs a warning and returns the lower bound for an empty range.
    if (min > max) return min;
    return random.nextIntBounded(max - min + 1) + min;
};
