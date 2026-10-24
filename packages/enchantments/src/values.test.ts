import { constantRandom, scriptedRandom } from '@jsprismarine/predicates';
import { describe, expect, it } from 'vitest';

import { VALUE_EFFECT_TYPES, parseValueEffect } from './values';

const compile = (json: unknown) => {
    const { value, diagnostics } = parseValueEffect(json);
    expect(diagnostics).toEqual([]);
    return value;
};

describe('the six value effect types', () => {
    it('registers exactly the six names 26.3 declares', () => {
        expect([...VALUE_EFFECT_TYPES].sort()).toEqual([
            'add',
            'all_of',
            'exponential',
            'multiply',
            'remove_binomial',
            'set'
        ]);
    });

    it('adds a level based amount to the running value', () => {
        // sharpness.json: linear, base 1.0, per level above first 0.5.
        const effect = compile({
            type: 'minecraft:add',
            value: { type: 'minecraft:linear', base: 1.0, per_level_above_first: 0.5 }
        });

        expect(effect(1, 5, constantRandom(0.5))).toBe(6);
        expect(effect(3, 5, constantRandom(0.5))).toBe(7);
    });

    it('multiplies the running value by a factor', () => {
        // mending.json: multiply by 2.
        const effect = compile({ type: 'minecraft:multiply', factor: 2 });
        expect(effect(1, 3, constantRandom(0.5))).toBe(6);
    });

    it('replaces the running value', () => {
        // infinity.json: set ammo use to 0.
        const effect = compile({ type: 'minecraft:set', value: 0 });
        expect(effect(1, 99, constantRandom(0.5))).toBe(0);
    });

    it('scales the running value by base raised to an exponent', () => {
        const effect = compile({ type: 'minecraft:exponential', base: 2, exponent: 3 });
        expect(effect(1, 5, constantRandom(0.5))).toBe(40);
    });

    it('removes one per successful draw in remove_binomial', () => {
        const always = compile({ type: 'minecraft:remove_binomial', chance: 1 });
        const never = compile({ type: 'minecraft:remove_binomial', chance: 0 });

        expect(always(1, 10, constantRandom(0))).toBe(0);
        expect(never(1, 10, constantRandom(0))).toBe(10);
    });

    it('draws remove_binomial once per unit of the running value', () => {
        // Four trials, two of which land under the chance of 0.5.
        const effect = compile({ type: 'minecraft:remove_binomial', chance: 0.5 });
        expect(effect(1, 4, scriptedRandom([0.1, 0.9, 0.4, 0.95]))).toBe(2);
    });

    it('switches remove_binomial to the normal approximation above 128 trials', () => {
        // 200 trials at a chance of 0.5 clears all three thresholds, so the
        // result comes from one gaussian draw rather than 200 float draws.
        const effect = compile({ type: 'minecraft:remove_binomial', chance: 0.5 });
        const draws: number[] = [];
        const counted = {
            nextFloat: () => {
                draws.push(0.5);
                return 0.5;
            },
            nextInt: () => 0,
            nextGaussian: () => 0
        };

        expect(effect(1, 200, counted)).toBe(100);
        expect(draws).toEqual([]);
    });
});

describe('value effect composition', () => {
    it('threads the running value through all_of in order', () => {
        const addThenMultiply = compile({
            type: 'minecraft:all_of',
            effects: [
                { type: 'minecraft:add', value: 1 },
                { type: 'minecraft:multiply', factor: 2 }
            ]
        });
        const multiplyThenAdd = compile({
            type: 'minecraft:all_of',
            effects: [
                { type: 'minecraft:multiply', factor: 2 },
                { type: 'minecraft:add', value: 1 }
            ]
        });

        expect(addThenMultiply(1, 0, constantRandom(0.5))).toBe(2);
        expect(multiplyThenAdd(1, 0, constantRandom(0.5))).toBe(1);
    });
});

describe('the level based value types', () => {
    const atLevel = (json: unknown, level: number): number =>
        compile({ type: 'minecraft:set', value: json })(level, 0, constantRandom(0.5));

    it('reads a bare number as a constant', () => {
        expect(atLevel(7, 4)).toBe(7);
    });

    it('reads linear', () => {
        expect(atLevel({ type: 'minecraft:linear', base: 1, per_level_above_first: 0.5 }, 3)).toBe(2);
    });

    it('reads clamped', () => {
        // frost_walker.json clamps a linear radius to 0..16.
        const radius = { type: 'minecraft:linear', base: 3, per_level_above_first: 1 };
        const clamped = { type: 'minecraft:clamped', max: 16, min: 0, value: radius };
        expect(atLevel(clamped, 2)).toBe(4);
        expect(atLevel(clamped, 40)).toBe(16);
    });

    it('reads fraction', () => {
        // unbreaking.json: (2 + 2 per level) over (10 + 5 per level) on armor.
        const chance = {
            type: 'minecraft:fraction',
            numerator: { type: 'minecraft:linear', base: 2, per_level_above_first: 2 },
            denominator: { type: 'minecraft:linear', base: 10, per_level_above_first: 5 }
        };
        expect(atLevel(chance, 1)).toBeCloseTo(0.2, 10);
        expect(atLevel(chance, 3)).toBeCloseTo(0.3, 10);
    });

    it('reads levels_squared', () => {
        // efficiency.json: level squared plus one.
        expect(atLevel({ type: 'minecraft:levels_squared', added: 1.0 }, 3)).toBe(10);
    });

    it('reads exponent', () => {
        expect(atLevel({ type: 'minecraft:exponent', base: 2, power: 3 }, 1)).toBe(8);
    });

    it('reads lookup and its fallback', () => {
        // wind_burst.json: three listed levels, then a linear fallback.
        const knockback = {
            type: 'minecraft:lookup',
            values: [1.2, 1.75, 2.2],
            fallback: { type: 'minecraft:linear', base: 1.5, per_level_above_first: 0.35 }
        };
        expect(atLevel(knockback, 2)).toBe(1.75);
        expect(atLevel(knockback, 4)).toBeCloseTo(2.55, 10);
    });
});

describe('a malformed value effect', () => {
    it('reports an unknown type and leaves the running value alone', () => {
        const { value, diagnostics } = parseValueEffect({ type: 'minecraft:halve' });
        expect(diagnostics.map((entry) => entry.message)).toEqual(['unknown value effect type minecraft:halve']);
        expect(value(1, 12, constantRandom(0.5))).toBe(12);
    });

    it('reports a bare number where a value effect belongs', () => {
        const { diagnostics } = parseValueEffect(3);
        expect(diagnostics.map((entry) => entry.message)).toEqual(['a value effect needs a type, not a bare number']);
    });
});
