import { creative_groups, creativeitems } from '@jsprismarine/bedrock-data';
import { describe, expect, it } from 'vitest';

import { definitionOf } from '../../content/ContentOptions';
import { buildServerContent } from '../../content/ServerContent';
import { fixtureContentOptions } from '../../content/testing';
import { mergeItemCatalogs } from './itemCatalog';

import type { CreativeCatalog } from '@jsprismarine/protocol/bedrock/payload';

const vanilla: CreativeCatalog = { groups: creative_groups, entries: creativeitems };
const content = buildServerContent(fixtureContentOptions());

/** One `item_catalog/crafting_item_catalog.json`, in the issue's shape. */
const catalogFile = (categories: unknown[]) =>
    definitionOf('itemCatalog', 'crafting_item_catalog', {
        format_version: '1.21.60',
        'minecraft:crafting_items_catalog': { categories }
    });

/** The entries filed under the heading of a name, by item name. */
const itemsUnder = (catalog: CreativeCatalog, name: string): string[] => {
    const group = catalog.groups.findIndex((candidate) => candidate.name === name);
    return catalog.entries.filter((entry) => entry.group === group).map((entry) => entry.name);
};

describe('mergeItemCatalogs', () => {
    it('keeps the vanilla menu entry for entry when a pack adds nothing', () => {
        const merged = mergeItemCatalogs(vanilla, [catalogFile([])], content);

        expect(merged.groups).toEqual(vanilla.groups);
        expect(merged.entries).toEqual(vanilla.entries);
    });

    it('adds a new heading after the tab it names, with its items', () => {
        const merged = mergeItemCatalogs(
            vanilla,
            [
                catalogFile([
                    {
                        category_name: 'construction',
                        groups: [
                            {
                                group_identifier: { icon: 'minecraft:stone', name: 'test:itemGroup.name.example' },
                                items: ['minecraft:stone', 'minecraft:dirt']
                            }
                        ]
                    }
                ])
            ],
            content
        );

        const heading = merged.groups.findIndex((group) => group.name === 'test:itemGroup.name.example');
        expect(merged.groups[heading]).toMatchObject({ category: 'construction', icon: 'minecraft:stone' });
        expect(merged.groups[heading - 1]?.category).toBe('construction');
        expect(merged.groups[heading + 1]?.category).not.toBe('construction');
        expect(itemsUnder(merged, 'test:itemGroup.name.example')).toEqual(['minecraft:stone', 'minecraft:dirt']);
        // A block entry places the block, as the captured ones do.
        const stone = merged.entries.find((entry) => entry.group === heading && entry.name === 'minecraft:stone');
        expect(stone?.block_states).toBeDefined();
        expect(merged.entries).toHaveLength(vanilla.entries.length + 2);
    });

    it('merges into a vanilla heading of the same name, after its own items', () => {
        const planks = 'itemGroup.name.planks';
        const before = itemsUnder(vanilla, planks);
        expect(before.length).toBeGreaterThan(0);

        const merged = mergeItemCatalogs(
            vanilla,
            [
                catalogFile([
                    {
                        category_name: 'construction',
                        groups: [
                            { group_identifier: { icon: 'minecraft:oak_planks', name: planks }, items: ['test:planks'] }
                        ]
                    }
                ])
            ],
            content
        );

        expect(itemsUnder(merged, planks)).toEqual([...before, 'test:planks']);
        expect(merged.groups).toHaveLength(vanilla.groups.length);
    });

    it('files loose items as a heading-less group, reads an aux suffix, and skips a tab that does not exist', () => {
        const merged = mergeItemCatalogs(
            vanilla,
            [
                catalogFile([
                    { category_name: 'items', groups: [{ items: [{ name: 'minecraft:coal:1' }, 'test:gadget'] }] },
                    { category_name: 'secret', groups: [{ items: ['test:hidden'] }] }
                ])
            ],
            content
        );

        const added = merged.entries.slice(-2);
        expect(added.map(({ name, meta }) => ({ name, meta }))).toEqual([
            { name: 'minecraft:coal', meta: 1 },
            { name: 'test:gadget', meta: undefined }
        ]);
        expect(merged.groups[added[0]!.group]).toMatchObject({ name: '', category: 'items' });
        expect(merged.entries.some((entry) => entry.name === 'test:hidden')).toBe(false);
    });
});
