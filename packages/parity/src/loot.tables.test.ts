import { expect, it } from 'vitest';

import { checkAllowList } from './allowlist.ts';
import { FAMILIES } from './families.ts';
import { loadVanillaDatapack, vanillaLootRegistry } from './javaDatapack.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';

/**
 * Phase 2's loot exit criterion, green by structure for every table: all 1447 of Java's
 * vanilla loot tables parse, resolve the predicates, item modifiers and tables they reference,
 * and hold no reference cycle. Distribution is the other half of the criterion and has its own
 * row, `loot.distribution`.
 *
 * Gap ids: `structure:<json path>` for a table member the registry reports an error for, and
 * `cycle:<first table of the cycle>` for a loop the evaluator would not come back from.
 */
const compareLootTables = (): { gaps: string[]; tables: number; detail: string[] } => {
    const { definitions } = loadVanillaDatapack();
    const registry = vanillaLootRegistry(definitions);

    const errors = registry.validate().filter((entry) => entry.severity === 'error');
    const gaps = [
        ...errors.map((entry) => `structure:${entry.path}`),
        ...registry.cycles.map((cycle) => `cycle:${cycle[0] ?? '<empty>'}`)
    ];
    const detail = errors.slice(0, 20).map((entry) => `${entry.path}: ${entry.message}`);

    return { gaps: [...new Set(gaps)], tables: definitions.lootTablesJava.size, detail };
};

describeFamily(FAMILIES.lootTables, [REFERENCES.javaServerJar], () => {
    const { gaps, tables, detail } = compareLootTables();
    const verdict = checkAllowList(FAMILIES.lootTables, gaps);

    it('reads every vanilla loot table, references resolved and no cycle', () => {
        expect(verdict.unexpected, detail.join('\n')).toEqual([]);
    });

    it('carries no stale allow-list entry', () => {
        expect(verdict.stale).toEqual([]);
    });

    it("reads Java 26.3's whole loot table directory", () => {
        // docs/plans/data-driven-vanilla.md section 2 counts 1447 loot tables at 26.3.
        expect(tables).toBe(1447);
    });
});
