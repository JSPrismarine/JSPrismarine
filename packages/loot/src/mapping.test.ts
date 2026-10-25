import { ITEM_LOSSES, javaItemToBedrock } from '@jsprismarine/mapping';
import type { ItemStack } from '@jsprismarine/predicates';
import { describe, expect, it } from 'vitest';

import { createLootContext } from './content';
import { mapLootToBedrock } from './mapping';
import { parseLootTable, rollLootTable } from './table';

/**
 * These run against the real `@jsprismarine/mapping` tables, which this
 * package keeps as a development dependency and a host injects at runtime.
 * Using the real lookup is also the check that it satisfies the seam.
 */
const stackOf = (id: string, count = 1, components: ReadonlyMap<string, unknown> = new Map()): ItemStack => ({
    id,
    count,
    components
});

describe('translating a rolled result', () => {
    it('maps a plain item and keeps its count and components', () => {
        const components = new Map<string, unknown>([['minecraft:custom_name', 'Shiny']]);

        const { stacks, losses } = mapLootToBedrock([stackOf('minecraft:diamond', 17, components)], javaItemToBedrock);

        expect(losses).toEqual([]);
        expect(stacks).toEqual([
            { identifier: 'minecraft:diamond', count: 17, components, javaId: 'minecraft:diamond' }
        ]);
    });

    it('keeps the reviewed fallback for a lossy item and reports the loss', () => {
        const loss = ITEM_LOSSES[0]!;

        const mapped = mapLootToBedrock([stackOf(loss.javaId)], javaItemToBedrock);

        expect(mapped.stacks.map((stack) => stack.identifier)).toEqual([loss.bedrockFallback]);
        expect(mapped.losses).toEqual([
            {
                javaId: loss.javaId,
                kind: 'fallback',
                bedrockIdentifier: loss.bedrockFallback,
                reason: loss.reason,
                reference: loss.reference
            }
        ]);
    });

    it('drops an identifier the pinned Java version does not have, and says so', () => {
        const mapped = mapLootToBedrock(
            [stackOf('minecraft:nothing_here'), stackOf('minecraft:stone')],
            javaItemToBedrock
        );

        expect(mapped.stacks.map((stack) => stack.identifier)).toEqual(['minecraft:stone']);
        expect(mapped.losses).toEqual([
            {
                javaId: 'minecraft:nothing_here',
                kind: 'unknown',
                reason: 'minecraft:nothing_here is not an item of the pinned Java version'
            }
        ]);
    });

    it('passes a non-minecraft identifier through untouched', () => {
        const mapped = mapLootToBedrock([stackOf('example:ruby')], javaItemToBedrock);

        expect(mapped.losses).toEqual([]);
        expect(mapped.stacks.map((stack) => stack.identifier)).toEqual(['example:ruby']);
    });

    it('reports one loss per stack, in the order the roll produced them', () => {
        const loss = ITEM_LOSSES[0]!;

        const mapped = mapLootToBedrock(
            [stackOf(loss.javaId), stackOf('minecraft:stone'), stackOf(loss.javaId)],
            javaItemToBedrock
        );

        expect(mapped.losses.map((entry) => entry.javaId)).toEqual([loss.javaId, loss.javaId]);
        expect(mapped.stacks).toHaveLength(3);
    });

    it('translates what a table rolled', () => {
        const parsed = parseLootTable({
            type: 'minecraft:chest',
            pools: [{ rolls: 1, entries: [{ type: 'minecraft:item', name: 'minecraft:golden_apple' }] }]
        });
        const context = createLootContext({ parameterSet: 'chest', parameters: { origin: { x: 0, y: 0, z: 0 } } });

        const mapped = mapLootToBedrock(rollLootTable(parsed.value, context), javaItemToBedrock);

        expect(mapped.stacks.map((stack) => stack.identifier)).toEqual(['minecraft:golden_apple']);
    });
});
