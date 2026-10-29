import { describe, expect, it } from 'vitest';

import { reportProgress } from '../../../.test/reportProgress';
import { goalInventory, goalNames, goalsOf, measureCoverage } from './inventory';
import { vanillaGoalNames, vanillaGoals } from './register';

/**
 * The coverage guard.
 *
 * Every goal name the generated inventory records has to have a registered
 * factory, so a goal cannot quietly go missing, and no factory may register a
 * name vanilla does not use.
 */

describe('the registered goals against the vanilla inventory', () => {
    it('implements every goal the vanilla pack uses', () => {
        const missing = goalNames.filter((name) => !vanillaGoalNames.includes(name));

        expect(missing).toEqual([]);
    });

    it('registers no goal the vanilla pack does not use', () => {
        const extra = vanillaGoalNames.filter((name) => !goalNames.includes(name));

        expect(extra).toEqual([]);
    });

    it('registers each name exactly once', () => {
        expect(new Set(vanillaGoalNames).size).toBe(vanillaGoalNames.length);
        expect(vanillaGoals).toHaveLength(goalInventory.goalCount);
    });

    it('covers every entity in the vanilla inventory', () => {
        const coverage = measureCoverage(new Set(vanillaGoalNames));

        expect(coverage.goals).toBe(goalNames.length);
        expect(coverage.entities).toBe(goalInventory.entities.length);
        expect(coverage.entitiesWithGoals).toBe(
            goalInventory.entities.filter((entity) => goalsOf(entity).length > 0).length
        );
        expect(coverage.missing).toEqual([]);
        reportProgress(
            `Goal implementation covers ${coverage.goals} goals across ${coverage.entities} entities; ${coverage.entitiesWithGoals} entities use at least one goal.`
        );
    });

    it('gives every goal control flags that the scheduler understands', () => {
        for (const entry of vanillaGoals) {
            for (const flag of entry.controlFlags) expect(['move', 'look', 'jump']).toContain(flag);
        }
    });
});
