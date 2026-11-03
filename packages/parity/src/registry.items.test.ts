import { item_table } from '@jsprismarine/bedrock-data';
import { describe, expect, it } from 'vitest';

import { FAMILIES } from './families.ts';
import { checkAllowList } from './allowlist.ts';
import { loadRequiredItemList, loadRuntimeItemStates } from './goldens.ts';
import { reportParityProgress } from './progress.ts';
import { reportParityCases } from './trackerCases.ts';

/**
 * Compares the two independent item sources with each other first - the capture from a 1.26.51
 * Bedrock Dedicated Server and the submodule's 1.26.50 dump - which catches a golden taken from
 * the wrong version. Then compares the item table the server ships against the capture, which
 * catches a table generated from something else.
 *
 * Gap ids: `capture-only:<name>`, `dump-only:<name>`, `sources-disagree:<name>` when the two
 * goldens differ on an id or component flag, `table:<name>` when the shipped table differs
 * from the capture.
 */
interface RegistryItemCase {
    readonly id: string;
    readonly gaps: string[];
}

const compareItems = (): { gaps: string[]; cases: RegistryItemCase[] } => {
    const capture = loadRequiredItemList();
    const dump = loadRuntimeItemStates();
    const gaps: string[] = [];

    const dumpByName = new Map(dump.map((entry) => [entry.name, entry]));

    for (const name of Object.keys(capture)) if (!dumpByName.has(name)) gaps.push(`capture-only:${name}`);
    for (const name of dumpByName.keys()) if (!(name in capture)) gaps.push(`dump-only:${name}`);

    for (const [name, entry] of Object.entries(capture)) {
        const dumped = dumpByName.get(name);
        if (!dumped) continue;
        if (dumped.id !== entry.runtime_id || dumped.componentBased !== entry.component_based) {
            gaps.push(`sources-disagree:${name}`);
        }
    }

    const tableNames = new Set(Object.keys(item_table));
    for (const [name, entry] of Object.entries(capture)) {
        const ours = item_table[name];
        if (!ours || ours.runtime_id !== entry.runtime_id || ours.component_based !== entry.component_based) {
            gaps.push(`table:${name}`);
        }
        tableNames.delete(name);
    }
    for (const name of tableNames) gaps.push(`table:${name}`);

    const identifiers = new Set([...Object.keys(capture), ...dumpByName.keys(), ...Object.keys(item_table)]);
    const cases = [...identifiers].map((id) => ({ id, gaps: gaps.filter((gap) => gap.endsWith(id)) }));
    return { gaps, cases };
};

describe(FAMILIES.registryItems, () => {
    const comparison = compareItems();
    const verdict = checkAllowList(FAMILIES.registryItems, comparison.gaps);
    const unexpected = new Set(verdict.unexpected);

    reportParityCases(
        FAMILIES.registryItems,
        import.meta.filename,
        comparison.cases.map(({ id, gaps }) => ({
            id,
            title: id,
            context: 'Bedrock item capture, runtime dump, and server item table',
            status: gaps.some((gap) => unexpected.has(gap)) ? 'failed' : 'passed',
            ...(gaps.length === 0 ? {} : { details: gaps.join(', ') })
        }))
    );

    it('ships every item the capture contains, with the id and flags both goldens agree on', () => {
        expect(verdict.unexpected).toEqual([]);
    });

    it('carries no stale allow-list entry', () => {
        expect(verdict.stale).toEqual([]);
    });

    it('reports the current item catalog comparison volume', () => {
        reportParityProgress(FAMILIES.registryItems, {
            capturedItems: Object.keys(loadRequiredItemList()).length,
            dumpedItems: loadRuntimeItemStates().length,
            shippedItems: Object.keys(item_table).length
        });
    });
});
