import { blocksTable, entitiesTable, itemsTable } from '@jsprismarine/mapping/tables';
import { BLOCK_LOSSES, ENTITY_LOSSES, ITEM_LOSSES } from '@jsprismarine/mapping/lossList';
import { expect, it } from 'vitest';

import type { Family } from './families.ts';
import { FAMILIES } from './families.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';
import { reportParityCases } from './trackerCases.ts';
import type { TrackerRuntimeSupport } from './trackerCases.ts';

const reportUnmeasuredBehaviorRows = (
    family: Family,
    identifiers: readonly string[],
    context: string | ((identifier: string) => string),
    runtimeSupport?: TrackerRuntimeSupport
): void => {
    reportParityCases(
        family,
        import.meta.filename,
        identifiers.map((identifier) => ({
            id: `runtime-behavior:${identifier}`,
            title: identifier,
            context: typeof context === 'string' ? context : context(identifier),
            status: 'not measured' as const,
            ...(runtimeSupport === undefined ? {} : { runtimeSupport })
        }))
    );
};

describeFamily(FAMILIES.blocksBehavior, [REFERENCES.javaBlockRegistry], () => {
    it('lists each Java block with runtime behavior not yet covered by a complete parity matrix', () => {
        const identifiers = [
            ...new Set([...Object.keys(blocksTable.blocks), ...BLOCK_LOSSES.map(({ javaId }) => javaId)])
        ].toSorted((left, right) => left.localeCompare(right, 'en'));
        reportUnmeasuredBehaviorRows(
            FAMILIES.blocksBehavior,
            identifiers,
            'Complete Java placement, update, ticking, interaction, and block-entity behavior parity is not measured for this block.'
        );

        expect(identifiers).toContain('minecraft:stone');
    });
});

describeFamily(FAMILIES.itemsBehavior, [REFERENCES.javaItemRegistry], () => {
    it('lists each Java item with runtime behavior not yet covered by a complete parity matrix', () => {
        const identifiers = [
            ...new Set([...Object.keys(itemsTable.items), ...ITEM_LOSSES.map(({ javaId }) => javaId)])
        ].toSorted((left, right) => left.localeCompare(right, 'en'));
        reportUnmeasuredBehaviorRows(
            FAMILIES.itemsBehavior,
            identifiers,
            'Complete Java use, durability, combat, and inventory behavior parity is not measured for this item.'
        );

        expect(identifiers).toContain('minecraft:diamond_pickaxe');
    });
});

describeFamily(FAMILIES.entitiesBehavior, [REFERENCES.javaEntityRegistry], () => {
    it('lists each Java entity with runtime behavior not yet covered by a complete parity matrix', () => {
        const identifiers = [
            ...new Set([...Object.keys(entitiesTable.entities), ...ENTITY_LOSSES.map(({ javaId }) => javaId)])
        ].sort((left, right) => left.localeCompare(right, 'en'));
        reportUnmeasuredBehaviorRows(
            FAMILIES.entitiesBehavior,
            identifiers,
            (identifier) =>
                identifier === 'minecraft:villager'
                    ? 'Villager profession and job-site behavior, trade restocking, player gossip, farming, and village or raid lifecycle are not fully compared with Java.'
                    : 'Complete Java entity-specific behavior, AI, movement, combat, and lifecycle parity is not measured for this entity.',
            {
                status: 'not checked',
                details: 'Runtime source data was not checked in this behavior inventory.'
            }
        );

        expect(identifiers).toContain('minecraft:blaze');
        expect(identifiers).toContain('minecraft:ender_dragon');
        expect(identifiers).toContain('minecraft:villager');
    });
});
