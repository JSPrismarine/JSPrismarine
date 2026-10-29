import { describe, expect, it } from 'vitest';

import { reportProgress } from '../../../.test/reportProgress';

import { goalInventory, goalNames, goalUse, goalsOf, measureCoverage } from './inventory';

describe('the generated goal inventory', () => {
    it('keeps its counts consistent with the generated inventory', () => {
        expect(goalInventory.entityCount).toBe(goalInventory.entities.length);
        expect(goalInventory.goalCount).toBe(goalNames.length);
        expect(goalInventory.entities.length).toBeGreaterThan(0);
        expect(goalNames.length).toBeGreaterThan(0);
        reportProgress(
            `Goal inventory tracks ${goalInventory.entities.length} entities and ${goalNames.length} distinct goals.`
        );
    });

    it('sorts the goals by how many entities use them', () => {
        const counts = goalInventory.goals.map((goal) => goal.entities);

        expect(counts).toEqual([...counts].sort((a, b) => b - a));
        expect(goalNames[0]).toBe('minecraft:behavior.look_at_player');
    });

    it('records the parameter keys a goal takes', () => {
        const stroll = goalUse('minecraft:behavior.random_stroll');

        expect(stroll?.entities).toBeGreaterThan(0);
        reportProgress(`minecraft:behavior.random_stroll is used by ${stroll?.entities ?? 0} entity types.`);
        expect(stroll?.parameters.map((parameter) => parameter.key)).toEqual(
            expect.arrayContaining(['priority', 'speed_multiplier', 'xz_dist', 'y_dist', 'interval'])
        );
    });

    it('answers which goals one entity declares', () => {
        expect(goalsOf('minecraft:creeper')).toContain('minecraft:behavior.swell');
        expect(goalsOf('minecraft:arrow')).toEqual([]);
    });

    it('reports no goals covered by an empty implementation set', () => {
        const coverage = measureCoverage(new Set());

        expect(coverage.goals).toBe(0);
        expect(coverage.entitiesWithGoals).toBe(0);
        expect(coverage.entities).toBe(goalInventory.entities.filter((entity) => goalsOf(entity).length === 0).length);
        expect(coverage.missing).toEqual(goalNames);
    });

    it('counts every entity as covered by the whole inventory', () => {
        const coverage = measureCoverage(new Set(goalNames));

        expect(coverage.goals).toBe(goalNames.length);
        expect(coverage.entities).toBe(goalInventory.entities.length);
        expect(coverage.entitiesWithGoals).toBe(
            goalInventory.entities.filter((entity) => goalsOf(entity).length > 0).length
        );
        expect(coverage.missing).toEqual([]);
    });
});
