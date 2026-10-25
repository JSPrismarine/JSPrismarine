import { XoroshiroRandomSource } from '@jsprismarine/worldgen';
import { describe, expect, it } from 'vitest';

import vectors from '../vectors/features.json' with { type: 'json' };
import { BIOME_INFO_NOISE } from './placement/modifiers';
import {
    nextIntBetween,
    normal,
    randomBetween,
    randomBetweenInclusive,
    randomWeighted,
    WorldgenRandom
} from './placement/WorldgenRandom';
import type { HeightProvider, VerticalContext } from './providers/heightProvider';
import {
    biasedToBottomHeight,
    constantHeight,
    trapezoidHeight,
    uniformHeight,
    veryBiasedToBottomHeight,
    weightedListHeight
} from './providers/heightProvider';
import type { FloatProvider, IntProvider } from './providers/valueProviders';
import {
    biasedToBottomInt,
    clampedInt,
    clampedNormalFloat,
    clampedNormalInt,
    constantInt,
    trapezoidFloat,
    trapezoidInt,
    uniformFloat,
    uniformInt,
    veryBiasedToBottomInt,
    weightedListInt
} from './providers/valueProviders';

/**
 * Every expectation in this file came out of Java Edition 26.3's own classes, through
 * `utils/oracle/DumpFeatureVectors.java`. The comparisons are exact, not approximate: the draw
 * counts and the single-precision arithmetic both have to match, because a provider that costs
 * one draw too many moves every value after it.
 */

const OVERWORLD: VerticalContext = { minY: -64, height: 384, seaLevel: 63 };

const drawMany = <T>(count: number, draw: () => T): T[] => Array.from({ length: count }, draw);

/**
 * Gson prints a Java `float` with its shortest round-tripping decimal, and reading that decimal
 * back as a double is not the double the float widens to. Narrowing the expectation recovers the
 * exact value, so the comparisons stay exact rather than becoming tolerances.
 */
const asFloat = (value: number): number => Math.fround(value);

describe('golden vectors: the population and feature seeds', () => {
    it('derives the population seed for every world seed and chunk Java was asked about', () => {
        for (const row of vectors.seeds) {
            const random = new WorldgenRandom();
            const populationSeed = random.setDecorationSeed(BigInt(row.levelSeed), row.chunkX * 16, row.chunkZ * 16);
            expect(`${populationSeed}`).toBe(row.populationSeed);
        }
    });

    it('reproduces the first draws of every feature stream', () => {
        for (const row of vectors.seeds) {
            const random = new WorldgenRandom();
            const populationSeed = random.setDecorationSeed(BigInt(row.levelSeed), row.chunkX * 16, row.chunkZ * 16);
            for (const expected of row.featureDraws) {
                random.setFeatureSeed(populationSeed, expected.index, expected.step);
                expect(random.nextInt()).toBe(expected.nextInt);
                expect(random.nextFloat()).toBe(asFloat(expected.nextFloat));
                expect(`${random.nextLong()}`).toBe(expected.nextLong);
            }
        }
    });
});

describe('golden vectors: the int providers', () => {
    const providers: Record<string, IntProvider> = {
        'constant:5': constantInt(5),
        'uniform:0..7': uniformInt(0, 7),
        'uniform:-4..4': uniformInt(-4, 4),
        'biased_to_bottom:0..15': biasedToBottomInt(0, 15),
        'very_biased_to_bottom:0..15': veryBiasedToBottomInt(0, 15),
        'trapezoid:-6..6:0': trapezoidInt(-6, 6, 0),
        'trapezoid:0..10:4': trapezoidInt(0, 10, 4),
        'trapezoid:2..8:6': trapezoidInt(2, 8, 6),
        'clamped:uniform:0..20:in:3..9': clampedInt(uniformInt(0, 20), 3, 9),
        'clamped_normal:4:2:0..8': clampedNormalInt(4, 2, 0, 8),
        weighted_list: weightedListInt([
            { value: constantInt(0), weight: 19 },
            { value: constantInt(1), weight: 1 },
            { value: uniformInt(2, 5), weight: 4 }
        ])
    };

    it('covers every provider Java was asked about', () => {
        expect(Object.keys(providers).sort()).toEqual(vectors.intProviders.map(([name]) => name).sort());
    });

    for (const [name, expected] of vectors.intProviders) {
        it(`draws ${name} as Java does`, () => {
            const provider = providers[name];
            expect(provider).toBeDefined();
            const random = XoroshiroRandomSource.fromSeed(99n);
            expect(drawMany(expected.length, () => provider?.sample(random))).toEqual(expected);
        });
    }
});

describe('golden vectors: the float providers', () => {
    const providers: Record<string, FloatProvider> = {
        'uniform:0..1': uniformFloat(0, 1),
        'uniform:-3..7': uniformFloat(-3, 7),
        'trapezoid:-4..4:2': trapezoidFloat(-4, 4, 2),
        'clamped_normal:0.5:0.25:0..1': clampedNormalFloat(0.5, 0.25, 0, 1)
    };

    for (const [name, expected] of vectors.floatProviders) {
        it(`draws ${name} as Java does`, () => {
            const provider = providers[name];
            expect(provider).toBeDefined();
            const random = XoroshiroRandomSource.fromSeed(99n);
            expect(drawMany(expected.length, () => provider?.sample(random))).toEqual(expected.map(asFloat));
        });
    }
});

describe('golden vectors: the height providers', () => {
    const providers: Record<string, HeightProvider> = {
        'constant:absolute:11': constantHeight({ kind: 'absolute', y: 11 }),
        'uniform:bottom..absolute:80': uniformHeight({ kind: 'above_bottom', offset: 0 }, { kind: 'absolute', y: 80 }),
        'trapezoid:above_bottom:-80..above_bottom:80': trapezoidHeight(
            { kind: 'above_bottom', offset: -80 },
            { kind: 'above_bottom', offset: 80 },
            0
        ),
        'biased_to_bottom:absolute:0..absolute:64:inner:8': biasedToBottomHeight(
            { kind: 'absolute', y: 0 },
            { kind: 'absolute', y: 64 },
            8
        ),
        'very_biased_to_bottom:absolute:0..absolute:64:inner:8': veryBiasedToBottomHeight(
            { kind: 'absolute', y: 0 },
            { kind: 'absolute', y: 64 },
            8
        ),
        weighted_list: weightedListHeight([
            { value: constantHeight({ kind: 'absolute', y: 4 }), weight: 3 },
            { value: uniformHeight({ kind: 'absolute', y: 10 }, { kind: 'absolute', y: 20 }), weight: 1 }
        ]),
        'uniform:relative_to_sea_level:-5..below_top:10': uniformHeight(
            { kind: 'relative_to_sea_level', offset: -5 },
            { kind: 'below_top', offset: 10 }
        )
    };

    it('covers every provider Java was asked about', () => {
        expect(Object.keys(providers).sort()).toEqual(vectors.heightProviders.map(([name]) => name).sort());
    });

    for (const [name, expected] of vectors.heightProviders) {
        it(`draws ${name} as Java does`, () => {
            const provider = providers[name];
            expect(provider).toBeDefined();
            const random = XoroshiroRandomSource.fromSeed(99n);
            expect(drawMany(expected.length, () => provider?.sample(random, OVERWORLD))).toEqual(expected);
        });
    }
});

describe('golden vectors: the shared helpers', () => {
    it('draws from a weighted list in Java order', () => {
        const random = XoroshiroRandomSource.fromSeed(99n);
        const entries = [
            { value: 'a', weight: 1 },
            { value: 'b', weight: 5 },
            { value: 'c', weight: 2 }
        ];
        expect(drawMany(vectors.weightedList.length, () => randomWeighted(entries, random))).toEqual(
            vectors.weightedList
        );
    });

    it('samples the shared biome-info noise at Java’s values', () => {
        for (const row of vectors.biomeInfoNoise) {
            expect(BIOME_INFO_NOISE.get2(row.x, row.z)).toBe(asFloat(row.value));
        }
    });

    it('reproduces the Mth helpers draw for draw', () => {
        const random = XoroshiroRandomSource.fromSeed(5n);
        for (const expected of vectors.mth) {
            expect(randomBetweenInclusive(random, -5, 5)).toBe(expected.randomBetweenInclusive);
            expect(nextIntBetween(random, 3, 9)).toBe(expected.nextInt);
            expect(randomBetween(random, -2, 2)).toBe(asFloat(expected.randomBetween));
            expect(normal(random, 1.5, 0.25)).toBe(asFloat(expected.normal));
        }
    });
});
