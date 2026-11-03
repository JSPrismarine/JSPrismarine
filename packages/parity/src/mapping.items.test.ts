import { itemTypesTable } from '@jsprismarine/items/tables';
import { javaItemToBedrock } from '@jsprismarine/mapping';
import { itemsTable } from '@jsprismarine/mapping/tables';
import { expect, it } from 'vitest';

import { checkAllowList } from './allowlist.ts';
import { FAMILIES } from './families.ts';
import { loadRequiredItemList } from './goldens.ts';
import { describeFamily } from './measure.ts';
import { reportParityProgress } from './progress.ts';
import { REFERENCES } from './references.ts';
import { reportParityCases } from './trackerCases.ts';

/**
 * Chunker's totality property for the item domain. Every Java item resolves to a Bedrock item,
 * and the Bedrock item is one the `ItemRegistryPacket` capture actually advertises, so a
 * mapping onto an identifier no server sends fails here rather than at a player's inventory.
 *
 * Gap ids: `unknown:<java id>` for an item that does not map, `loss:<java id>` for a reviewed
 * loss, `merge:<bedrock id>` for a Bedrock item more than one Java item reaches, and
 * `unadvertised:<bedrock id>` for an output the item capture does not list.
 */
interface ItemMappingCase {
    readonly javaId: string;
    readonly bedrockId?: string;
    readonly gaps: string[];
}

const compareItemMapping = (): { gaps: string[]; items: number; cases: ItemMappingCase[] } => {
    const advertised = loadRequiredItemList();
    const gaps = new Set<string>();
    const javaByBedrock = new Map<string, Set<string>>();
    const javaIds = Object.keys(itemsTable.items);
    const cases: ItemMappingCase[] = [];

    for (const javaId of javaIds) {
        const result = javaItemToBedrock(javaId);
        const caseGaps: string[] = [];
        if (result.kind === 'unknown') {
            caseGaps.push(`unknown:${javaId}`);
            gaps.add(caseGaps[0]!);
            cases.push({ javaId, gaps: caseGaps });
            continue;
        }
        if (result.kind === 'loss') {
            caseGaps.push(`loss:${javaId}`);
            gaps.add(caseGaps[0]!);
        }

        const bedrockId = result.bedrock.identifier;
        if (!(bedrockId in advertised)) {
            caseGaps.push(`unadvertised:${bedrockId}`);
            gaps.add(caseGaps.at(-1)!);
        }

        const sources = javaByBedrock.get(bedrockId);
        if (sources) sources.add(javaId);
        else javaByBedrock.set(bedrockId, new Set([javaId]));
        cases.push({ javaId, bedrockId, gaps: caseGaps });
    }

    for (const [bedrockId, sources] of javaByBedrock) {
        if (sources.size <= 1) continue;
        const merge = `merge:${bedrockId}`;
        gaps.add(merge);
        for (const javaId of sources) cases.find((entry) => entry.javaId === javaId)?.gaps.push(merge);
    }

    return { gaps: [...gaps], items: javaIds.length, cases };
};

describeFamily(FAMILIES.mappingItems, [REFERENCES.bedrockItemCapture], () => {
    const { gaps, items, cases } = compareItemMapping();
    const verdict = checkAllowList(FAMILIES.mappingItems, gaps);
    const unexpected = new Set(verdict.unexpected);

    reportParityCases(
        FAMILIES.mappingItems,
        import.meta.filename,
        cases.map(({ javaId, bedrockId, gaps: caseGaps }) => ({
            id: javaId,
            title: javaId,
            context: bedrockId === undefined ? 'Java item type · no Bedrock item' : `Java item type → ${bedrockId}`,
            status: caseGaps.some((gap) => unexpected.has(gap)) ? 'failed' : 'passed',
            ...(caseGaps.length === 0 ? {} : { details: caseGaps.join(', ') })
        }))
    );

    it('maps every Java item onto an item the Bedrock capture advertises', () => {
        expect(verdict.unexpected).toEqual([]);
    });

    it('carries no stale allow-list entry', () => {
        expect(verdict.stale).toEqual([]);
    });

    it('reports Java item coverage and agrees with the independently generated component table', () => {
        // Two generators read Java's item registry: this mapping table and the component table
        // of `@jsprismarine/items`. They agree on the registry size or one of them lost items.
        reportParityProgress(FAMILIES.mappingItems, { javaItems: items });
        expect(items).toBe(itemTypesTable.javaItemCount);
    });
});
