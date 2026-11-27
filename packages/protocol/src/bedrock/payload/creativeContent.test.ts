import { creative_groups, creativeitems, item_table as ItemTable } from '@jsprismarine/bedrock-data';
import { describe, expect, it } from 'vitest';

import {
    CreativeItemCategory,
    buildCreativeContent,
    creativeCategoryOf,
    creativeItemProperties,
    itemIdsOf,
    withPackMenuPlacements
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

describe('withPackMenuPlacements', () => {
    /** Two tabs: construction ending in a nameless heading, items ending in a named one. */
    const tabs: CreativeCatalog = {
        groups: [
            { name: 'itemGroup.name.stairs', category: 'construction', icon: 'minecraft:stone_stairs' },
            { name: '', category: 'construction', icon: 'minecraft:air' },
            { name: 'itemGroup.name.sword', category: 'items', icon: 'minecraft:wooden_sword' }
        ],
        entries: [
            { name: 'minecraft:stone_stairs', group: 0 },
            { name: 'minecraft:stone', group: 1 },
            { name: 'minecraft:wooden_sword', group: 2 }
        ]
    };
    const filed = (placements: Parameters<typeof withPackMenuPlacements>[1]) =>
        withPackMenuPlacements(tabs, placements).catalog;

    it('files a minecraft group under the vanilla heading of that key', () => {
        const { groups, entries } = filed([
            { name: 'test:stairs', category: 'construction', group: 'minecraft:itemGroup.name.stairs' }
        ]);

        expect(groups).toHaveLength(tabs.groups.length);
        expect(entries.at(-1)).toEqual({ name: 'test:stairs', group: 0 });
    });

    it('opens one heading per pack group, named as the file writes it, with an empty icon', () => {
        const { groups, entries } = filed([
            { name: 'test:gem_a', category: 'items', group: 'test:itemGroup.name.gems' },
            { name: 'test:gem_b', category: 'items', group: 'test:itemGroup.name.gems' }
        ]);

        expect(groups.slice(tabs.groups.length)).toEqual([
            { name: 'test:itemGroup.name.gems', category: 'items', icon: 'minecraft:air' }
        ]);
        expect(entries.slice(tabs.entries.length).map((entry) => entry.group)).toEqual([3, 3]);
    });

    it('opens the headings tab by tab, whatever order the placements come in', () => {
        const { groups } = filed([
            { name: 'test:gem', category: 'items', group: 'test:itemGroup.name.gems' },
            { name: 'test:sapling', category: 'nature', group: 'test:itemGroup.name.saplings' },
            { name: 'test:gadget', category: 'items' }
        ]);

        expect(groups.slice(tabs.groups.length)).toEqual([
            { name: 'test:itemGroup.name.saplings', category: 'nature', icon: 'minecraft:air' },
            { name: 'test:itemGroup.name.gems', category: 'items', icon: 'minecraft:air' },
            { name: '', category: 'items', icon: 'minecraft:air' }
        ]);
    });

    it('puts an ungrouped entry in the last heading of its tab when that heading has no name', () => {
        const { groups, entries } = filed([{ name: 'test:block', category: 'construction', blockRuntimeId: 42 }]);

        expect(groups).toHaveLength(tabs.groups.length);
        expect(entries.at(-1)).toEqual({ name: 'test:block', group: 1, block_runtime_id: 42 });
    });

    it('opens a nameless heading for an ungrouped entry when its tab ends in a named one', () => {
        const { groups, entries } = filed([
            { name: 'test:loose', category: 'items' },
            { name: 'test:gem', category: 'items', group: 'test:itemGroup.name.gems' }
        ]);

        // The grouped entry is filed first, so the tab ends in the pack's own named heading.
        expect(groups.slice(tabs.groups.length).map((group) => group.name)).toEqual(['test:itemGroup.name.gems', '']);
        expect(entries.slice(tabs.entries.length)).toEqual([
            { name: 'test:gem', group: 3 },
            { name: 'test:loose', group: 4 }
        ]);
    });

    it('keeps a none or missing category out of the menu but tells the registry 6', () => {
        const menu = withPackMenuPlacements(tabs, [
            { name: 'test:hidden', category: 'none' },
            { name: 'test:unlisted', category: undefined }
        ]);

        expect(menu.catalog.entries).toEqual(tabs.entries);
        expect(menu.itemProperties('test:hidden')).toEqual({
            creative_category: CreativeItemCategory.UNDEFINED,
            creative_group: ''
        });
        expect(menu.itemProperties('test:unlisted')).toMatchObject({
            creative_category: CreativeItemCategory.UNDEFINED
        });
    });

    it('gives a pack item the category it declares and the group key as written', () => {
        const menu = withPackMenuPlacements(tabs, [
            { name: 'test:sword', category: 'items', group: 'minecraft:itemGroup.name.sword' }
        ]);

        expect(menu.itemProperties('test:sword')).toEqual({
            creative_category: CreativeItemCategory.ITEMS,
            creative_group: 'minecraft:itemGroup.name.sword'
        });
        expect(menu.itemProperties('minecraft:stone_stairs')).toEqual({
            creative_category: CreativeItemCategory.CONSTRUCTION,
            creative_group: 'itemGroup.name.stairs'
        });
    });

    it('skips an identifier the catalog already lists', () => {
        expect(filed([{ name: 'minecraft:stone', category: 'items' }]).entries).toEqual(tabs.entries);
    });

    it("gives a listed item the catalog's tab and its own group key", () => {
        const menu = withPackMenuPlacements(tabs, [{ name: 'minecraft:wooden_sword', category: undefined }]);

        expect(menu.catalog.entries).toEqual(tabs.entries);
        expect(menu.itemProperties('minecraft:wooden_sword')).toEqual({
            creative_category: CreativeItemCategory.ITEMS,
            creative_group: ''
        });
    });

    it('carries a placement block id through to the built entry', () => {
        const menu = withPackMenuPlacements(tabs, [
            { name: 'test:block', category: 'construction', blockRuntimeId: 42 }
        ]);
        const { entries } = buildCreativeContent(
            (name) => (name === 'test:block' ? 9000 : (ids(name) ?? 1)),
            menu.catalog
        );

        expect(entries.at(-1)?.item).toMatchObject({ name: 'test:block', runtimeId: 9000, blockRuntimeId: 42 });
    });
});
