import { describe, expect, it } from 'vitest';

import { levelCatalog } from './levelCatalog';

const catalog = levelCatalog({
    blockTypes: () => ['minecraft:stone', 'jsp:custom_block'],
    itemTypes: () => ['minecraft:apple', 'jsp:custom_item']
});

describe('levelCatalog', () => {
    it("joins a vanilla block's permutation answers with what a placed block of it answers", () => {
        const stone = catalog.blockType('minecraft:stone');
        expect(stone?.localizationKey).toBe('tile.stone.stone.name');
        expect(stone?.solid).toBe(true);
        expect(stone?.components).toContain('minecraft:movable');
        expect(catalog.blockType('minecraft:oak_fence')?.solid).toBe(false);
        expect(catalog.blockType('minecraft:water')?.liquid).toBe(true);
    });

    it("lists the content's own types after the vanilla ones, and describes them", () => {
        const blocks = catalog.blockTypes();
        expect(blocks.indexOf('jsp:custom_block')).toBe(blocks.length - 1);
        expect(blocks.filter((id) => id === 'minecraft:stone')).toHaveLength(1);
        expect(catalog.blockType('jsp:custom_block')?.item).toBe('jsp:custom_block');
        expect(catalog.itemType('jsp:custom_item')?.maxAmount).toBe(64);
        expect(catalog.blockType('jsp:no_such_block')).toBeUndefined();
    });

    it('finds the item and data value of a potion, and reads a data value back to its potion', () => {
        const splash = catalog.potionItem('minecraft:swiftness', 'ThrownSplash');
        expect(splash?.typeId).toBe('minecraft:splash_potion');
        expect(splash === undefined ? undefined : catalog.potionOf(splash.typeId, splash.data)).toEqual({
            effect: 'minecraft:swiftness',
            delivery: 'ThrownSplash'
        });
        expect(catalog.potionOf('minecraft:potion', 0)).toEqual({ effect: 'minecraft:water', delivery: 'Consume' });
        expect(catalog.potionItem('minecraft:jsp', 'Consume')).toBeUndefined();
    });

    it('gives each enchantment the items it goes on and the ones it refuses', () => {
        const sharpness = catalog.enchantments().find((each) => each.id === 'sharpness');
        expect(sharpness?.maxLevel).toBe(5);
        expect(sharpness?.items).toContain('minecraft:diamond_sword');
        expect(sharpness?.conflicts).toContain('smite');
    });
});
