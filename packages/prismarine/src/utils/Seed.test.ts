import { describe, expect, it } from 'vitest';
import { SeedGenerator } from './Seed';

describe('utils', () => {
    describe('SeedGenerator', () => {
        it('should generate a number', () => {
            const seed = SeedGenerator();
            expect(typeof seed).toBe('number');
        });

        it('should generate a number within the safe integer range', () => {
            const seed = SeedGenerator();
            expect(seed).toBeGreaterThanOrEqual(1);
            expect(seed).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
        });

        it('should generate different numbers on subsequent calls', () => {
            const seed1 = SeedGenerator();
            const seed2 = SeedGenerator();
            expect(seed1).not.toBe(seed2);
        });
    });
});
