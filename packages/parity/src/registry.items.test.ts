import { item_table } from '@jsprismarine/bedrock-data';
import { describe, expect, it } from 'vitest';

import { FAMILIES } from './families.ts';
import { checkAllowList } from './allowlist.ts';
import { loadMojangItems, loadRequiredItemList } from './goldens.ts';
import { REFERENCES } from './references.ts';
import { reportParityProgress } from './progress.ts';
import { reportParityCases } from './trackerCases.ts';

/**
 * Compares the item capture from a 1.26.51 Bedrock Dedicated Server with the item list Mojang
 * publishes in `bedrock-samples`, which catches a golden taken from the wrong version: the
 * samples list a subset of the registry, so an item they name has to be captured with the
 * same id. Then compares the item table the server ships against the capture, which catches a
 * table generated from something else.
 *
 * The samples are a fetched source. Without them only the second comparison runs.
 *
 * Gap ids: `samples-only:<name>` for an item the samples name and the capture does not,
 * `sources-disagree:<name>` when the two give it different ids, `table:<name>` when the
 * shipped table differs from the capture.
 */
interface RegistryItemCase {
    readonly id: string;
    readonly gaps: string[];
}

const samplesRoot = REFERENCES.bedrockVanillaData.locate();

const compareItems = (): { gaps: string[]; cases: RegistryItemCase[] } => {
    const capture = loadRequiredItemList();
    const samples = samplesRoot === undefined ? [] : loadMojangItems(samplesRoot);
    const gaps: string[] = [];

    for (const { name, rawId } of samples) {
        const captured = capture[name];
        if (captured === undefined) gaps.push(`samples-only:${name}`);
        else if (captured.runtime_id !== rawId) gaps.push(`sources-disagree:${name}`);
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

    const identifiers = new Set([
        ...Object.keys(capture),
        ...samples.map(({ name }) => name),
        ...Object.keys(item_table)
    ]);
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
            context: 'Bedrock item capture, Mojang item list, and server item table',
            status: gaps.some((gap) => unexpected.has(gap)) ? 'failed' : 'passed',
            ...(gaps.length === 0 ? {} : { details: gaps.join(', ') })
        }))
    );

    it('ships every item the capture contains, with the id Mojang publishes for it', () => {
        expect(verdict.unexpected).toEqual([]);
    });

    it('carries no stale allow-list entry', () => {
        expect(verdict.stale).toEqual([]);
    });

    it('reports the current item catalog comparison volume', () => {
        reportParityProgress(FAMILIES.registryItems, {
            capturedItems: Object.keys(loadRequiredItemList()).length,
            samplesItems: samplesRoot === undefined ? 0 : loadMojangItems(samplesRoot).length,
            shippedItems: Object.keys(item_table).length
        });
    });
});
