import { describe, expect, it } from 'vitest';

import { sortFeaturesPerStep } from './featureSorter';

describe('sortFeaturesPerStep', () => {
    it('keeps one biome’s order and drops nothing', () => {
        expect(sortFeaturesPerStep([[['ore_coal', 'ore_iron'], ['trees']]])).toEqual([
            ['ore_coal', 'ore_iron'],
            ['trees']
        ]);
    });

    it('runs a shared feature once', () => {
        const sorted = sortFeaturesPerStep([
            [['ore_coal', 'ore_iron']],
            [['ore_coal', 'ore_gold']],
            [['ore_coal', 'ore_iron', 'ore_gold']]
        ]);

        expect(sorted).toEqual([['ore_coal', 'ore_iron', 'ore_gold']]);
    });

    it('merges two biomes that interleave their features', () => {
        const sorted = sortFeaturesPerStep([[['a', 'c', 'e']], [['a', 'b', 'c', 'd', 'e']]]);

        expect(sorted).toEqual([['a', 'b', 'c', 'd', 'e']]);
    });

    it('gives a feature the same index whichever biome reaches it', () => {
        const sorted = sortFeaturesPerStep([
            [[], ['lake'], [], [], [], [], ['ore_coal']],
            [[], ['lake'], [], [], [], [], ['ore_coal', 'ore_iron']]
        ]);

        expect(sorted[1]).toEqual(['lake']);
        expect(sorted[6]).toEqual(['ore_coal', 'ore_iron']);
    });

    it('separates the same feature listed in two steps', () => {
        const sorted = sortFeaturesPerStep([[['spring'], ['spring']]]);

        expect(sorted).toEqual([['spring'], ['spring']]);
    });

    it('returns as many steps as the longest biome lists', () => {
        expect(sortFeaturesPerStep([[['a']], [['a'], [], ['b']]])).toHaveLength(3);
        expect(sortFeaturesPerStep([])).toEqual([]);
    });

    it('rejects two biomes that order the same pair opposite ways', () => {
        expect(() => sortFeaturesPerStep([[['a', 'b']], [['b', 'a']]])).toThrow(/cycle/);
    });
});
