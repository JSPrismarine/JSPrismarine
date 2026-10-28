import { itemTypesTable } from '@jsprismarine/items/tables';
import { loadItemTypes } from '@jsprismarine/items';
import { ITEM_LOSSES, javaItemToBedrock } from '@jsprismarine/mapping';
import { itemsTable } from '@jsprismarine/mapping/tables';
import { expect, it } from 'vitest';

import { checkAllowList } from './allowlist.ts';
import { FAMILIES } from './families.ts';
import { loadRequiredItemList } from './goldens.ts';
import { describeFamily } from './measure.ts';
import { reportParityProgress } from './progress.ts';
import { REFERENCES } from './references.ts';

/**
 * Phase 1's item half: the Java default components for every item, carried on Bedrock
 * identities, resolving into item types the server can hand out.
 *
 * The comparison runs in the Java direction. Bedrock's item list is larger than Java's because
 * it holds the double slabs, wall signs and Education items that are block states or nothing
 * at all in Java, so a Bedrock item with no Java row is expected rather than a gap. What is a
 * gap is a Java item with no row, a row whose Bedrock identity no server advertises, a
 * component name outside Java's own registry, and a row the component runtime cannot resolve.
 *
 * Gap ids: `unmapped-java-item:<java id>`, `unadvertised:<bedrock id>`,
 * `unknown-component:<component>`, `loss:<java id>` for a reviewed mapping loss that keeps no
 * components, `mapping-disagrees:<java id>` where the item table and the mapping table
 * disagree on an item's Bedrock identity, and `resolve:<code>@<file>` for a row the component
 * runtime reports a diagnostic for, named by its code and file.
 */
const compareItemComponents = (): { gaps: string[]; rows: number; detail: string[] } => {
    const advertised = loadRequiredItemList();
    const componentTypes = new Set(itemTypesTable.componentTypes);
    const gaps = new Set<string>();
    const detail: string[] = [];

    const javaWithRow = new Set<string>();
    for (const [bedrockId, row] of Object.entries(itemTypesTable.items)) {
        javaWithRow.add(row.java);
        for (const merged of row.merged ?? []) javaWithRow.add(merged.java);

        if (!(bedrockId in advertised)) gaps.add(`unadvertised:${bedrockId}`);
        for (const component of Object.keys(row.components)) {
            if (!componentTypes.has(component)) gaps.add(`unknown-component:${component}`);
        }

        const mapped = javaItemToBedrock(row.java);
        if (mapped.kind !== 'unknown' && mapped.bedrock.identifier !== bedrockId) {
            gaps.add(`mapping-disagrees:${row.java}`);
            if (detail.length < 20) {
                detail.push(`${row.java}: item table says ${bedrockId}, mapping says ${mapped.bedrock.identifier}`);
            }
        }
    }

    // Java's whole item registry, from the mapping package's independently generated table. An
    // item whose identity does not survive the mapping has no components to carry, so it
    // reports as the reviewed loss it is rather than as a missing row.
    const reviewedLosses = new Set<string>(ITEM_LOSSES.map((loss) => loss.javaId));
    for (const javaId of Object.keys(itemsTable.items)) {
        if (javaWithRow.has(javaId)) continue;
        gaps.add(reviewedLosses.has(javaId) ? `loss:${javaId}` : `unmapped-java-item:${javaId}`);
    }

    const { diagnostics } = loadItemTypes();
    for (const diagnostic of diagnostics) {
        gaps.add(`resolve:${diagnostic.code}@${diagnostic.path ?? diagnostic.pack}`);
        if (detail.length < 20) detail.push(`${diagnostic.path ?? diagnostic.pack}: ${diagnostic.message}`);
    }

    return { gaps: [...gaps], rows: Object.keys(itemTypesTable.items).length, detail };
};

describeFamily(FAMILIES.itemsComponents, [REFERENCES.bedrockItemCapture], () => {
    const { gaps, rows, detail } = compareItemComponents();
    const verdict = checkAllowList(FAMILIES.itemsComponents, gaps);

    it('carries Java components on identities the Bedrock capture advertises', () => {
        expect(verdict.unexpected, detail.join('\n')).toEqual([]);
    });

    it('carries no stale allow-list entry', () => {
        expect(verdict.stale).toEqual([]);
    });

    it("accounts for every item in Java 26.3's registry", () => {
        // Every Java item either has a Bedrock identity of its own or is merged onto another
        // item's, and the two cases add up to Java's registry with nothing left over.
        expect(rows + itemTypesTable.exceptedJavaItems.length).toBe(itemTypesTable.javaItemCount);
    });

    it("reports Java's current data component type coverage", () => {
        reportParityProgress(FAMILIES.itemsComponents, {
            comparedItems: rows,
            javaComponentTypes: itemTypesTable.componentTypes.length
        });
        expect(rows).toBeGreaterThan(0);
        expect(itemTypesTable.componentTypes.length).toBeGreaterThan(0);
        for (const component of Object.keys(itemTypesTable.defaultCounts)) {
            expect(itemTypesTable.componentTypes).toContain(component);
        }
    });
});
