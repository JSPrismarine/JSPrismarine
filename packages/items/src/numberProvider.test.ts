import { describe, expect, it } from 'vitest';

import { reportProgress } from '../../../.test/reportProgress';

import {
    DEFAULT_PROVIDER_CONTEXT,
    evaluateNumberProvider,
    FAST_COOKING_CONTEXT,
    NumberProviderError
} from './numberProvider';
import { itemTypesTable } from './tables';

describe('the context number providers item components point at', () => {
    it('reports the providers available to item components', () => {
        const providers = Object.keys(itemTypesTable.providers);
        expect(providers.length).toBeGreaterThan(0);
        reportProgress(`Item components can resolve ${providers.length} context number providers.`);
    });

    it('resolves a fuel burn time through the division and the conditional', () => {
        expect(evaluateNumberProvider('minecraft:cooking/time_boats')).toBe(1200);
        expect(evaluateNumberProvider('minecraft:cooking/time_lava_bucket')).toBe(20000);
        expect(evaluateNumberProvider('minecraft:cooking/time_coal')).toBe(1600);
    });

    it('halves a burn time in a smoker or blast furnace', () => {
        expect(evaluateNumberProvider('minecraft:cooking/time_boats', FAST_COOKING_CONTEXT)).toBe(600);
        expect(evaluateNumberProvider('minecraft:cooking/speed_default', FAST_COOKING_CONTEXT)).toBe(2);
        expect(evaluateNumberProvider('minecraft:cooking/speed_default', DEFAULT_PROVIDER_CONTEXT)).toBe(1);
    });

    it('takes the expected value of a weighted list, which is the composting chance', () => {
        expect(evaluateNumberProvider('minecraft:compostable/low')).toBeCloseTo(0.3);
        expect(evaluateNumberProvider('minecraft:compostable/low_medium')).toBeCloseTo(0.5);
        expect(evaluateNumberProvider('minecraft:compostable/medium')).toBeCloseTo(0.65);
        expect(evaluateNumberProvider('minecraft:compostable/medium_high')).toBeCloseTo(0.85);
        expect(evaluateNumberProvider('minecraft:compostable/always_add_one')).toBe(1);
    });

    it('takes a dispatcher case when its condition holds', () => {
        const emptyComposter = { condition: (condition: unknown) => typeof condition === 'object' };
        expect(evaluateNumberProvider('minecraft:compostable/low', emptyComposter)).toBe(1);
    });

    it('evaluates an inline definition without a reference', () => {
        expect(evaluateNumberProvider({ type: 'minecraft:div', left: 100, right: 4 })).toBe(25);
        expect(evaluateNumberProvider(7)).toBe(7);
    });

    it('refuses an unknown reference and an unknown node kind', () => {
        expect(() => evaluateNumberProvider('minecraft:cooking/time_nothing')).toThrow(NumberProviderError);
        expect(() => evaluateNumberProvider({ type: 'minecraft:mystery' })).toThrow(NumberProviderError);
        expect(() => evaluateNumberProvider({ type: 'minecraft:div', left: 1, right: 0 })).toThrow(NumberProviderError);
    });
});
