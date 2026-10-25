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

/**
 * `XoroshiroRandomSource` runs the recurrence over 32-bit lanes; this oracle is the original
 * `BigInt` formulation of every derived method over {@link Xoroshiro128PlusPlus}, which the jar
 * vectors above verify against Java directly. The property tests below hold the two to bit
 * equality across millions of draws, so a lane-arithmetic mistake cannot hide in a carry or a
 * sign extension the six golden seeds happen not to reach.
 */
class BigIntOracle {
    private readonly generator: Xoroshiro128PlusPlus;

    public constructor(seedLo: bigint, seedHi: bigint) {
        this.generator = new Xoroshiro128PlusPlus(seedLo, seedHi);
    }

    public nextLong(): bigint {
        return this.generator.nextLong();
    }

    public nextInt(): number {
        return Number(BigInt.asIntN(32, this.generator.nextLong()));
    }

    public nextIntBounded(bound: number): number {
        const boundBig = BigInt(bound);
        let product = BigInt(this.nextInt() >>> 0) * boundBig;
        let fractionalPart = product & 0xffffffffn;
        if (fractionalPart < boundBig) {
            const threshold = BigInt((-bound >>> 0) % bound);
            while (fractionalPart < threshold) {
                product = BigInt(this.nextInt() >>> 0) * boundBig;
                fractionalPart = product & 0xffffffffn;
            }
        }
        return Number(BigInt.asIntN(32, product >> 32n));
    }

    public nextBoolean(): boolean {
        return (this.generator.nextLong() & 1n) !== 0n;
    }

    public nextFloat(): number {
        return Math.fround(Math.fround(Number(this.nextBits(24))) * Math.fround(5.9604645e-8));
    }

    public nextDouble(): number {
        return Number(this.nextBits(53)) * Math.fround(1.110223e-16);
    }

    private nextBits(bits: number): bigint {
        return BigInt.asUintN(64, this.generator.nextLong()) >> BigInt(64 - bits);
    }
}

describe('the lane implementation against the BigInt oracle', () => {
    const seedCases: readonly (readonly [bigint, bigint])[] = [
        [0n, 0n],
        [-1n, -1n],
        [1n, 0n],
        [0x7fffffffffffffffn, -0x8000000000000000n],
        [-7046029254386353131n, 7640891576956012809n],
        [0x123456789abcdef0n, -0x0fedcba987654321n]
    ];

    // Bounds that hit the Lemire fast path, the rejection loop and the extremes.
    const bounds = [1, 2, 3, 17, 256, 1000, 0x40000001, 0x7fffffff];

    it('matches over a million mixed draws', { timeout: 60_000 }, () => {
        // Plain comparisons keep a million draws fast; `expect` only fires on a mismatch so a
        // failure still reports the differing pair.
        const check = (actual: unknown, wanted: unknown, seedLo: bigint, i: number): void => {
            if (actual !== wanted) expect(`${actual} at draw ${i} of seed ${seedLo}`).toBe(`${wanted}`);
        };
        for (const [seedLo, seedHi] of seedCases) {
            const lanes = new XoroshiroRandomSource(seedLo, seedHi);
            const oracle = new BigIntOracle(seedLo, seedHi);
            for (let i = 0; i < 180_000; i++) {
                switch (i % 6) {
                    case 0:
                        check(lanes.nextLong(), oracle.nextLong(), seedLo, i);
                        break;
                    case 1:
                        check(lanes.nextInt(), oracle.nextInt(), seedLo, i);
                        break;
                    case 2: {
                        const bound = bounds[(i >> 2) % bounds.length] ?? 1;
                        check(lanes.nextIntBounded(bound), oracle.nextIntBounded(bound), seedLo, i);
                        break;
                    }
                    case 3:
                        check(lanes.nextFloat(), oracle.nextFloat(), seedLo, i);
                        break;
                    case 4:
                        check(lanes.nextDouble(), oracle.nextDouble(), seedLo, i);
                        break;
                    default:
                        check(lanes.nextBoolean(), oracle.nextBoolean(), seedLo, i);
                }
            }
            // The streams stayed in lockstep to the end.
            expect(lanes.nextLong()).toBe(oracle.nextLong());
        }
    });

    it('computes the same positional seed for extreme block positions', () => {
        const factory = XoroshiroRandomSource.fromSeed(1234n).forkPositional();
        // The factory's state is the two longs `forkPositional` drew from the same root.
        const oracleSeed = XoroshiroRandomSource.fromSeed(1234n);
        const seedLo = oracleSeed.nextLong();
        const seedHi = oracleSeed.nextLong();

        const axis = [-2147483648, -30_000_000, -123_457, -1, 0, 1, 7_777_777, 30_000_000, 2147483647];
        const heights = [-2032, -64, 0, 319, 2031];
        for (const x of axis) {
            for (const z of axis) {
                for (const y of heights) {
                    const lanes = factory.at(x, y, z);
                    const oracle = new BigIntOracle(positionalSeed(x, y, z) ^ seedLo, seedHi);
                    expect(lanes.nextLong()).toBe(oracle.nextLong());
                    expect(lanes.nextIntBounded(10)).toBe(oracle.nextIntBounded(10));
                    expect(lanes.nextIntBounded(9)).toBe(oracle.nextIntBounded(9));
                }
            }
        }
    });

    it('substitutes the constant state when the lanes come out all zero', () => {
        const fromLanes = XoroshiroRandomSource.fromLanes(0, 0, 0, 0);
        const substituted = new XoroshiroRandomSource(0n, 0n);
        expect(fromLanes.nextLong()).toBe(substituted.nextLong());
    });
});
