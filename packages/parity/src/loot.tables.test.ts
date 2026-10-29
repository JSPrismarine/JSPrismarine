import { expect, it } from 'vitest';

import { checkAllowList } from './allowlist.ts';
import { FAMILIES } from './families.ts';
import { loadVanillaDatapack, vanillaLootRegistry } from './javaDatapack.ts';
import { describeFamily } from './measure.ts';
import { reportParityProgress } from './progress.ts';
import { REFERENCES } from './references.ts';

/**
 * Phase 2's loot exit criterion, green by structure for every Java vanilla loot table: each
 * parses, resolves the predicates, item modifiers and tables it references,
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

describeFamily(
    FAMILIES.lootTables,
    [REFERENCES.javaServerJar],
    () => {
        const { gaps, tables, detail } = compareLootTables();
        const verdict = checkAllowList(FAMILIES.lootTables, gaps);

        it('reads every vanilla loot table, references resolved and no cycle', () => {
            expect(verdict.unexpected, detail.join('\n')).toEqual([]);
        });

        it('carries no stale allow-list entry', () => {
            expect(verdict.stale).toEqual([]);
        });

        it('reports the current loot table comparison volume', () => {
            reportParityProgress(FAMILIES.lootTables, { javaLootTables: tables });
            expect(tables).toBeGreaterThan(0);
        });
    },
    { tags: ['real-data'] }
);
