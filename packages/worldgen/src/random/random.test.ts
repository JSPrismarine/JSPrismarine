import { describe, expect, it } from 'vitest';

import { expectedFloats, vectors } from '../../vectors/vectors';
import { LegacyRandomSource } from './LegacyRandomSource';
import type { PositionalRandomFactory } from './RandomSource';
import {
    javaStringHashCode,
    mixStafford13,
    positionalSeed,
    seedFromHashOf,
    upgradeSeedTo128bit
} from './randomSupport';
import { Xoroshiro128PlusPlus, XoroshiroRandomSource } from './XoroshiroRandomSource';

interface SourceVectors {
    nextLong: string[];
    nextInt: number[];
    nextIntBounded: { bound: number; values: number[] }[];
    nextFloat: number[];
    nextDouble: number[];
    nextGaussian: number[];
    nextBoolean: boolean[];
    fork: string[];
    positionalAt: { at: number[]; values: string[] }[];
    positionalFromHashOf: { name: string; values: string[] }[];
    positionalFromSeed: { seed: string; values: string[] }[];
}

interface SeedVectors {
    seed: string;
    mixStafford13: string;
    upgradeSeedTo128bit: string[];
    xoroshiro: SourceVectors;
    legacy: SourceVectors;
}

const seedVectors: SeedVectors[] = vectors.random.seeds;

const take = <T>(count: number, next: () => T): T[] => Array.from({ length: count }, next);

describe('seed mixing', () => {
    it.each(seedVectors)('matches Java for seed $seed', (vector) => {
        const seed = BigInt(vector.seed);
        expect(mixStafford13(seed).toString()).toBe(vector.mixStafford13);
        const upgraded = upgradeSeedTo128bit(seed);
        expect([upgraded.seedLo.toString(), upgraded.seedHi.toString()]).toEqual(vector.upgradeSeedTo128bit);
    });

    it('hashes names into the 128-bit state the way Java does', () => {
        for (const entry of vectors.random.seedFromHashOf) {
            const hashed = seedFromHashOf(entry.name);
            expect([hashed.seedLo.toString(), hashed.seedHi.toString()]).toEqual(entry.seed);
        }
    });

    it('reproduces String.hashCode for the names the legacy factory uses', () => {
        expect(javaStringHashCode('')).toBe(0);
        expect(javaStringHashCode('a')).toBe(97);
        expect(javaStringHashCode('minecraft:continentalness')).toBe(-48307223);
        expect(javaStringHashCode('octave_-7')).toBe(440898201);
    });

    it('truncates the x term of the position hash to 32 bits', () => {
        // 3129871 * 10000000 overflows int, so a 64-bit product would give a different seed.
        expect(positionalSeed(10_000_000, 0, 0)).toBe(positionalSeed(10_000_000, 0, 0));
        expect(positionalSeed(1, 2, 3)).not.toBe(positionalSeed(3, 2, 1));
    });
});

describe.each([
    ['XoroshiroRandomSource', (seed: bigint) => XoroshiroRandomSource.fromSeed(seed), 'xoroshiro' as const],
    ['LegacyRandomSource', (seed: bigint) => new LegacyRandomSource(seed), 'legacy' as const]
])('%s', (_name, create, key) => {
    const cases = seedVectors.map((vector) => ({ seed: vector.seed, expected: vector[key] }));

    it.each(cases)('reproduces Java nextLong for seed $seed', ({ seed, expected }) => {
        const random = create(BigInt(seed));
        expect(take(expected.nextLong.length, () => random.nextLong().toString())).toEqual(expected.nextLong);
    });

    it.each(cases)('reproduces Java nextInt for seed $seed', ({ seed, expected }) => {
        const random = create(BigInt(seed));
        expect(take(expected.nextInt.length, () => random.nextInt())).toEqual(expected.nextInt);
    });

    it.each(cases)('reproduces Java nextInt(bound) for seed $seed', ({ seed, expected }) => {
        for (const { bound, values } of expected.nextIntBounded) {
            const random = create(BigInt(seed));
            expect(take(values.length, () => random.nextIntBounded(bound))).toEqual(values);
        }
    });

    it.each(cases)('reproduces Java nextFloat, nextDouble and nextGaussian for seed $seed', ({ seed, expected }) => {
        const floats = create(BigInt(seed));
        expect(take(expected.nextFloat.length, () => floats.nextFloat())).toEqual(expectedFloats(expected.nextFloat));

        const doubles = create(BigInt(seed));
        expect(take(expected.nextDouble.length, () => doubles.nextDouble())).toEqual(expected.nextDouble);

        const gaussians = create(BigInt(seed));
        expect(take(expected.nextGaussian.length, () => gaussians.nextGaussian())).toEqual(expected.nextGaussian);
    });

    it.each(cases)('reproduces Java nextBoolean and fork for seed $seed', ({ seed, expected }) => {
        const booleans = create(BigInt(seed));
        expect(take(expected.nextBoolean.length, () => booleans.nextBoolean())).toEqual(expected.nextBoolean);

        const forked = create(BigInt(seed)).fork();
        expect(take(expected.fork.length, () => forked.nextLong().toString())).toEqual(expected.fork);
    });

    it.each(cases)('reproduces the positional factory for seed $seed', ({ seed, expected }) => {
        const factory: PositionalRandomFactory = create(BigInt(seed)).forkPositional();

        for (const { at, values } of expected.positionalAt) {
            const random = factory.at(at[0] ?? 0, at[1] ?? 0, at[2] ?? 0);
            expect(take(values.length, () => random.nextLong().toString())).toEqual(values);
        }

        for (const { name, values } of expected.positionalFromHashOf) {
            const random = factory.fromHashOf(name);
            expect(take(values.length, () => random.nextLong().toString())).toEqual(values);
        }

        for (const { seed: fromSeed, values } of expected.positionalFromSeed) {
            const random = factory.fromSeed(BigInt(fromSeed));
            expect(take(values.length, () => random.nextLong().toString())).toEqual(values);
        }
    });

    it('rejects a non-positive bound', () => {
        expect(() => create(1n).nextIntBounded(0)).toThrow(RangeError);
        expect(() => create(1n).nextIntBounded(-5)).toThrow(RangeError);
    });

    it('advances by one draw per consumed round', () => {
        const consumed = create(1234n);
        consumed.consumeCount(3);
        const stepped = create(1234n);
        stepped.nextInt();
        stepped.nextInt();
        stepped.nextInt();
        expect(consumed.nextLong()).toBe(stepped.nextLong());
    });
});

describe('Xoroshiro128PlusPlus', () => {
    it('substitutes the golden and silver ratios for an all-zero state', () => {
        const zeroed = new Xoroshiro128PlusPlus(0n, 0n);
        const substituted = new Xoroshiro128PlusPlus(-7046029254386353131n, 7640891576956012809n);
        expect(zeroed.nextLong()).toBe(substituted.nextLong());
    });
});
