import { itemTypesTable } from '@jsprismarine/items/tables';
import { javaItemToBedrock } from '@jsprismarine/mapping';
import { itemsTable } from '@jsprismarine/mapping/tables';
import { expect, it } from 'vitest';

import { checkAllowList } from './allowlist.ts';
import { FAMILIES } from './families.ts';
import { loadRequiredItemList } from './goldens.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';

/**
 * Chunker's totality property for the item domain. Every Java item resolves to a Bedrock item,
 * and the Bedrock item is one the `ItemRegistryPacket` capture actually advertises, so a
 * mapping onto an identifier no server sends fails here rather than at a player's inventory.
 *
 * Gap ids: `unknown:<java id>` for an item that does not map, `loss:<java id>` for a reviewed
 * loss, `merge:<bedrock id>` for a Bedrock item more than one Java item reaches, and
 * `unadvertised:<bedrock id>` for an output the item capture does not list.
 */
const compareItemMapping = (): { gaps: string[]; items: number } => {
    const advertised = loadRequiredItemList();
    const gaps = new Set<string>();
    const javaByBedrock = new Map<string, Set<string>>();
    const javaIds = Object.keys(itemsTable.items);

    for (const javaId of javaIds) {
        const result = javaItemToBedrock(javaId);
        if (result.kind === 'unknown') {
            gaps.add(`unknown:${javaId}`);
            continue;
        }
        if (result.kind === 'loss') gaps.add(`loss:${javaId}`);

        const bedrockId = result.bedrock.identifier;
        if (!(bedrockId in advertised)) gaps.add(`unadvertised:${bedrockId}`);

        const sources = javaByBedrock.get(bedrockId);
        if (sources) sources.add(javaId);
        else javaByBedrock.set(bedrockId, new Set([javaId]));
    }

    for (const [bedrockId, sources] of javaByBedrock) {
        if (sources.size > 1) gaps.add(`merge:${bedrockId}`);
    }

    return { gaps: [...gaps], items: javaIds.length };
};

describeFamily(FAMILIES.mappingItems, [REFERENCES.bedrockItemCapture], () => {
    const { gaps, items } = compareItemMapping();
    const verdict = checkAllowList(FAMILIES.mappingItems, gaps);

    it('maps every Java item onto an item the Bedrock capture advertises', () => {
        expect(verdict.unexpected).toEqual([]);
    });

    it('carries no stale allow-list entry', () => {
        expect(verdict.stale).toEqual([]);
    });

    it('covers as many Java items as the independently generated item type table counts', () => {
        // Two generators read Java's item registry: this mapping table and the component table
        // of `@jsprismarine/items`. They agree on the registry size or one of them lost items.
        expect(items).toBe(itemTypesTable.javaItemCount);
    });
});
