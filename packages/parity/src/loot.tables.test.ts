import { expect, it } from 'vitest';

import { checkAllowList } from './allowlist.ts';
import { FAMILIES } from './families.ts';
import { loadVanillaDatapack, vanillaLootRegistry } from './javaDatapack.ts';
import { describeFamily } from './measure.ts';
import { reportParityProgress } from './progress.ts';
import { REFERENCES } from './references.ts';
import { reportParityCases } from './trackerCases.ts';

/**
 * Phase 2's loot exit criterion, green by structure for every Java vanilla loot table: each
 * parses, resolves the predicates, item modifiers and tables it references,
 * and hold no reference cycle. Distribution is the other half of the criterion and has its own
 * row, `loot.distribution`.
 *
 * Gap ids: `structure:<json path>` for a table member the registry reports an error for, and
 * `cycle:<first table of the cycle>` for a loop the evaluator would not come back from.
 */
interface LootTableParityCase {
    readonly id: string;
    readonly gaps: string[];
}

const compareLootTables = (): { gaps: string[]; tables: number; detail: string[]; cases: LootTableParityCase[] } => {
    const { definitions } = loadVanillaDatapack();
    const registry = vanillaLootRegistry(definitions);

    const errors = registry.validate().filter((entry) => entry.severity === 'error');
    const caseMap = new Map<string, LootTableParityCase>(registry.ids.map((id) => [id, { id, gaps: [] }]));
    for (const entry of registry.findings.filter((finding) => finding.severity === 'error')) {
        const gap = `structure:${entry.path}`;
        caseMap.get(entry.id)?.gaps.push(gap);
    }
    for (const cycle of registry.cycles) {
        const first = cycle[0] ?? '<empty>';
        caseMap.get(first)?.gaps.push(`cycle:${first}`);
    }
    const gaps = [
        ...errors.map((entry) => `structure:${entry.path}`),
        ...registry.cycles.map((cycle) => `cycle:${cycle[0] ?? '<empty>'}`)
    ];
    const detail = errors.slice(0, 20).map((entry) => `${entry.path}: ${entry.message}`);

    return { gaps: [...new Set(gaps)], tables: definitions.lootTablesJava.size, detail, cases: [...caseMap.values()] };
};

describeFamily(
    FAMILIES.lootTables,
    [REFERENCES.javaServerJar],
    () => {
        const { gaps, tables, detail, cases } = compareLootTables();
        const verdict = checkAllowList(FAMILIES.lootTables, gaps);
        const unexpected = new Set(verdict.unexpected);

        reportParityCases(
            FAMILIES.lootTables,
            import.meta.filename,
            cases.map(({ id, gaps: caseGaps }) => ({
                id,
                title: id,
                context: 'Java loot table parse and reference validation',
                status: caseGaps.some((gap) => unexpected.has(gap)) ? 'failed' : 'passed',
                ...(caseGaps.length === 0 ? {} : { details: caseGaps.join(', ') })
            }))
        );

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
