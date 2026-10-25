import { describe, expect, it } from 'vitest';
import { SeedGenerator, worldSeedOf } from './Seed';

const LONG_MAX = 2n ** 63n - 1n;
const LONG_MIN = -(2n ** 63n);

describe('utils', () => {
    describe('SeedGenerator', () => {
        it('should generate a seed inside the long range', () => {
            const seed = SeedGenerator();
            expect(typeof seed).toBe('bigint');
            expect(seed).toBeGreaterThanOrEqual(LONG_MIN);
            expect(seed).toBeLessThanOrEqual(LONG_MAX);
        });

        it('should reach past the safe integer range', () => {
            const seeds = Array.from({ length: 64 }, () => SeedGenerator());
            expect(seeds.some((seed) => seed > BigInt(Number.MAX_SAFE_INTEGER))).toBe(true);
        });

        it('should generate different numbers on subsequent calls', () => {
            const seed1 = SeedGenerator();
            const seed2 = SeedGenerator();
            expect(seed1).not.toBe(seed2);
        });
    });

    describe('worldSeedOf', () => {
        it('keeps every bit of a nineteen digit seed', () => {
            // The value a `number` rounds to 8475011743740319744, which is 277 away and a
            // different world. This is the case the whole string spelling exists for.
            expect(worldSeedOf('8475011743740320021')).toBe(8475011743740320021n);
        });

        it('reads a small seed the same whether it is written as text or as a number', () => {
            expect(worldSeedOf('1234')).toBe(1234n);
            expect(worldSeedOf(1234)).toBe(1234n);
            expect(worldSeedOf('-42')).toBe(-42n);
            expect(worldSeedOf(-42)).toBe(-42n);
        });

        it('takes the long at the edges of the range', () => {
            expect(worldSeedOf(LONG_MAX.toString())).toBe(LONG_MAX);
            expect(worldSeedOf(LONG_MIN.toString())).toBe(LONG_MIN);
        });

        // Expected values worked out from s[0]*31^(n-1) + ... + s[n-1] in 32-bit signed
        // arithmetic. For 'glacier': 103, then 3301, 102428, 3175367, 98436482, then
        // 3051531043 wraps to -1243436253, and the last step lands on 108181935.
        it.each([
            ['glacier', 108181935n],
            ['Herobrine', 10528182n],
            ['minecraft', 695073197n],
            ['a', 97n]
        ])('hashes %s the way Java does', (text, expected) => {
            expect(worldSeedOf(text)).toBe(expected);
        });

        it('hashes a number too long to be a long, as Long.parseLong would refuse it', () => {
            // One past Long.MAX_VALUE: Java's parse throws there, so the text is hashed.
            expect(worldSeedOf('9223372036854775808')).toBe(-1773151197n);
        });

        it('ignores the whitespace around a seed, as Java trims it', () => {
            expect(worldSeedOf('  1234  ')).toBe(1234n);
        });

        it('reads an absent or empty seed as zero', () => {
            expect(worldSeedOf(undefined)).toBe(0n);
            expect(worldSeedOf('')).toBe(0n);
            expect(worldSeedOf('   ')).toBe(0n);
        });

        it('truncates a fractional number rather than refusing it', () => {
            expect(worldSeedOf(12.75)).toBe(12n);
            expect(worldSeedOf(Number.NaN)).toBe(0n);
        });
    });
});
