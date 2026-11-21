import { creative_groups, creativeitems, item_table as ItemTable } from '@jsprismarine/bedrock-data';
import { describe, expect, it } from 'vitest';

import {
    CreativeItemCategory,
    buildCreativeContent,
    creativeCategoryOf,
    creativeItemProperties,
    itemIdsOf
} from './creativeContent';

import type { CreativeCatalog, ItemIdLookup } from './creativeContent';

const vanilla: CreativeCatalog = { groups: creative_groups, entries: creativeitems };
const vanillaIds: ItemIdLookup = (identifier) => ItemTable[identifier]?.runtime_id;

const catalog: CreativeCatalog = {
    groups: [
        { name: 'itemGroup.name.planks', category: 'construction', icon: 'minecraft:oak_planks' },
        { name: '', category: 'none', icon: 'minecraft:command_block' }
    ],
    entries: [
        { name: 'minecraft:oak_planks', group: 0 },
        { name: 'minecraft:stick', group: 1, meta: 3 },
        { name: 'test:nothing', group: 0 }
    ]
};
const ids: ItemIdLookup = (identifier) =>
    ({ 'minecraft:oak_planks': 5, 'minecraft:stick': 320, 'minecraft:command_block': 137 })[identifier];

describe('creativeCategoryOf', () => {
    it('numbers the four tabs the catalog names', () => {
        expect(creativeCategoryOf('construction')).toBe(CreativeItemCategory.CONSTRUCTION);
        expect(creativeCategoryOf('nature')).toBe(CreativeItemCategory.NATURE);
        expect(creativeCategoryOf('equipment')).toBe(CreativeItemCategory.EQUIPMENT);
        expect(creativeCategoryOf('items')).toBe(CreativeItemCategory.ITEMS);
    });

    it('reads the catalog’s none as the wire’s command-only category', () => {
        expect(creativeCategoryOf('none')).toBe(CreativeItemCategory.ITEM_COMMAND_ONLY);
    });

    it('files an unrecognized name under items rather than refusing it', () => {
        expect(creativeCategoryOf('made up')).toBe(CreativeItemCategory.ITEMS);
    });
});

describe('buildCreativeContent', () => {
    it('keeps the headings in catalog order, because an entry indexes them', () => {
        const { groups } = buildCreativeContent(ids, catalog);

        expect(groups).toHaveLength(2);
        expect(groups[0]).toMatchObject({
            category: CreativeItemCategory.CONSTRUCTION,
            name: 'itemGroup.name.planks'
        });
        expect(groups[0]!.icon).toMatchObject({ name: 'minecraft:oak_planks', runtimeId: 5, count: 1 });
    });

    it('numbers the entries from one, which is what a creative pick comes back as', () => {
        const { entries } = buildCreativeContent(ids, catalog);

        expect(entries.map((entry) => entry.creativeNetId)).toEqual([1, 2]);
    });

    it('carries the group index, the meta and the id of each entry', () => {
        const { entries } = buildCreativeContent(ids, catalog);

        expect(entries[1]).toMatchObject({
            group: 1,
            item: { name: 'minecraft:stick', runtimeId: 320, meta: 3, blockRuntimeId: 0 }
        });
    });

    it('drops an entry the item registry cannot resolve, and names it', () => {
        const { entries, unknown } = buildCreativeContent(ids, catalog);

        expect(unknown).toEqual(['test:nothing']);
        expect(entries.map((entry) => entry.item.name)).toEqual(['minecraft:oak_planks', 'minecraft:stick']);
    });

    it('keeps an unresolvable entry when told to, without renumbering the rest', () => {
        const { entries, unknown } = buildCreativeContent(ids, catalog, { keepUnknown: true });

        expect(unknown).toEqual(['test:nothing']);
        expect(entries.map((entry) => entry.creativeNetId)).toEqual([1, 2, 3]);
    });

    it('reads the hashed block runtime id out of a catalog block state', () => {
        const { entries } = buildCreativeContent(vanillaIds, vanilla);
        const planks = entries.find((entry) => entry.item.name === 'minecraft:oak_planks');

        // The capture's `block_states` for oak planks carries a `network_id`,
        // which is the FNV-1a hash the client computes for the same state.
        expect(planks?.item.blockRuntimeId).not.toBe(0);
    });

    it('builds the whole vanilla menu with every entry pointing at a real group', () => {
        const { groups, entries, unknown } = buildCreativeContent(vanillaIds, vanilla);

        expect(groups).toHaveLength(creative_groups.length);
        expect(entries.length).toBeGreaterThan(1900);
        expect(unknown).toEqual([]);
        for (const entry of entries) expect(groups[entry.group]).toBeDefined();
    });
});

describe('itemIdsOf', () => {
    it('answers from what the item registry builder produced', () => {
        const lookup = itemIdsOf([{ name: 'minecraft:apple', runtimeId: 882 }]);

        expect(lookup('minecraft:apple')).toBe(882);
        expect(lookup('minecraft:stick')).toBeUndefined();
    });
});

describe('creativeItemProperties', () => {
    it('gives an item the category and the group of the heading it sits under', () => {
        const properties = creativeItemProperties(catalog);

        expect(properties('minecraft:oak_planks')).toEqual({
            creative_category: CreativeItemCategory.CONSTRUCTION,
            creative_group: 'itemGroup.name.planks'
        });
    });

    it('leaves an item in no group to the registry’s defaults', () => {
        expect(creativeItemProperties(catalog)('minecraft:dirt')).toEqual({});
    });

    it('takes the first group an item appears in, so the answer does not depend on a scan order', () => {
        const twice: CreativeCatalog = {
            groups: catalog.groups,
            entries: [
                { name: 'minecraft:stick', group: 0 },
                { name: 'minecraft:stick', group: 1 }
            ]
        };

        expect(creativeItemProperties(twice)('minecraft:stick')).toMatchObject({
            creative_category: CreativeItemCategory.CONSTRUCTION
        });
    });
});
