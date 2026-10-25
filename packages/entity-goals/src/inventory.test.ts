import { describe, expect, it } from 'vitest';

import { goalInventory, goalNames, goalUse, goalsOf, measureCoverage } from './inventory';

describe('the generated goal inventory', () => {
    it('holds the 170 goals of the 129 vanilla entities', () => {
        expect(goalInventory.entityCount).toBe(129);
        expect(goalInventory.entities).toHaveLength(129);
        expect(goalInventory.goalCount).toBe(170);
        expect(goalNames).toHaveLength(170);
    });

    it('sorts the goals by how many entities use them', () => {
        const counts = goalInventory.goals.map((goal) => goal.entities);

        expect(counts).toEqual([...counts].sort((a, b) => b - a));
        expect(goalNames[0]).toBe('minecraft:behavior.look_at_player');
    });

    it('records the parameter keys a goal takes', () => {
        const stroll = goalUse('minecraft:behavior.random_stroll');

        expect(stroll?.entities).toBe(64);
        expect(stroll?.parameters.map((parameter) => parameter.key)).toEqual(
            expect.arrayContaining(['priority', 'speed_multiplier', 'xz_dist', 'y_dist', 'interval'])
        );
    });

    it('answers which goals one entity declares', () => {
        expect(goalsOf('minecraft:creeper')).toContain('minecraft:behavior.swell');
        expect(goalsOf('minecraft:arrow')).toEqual([]);
    });

    it('counts the 37 entities with no goals as covered by an empty set', () => {
        const coverage = measureCoverage(new Set());

        expect(coverage.goals).toBe(0);
        expect(coverage.entitiesWithGoals).toBe(0);
        expect(coverage.entities).toBe(37);
        expect(coverage.missing).toHaveLength(170);
    });

    it('counts every entity as covered by the whole inventory', () => {
        const coverage = measureCoverage(new Set(goalNames));

        expect(coverage.goals).toBe(170);
        expect(coverage.entities).toBe(129);
        expect(coverage.entitiesWithGoals).toBe(92);
        expect(coverage.missing).toEqual([]);
    });
});
