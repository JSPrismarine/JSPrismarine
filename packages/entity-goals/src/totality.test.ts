import { describe, expect, it } from 'vitest';

import { goalInventory, goalNames, measureCoverage } from './inventory';
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

    it('covers all 129 vanilla entities', () => {
        const coverage = measureCoverage(new Set(vanillaGoalNames));

        expect(coverage.goals).toBe(170);
        expect(coverage.entities).toBe(129);
        expect(coverage.entitiesWithGoals).toBe(92);
        expect(coverage.missing).toEqual([]);
    });

    it('gives every goal control flags that the scheduler understands', () => {
        for (const entry of vanillaGoals) {
            for (const flag of entry.controlFlags) expect(['move', 'look', 'jump']).toContain(flag);
        }
    });
});
