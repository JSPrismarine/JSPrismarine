import { itemTypesTable } from '@jsprismarine/items';
import { describe, expect, it } from 'vitest';

import type { ItemClassification } from './families';
import { classifyItem, classifyVanillaItems, DATA_ONLY, ITEM_FAMILIES, vanillaJavaItems } from './families';

/**
 * The partition, family by family.
 *
 * Every number is measured rather than chosen, and the README's table is this
 * list. A change to a rule that moves one item shows up here as two numbers,
 * which is the point: the classification is reviewable.
 */
const EXPECTED_COUNTS: readonly [ItemClassification, number][] = [
    ['bow', 1],
    ['crossbow', 1],
    ['ammunition', 3],
    ['trident', 1],
    ['mace', 1],
    ['fishing rod', 1],
    ['mob steering rod', 2],
    ['shears', 1],
    ['fire starter', 2],
    ['bone meal', 1],
    ['spyglass', 1],
    ['compass', 2],
    ['clock', 1],
    ['map', 18],
    ['lead', 1],
    ['name tag', 1],
    ['brush', 1],
    ['eye of ender', 1],
    ['bucket', 4],
    ['throwable', 9],
    ['bottle and bowl', 2],
    ['waxing', 1],
    ['sign ink', 2],
    ['written book', 2],
    ['entity placement', 47],
    ['mob bucket', 7],
    ['shield', 1],
    ['elytra', 1],
    ['totem', 1],
    ['spear', 7],
    ['firework rocket', 1],
    ['goat horn', 1],
    ['writable book', 1],
    ['enchanted book', 1],
    ['banner', 16],
    ['dye', 16],
    ['bundle', 17],
    ['spawn egg', 88],
    ['potion', 1],
    ['suspicious stew', 1],
    ['ominous bottle', 1],
    ['block transforming tool', 21],
    ['mining tool', 7],
    ['melee weapon', 7],
    ['equippable', 82],
    ['food', 39],
    ['consumable', 1],
    [DATA_ONLY, 1233]
];

const report = classifyVanillaItems();

describe('the family catalog', () => {
    it('names every family once', () => {
        const names = ITEM_FAMILIES.map((family) => family.name);
        expect(new Set(names).size).toBe(names.length);
    });

    it('gives every family a summary that reads as a sentence', () => {
        for (const family of ITEM_FAMILIES) {
            expect(family.summary.endsWith('.'), family.name).toBe(true);
            expect(family.summary[0], family.name).toBe(family.summary[0]?.toUpperCase());
        }
    });
});

describe('classifyVanillaItems', () => {
    it('classifies all 1658 Java items of the pinned registry', () => {
        expect(report.total).toBe(itemTypesTable.javaItemCount);
        expect(report.total).toBe(1658);
    });

    it('is a partition: the counts sum to the total and nothing is in two families', () => {
        const sum = report.counts.reduce((total, row) => total + row.count, 0);
        expect(sum).toBe(report.total);

        const seen = new Set<string>();
        for (const identifiers of report.members.values()) {
            for (const identifier of identifiers) {
                expect(seen.has(identifier), identifier).toBe(false);
                seen.add(identifier);
            }
        }
        expect(seen.size).toBe(report.total);
    });

    it('covers every identifier the item table knows, merged and excepted ones included', () => {
        const classified = new Set([...report.members.values()].flat());
        for (const row of Object.values(itemTypesTable.items)) {
            expect(classified.has(row.java), row.java).toBe(true);
            for (const merged of row.merged ?? []) expect(classified.has(merged.java), merged.java).toBe(true);
        }
        for (const excepted of itemTypesTable.exceptedJavaItems) {
            expect(classified.has(excepted), excepted).toBe(true);
        }
    });

    it('holds the measured count for every family', () => {
        expect(report.counts.map((row) => [row.family, row.count])).toEqual(
            EXPECTED_COUNTS.map(([family, count]) => [family, count])
        );
    });

    it('names a family for every behavior family the catalog declares', () => {
        expect(report.counts.map((row) => row.family)).toEqual([...ITEM_FAMILIES.map((f) => f.name), DATA_ONLY]);
    });
});

describe('classifyItem', () => {
    const items = new Map(vanillaJavaItems().map((item) => [item.identifier, item]));
    const familyOf = (identifier: string): ItemClassification => classifyItem(items.get(identifier)!);

    it('splits the tools by what their rules say rather than by name', () => {
        expect(familyOf('minecraft:diamond_pickaxe')).toBe('mining tool');
        expect(familyOf('minecraft:diamond_axe')).toBe('block transforming tool');
        expect(familyOf('minecraft:diamond_shovel')).toBe('block transforming tool');
        expect(familyOf('minecraft:diamond_hoe')).toBe('block transforming tool');
        expect(familyOf('minecraft:diamond_sword')).toBe('melee weapon');
        expect(familyOf('minecraft:shears')).toBe('shears');
    });

    it('puts the three mace-like weapons in their own families', () => {
        expect(familyOf('minecraft:mace')).toBe('mace');
        expect(familyOf('minecraft:trident')).toBe('trident');
        expect(familyOf('minecraft:copper_spear')).toBe('spear');
    });

    it('classifies the merged items by identifier, since they carry no components', () => {
        expect(items.get('minecraft:white_banner')?.components).toEqual({});
        expect(familyOf('minecraft:white_banner')).toBe('banner');
        expect(familyOf('minecraft:buried_treasure_map')).toBe('map');
        expect(familyOf('minecraft:tipped_arrow')).toBe('ammunition');
        expect(familyOf('minecraft:knowledge_book')).toBe('written book');
        expect(familyOf('minecraft:spectral_arrow')).toBe('ammunition');
    });

    it('reads the data where the data says what the item is', () => {
        expect(familyOf('minecraft:apple')).toBe('food');
        expect(familyOf('minecraft:milk_bucket')).toBe('consumable');
        expect(familyOf('minecraft:suspicious_stew')).toBe('suspicious stew');
        expect(familyOf('minecraft:potion')).toBe('potion');
        expect(familyOf('minecraft:elytra')).toBe('elytra');
        expect(familyOf('minecraft:shield')).toBe('shield');
        expect(familyOf('minecraft:totem_of_undying')).toBe('totem');
        expect(familyOf('minecraft:diamond_chestplate')).toBe('equippable');
        expect(familyOf('minecraft:saddle')).toBe('equippable');
        expect(familyOf('minecraft:cod_bucket')).toBe('mob bucket');
        expect(familyOf('minecraft:zombie_spawn_egg')).toBe('spawn egg');
    });

    it('leaves block items and plain materials as data only', () => {
        expect(familyOf('minecraft:stone')).toBe(DATA_ONLY);
        expect(familyOf('minecraft:oak_planks')).toBe(DATA_ONLY);
        expect(familyOf('minecraft:iron_ingot')).toBe(DATA_ONLY);
        expect(familyOf('minecraft:white_bed')).toBe(DATA_ONLY);
        expect(familyOf('minecraft:debug_stick')).toBe(DATA_ONLY);
    });

    it('answers for an item no vanilla table has', () => {
        expect(classifyItem({ identifier: 'example:widget', components: {} })).toBe(DATA_ONLY);
        expect(classifyItem({ identifier: 'example:ration', components: { 'minecraft:food': {} } })).toBe('food');
    });
});
