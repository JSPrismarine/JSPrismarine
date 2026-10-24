import { describe, expect, it } from 'vitest';
import { MATH_FUNCTIONS } from './math';

const call = (name: keyof typeof MATH_FUNCTIONS, ...args: number[]) => MATH_FUNCTIONS[name].evaluate(args);

describe('MATH_FUNCTIONS', () => {
    it('covers the 61 documented functions', () => {
        expect(Object.keys(MATH_FUNCTIONS)).toHaveLength(61);
    });

    it('uses degrees for trigonometry', () => {
        expect(call('sin', 90)).toBeCloseTo(1);
        expect(call('cos', 180)).toBeCloseTo(-1);
        expect(call('asin', 1)).toBeCloseTo(90);
        expect(call('acos', -1)).toBeCloseTo(180);
        expect(call('atan', 1)).toBeCloseTo(45);
        expect(call('atan2', 1, 1)).toBeCloseTo(45);
    });

    it('returns -1 from sign for zero, per the documented wording', () => {
        expect(call('sign', 2.5)).toBe(1);
        expect(call('sign', -0.1)).toBe(-1);
        expect(call('sign', 0)).toBe(-1);
    });

    it('keeps the dividend sign in mod, like C fmod', () => {
        expect(call('mod', -7, 3)).toBeCloseTo(-1);
        expect(call('mod', 7, -3)).toBeCloseTo(1);
    });

    it('terminates die_roll and sums n draws within the range', () => {
        const value = call('die_roll', 3, 1, 2);
        expect(value).toBeGreaterThanOrEqual(3);
        expect(value).toBeLessThanOrEqual(6);
        expect(call('die_roll', 0, 1, 2)).toBe(0);
    });

    it('sums integer draws in die_roll_integer', () => {
        const value = call('die_roll_integer', 4, 1, 3);
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(4);
        expect(value).toBeLessThanOrEqual(12);
    });

    it('draws random_integer uniformly over the inclusive range', () => {
        for (let i = 0; i < 50; i++) {
            const value = call('random_integer', 1, 3);
            expect([1, 2, 3]).toContain(value);
        }
    });

    it('interpolates without clamping in lerp and normalizes in inverse_lerp', () => {
        expect(call('lerp', 0, 10, 0.5)).toBe(5);
        expect(call('lerp', 0, 10, 2)).toBe(20);
        expect(call('inverse_lerp', 0, 10, 5)).toBe(0.5);
    });

    it('rotates the shortest way in lerprotate', () => {
        expect(call('lerprotate', 350, 10, 0.5)).toBeCloseTo(0);
        expect(call('lerprotate', 10, 350, 0.5)).toBeCloseTo(0);
    });

    it('minimizes angles into [-180, 180)', () => {
        expect(call('min_angle', 190)).toBeCloseTo(-170);
        expect(call('min_angle', -190)).toBeCloseTo(170);
        expect(call('min_angle', 180)).toBeCloseTo(-180);
    });

    it('computes hermite_blend as 3t^2 - 2t^3', () => {
        expect(call('hermite_blend', 0.5)).toBeCloseTo(0.5);
        expect(call('hermite_blend', 1)).toBeCloseTo(1);
    });

    it('clamps, truncates and copies signs', () => {
        expect(call('clamp', 5, 0, 1)).toBe(1);
        expect(call('trunc', -2.7)).toBe(-2);
        expect(call('copy_sign', 3, -1)).toBe(-3);
    });

    it('evaluates pi without arguments', () => {
        expect(call('pi')).toBeCloseTo(Math.PI);
    });

    it('moves the easing functions from start to end along the curve', () => {
        for (const name of ['ease_in_quad', 'ease_out_bounce', 'ease_in_out_elastic', 'ease_in_back'] as const) {
            expect(call(name, 2, 7, 0)).toBeCloseTo(2);
            expect(call(name, 2, 7, 1)).toBeCloseTo(7);
        }
        expect(call('ease_in_quad', 0, 1, 0.5)).toBeCloseTo(0.25);
        expect(call('ease_in_out_sine', 0, 1, 0.5)).toBeCloseTo(0.5);
    });
});
