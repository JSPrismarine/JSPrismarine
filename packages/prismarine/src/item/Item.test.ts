import { describe, expect, it } from 'vitest';

import { testContent } from '../testing/entityServer';
import { Item } from './Item';

/**
 * A stack at a new size, which is how a slot grows, shrinks or splits.
 *
 * The handler that moves stacks used to rebuild one from its name, so a split or merged stack
 * came out with no enchantments, no durability spent, no name and no content behind it. The
 * last cost the most: an item reads its tags through the content, so a pickaxe rebuilt that
 * way no longer harvested stone.
 */
describe('Item.withCount', () => {
    const pickaxe = () => {
        const item = new Item({
            name: 'minecraft:diamond_pickaxe',
            count: 1,
            content: testContent(),
            customName: 'Old Reliable',
            lore: ['Mined a lot']
        }).withEnchantments({ 'minecraft:efficiency': 3 });
        item.durability = item.getMaxDurability() - 42;
        return item;
    };

    it('keeps everything but the count', () => {
        const original = pickaxe();
        const copy = original.withCount(1);

        expect(copy.getCustomName()).toBe('Old Reliable');
        expect(copy.getLore()).toEqual(['Mined a lot']);
        expect(copy.getEnchantmentLevel('minecraft:efficiency')).toBe(3);
        expect(copy.getMaxDurability() - copy.getDurability()).toBe(42);
        expect(copy.getContents()).toEqual(original.getContents());
    });

    it('keeps the content, so the copy still reads its tags', () => {
        // Stone is in the fixture's `#minecraft:mineable/pickaxe`, which only the content has.
        expect(pickaxe().withCount(1).harvests('minecraft:stone')).toBe(true);
        expect(new Item({ name: 'minecraft:diamond_pickaxe' }).harvests('minecraft:stone')).toBe(false);
    });

    // The tag names Java blocks and Java has no lit variants: its lamp, furnace and redstone
    // ore light up as a state rather than as a block of their own. A pickaxe that read the
    // Bedrock name against the tag was the wrong tool for every one of them, so a mined lit
    // furnace spilled its coal and kept the furnace.
    it('harvests a lit block through the Java name its tag knows', () => {
        expect(pickaxe().harvests('minecraft:lit_redstone_lamp')).toBe(true);
        expect(pickaxe().getMiningSpeed('minecraft:lit_redstone_lamp')).toBe(
            pickaxe().getMiningSpeed('minecraft:redstone_lamp')
        );
        // A block outside the tag stays outside it, whichever edition names it.
        expect(pickaxe().harvests('minecraft:dirt')).toBe(false);
    });

    it('holds the new count in a new object and leaves the original alone', () => {
        const stone = new Item({ name: 'minecraft:stone', count: 10, customName: 'Rock' });
        const part = stone.withCount(4);

        expect(part).not.toBe(stone);
        expect(part.getAmount()).toBe(4);
        expect(stone.getAmount()).toBe(10);
        expect(stone.withCount(0).getAmount()).toBe(0);
    });

    it('keeps the stack network id, which no other copy does', () => {
        // A stack that grows or shrinks is still the stack the client knows by that id.
        const stone = new Item({ name: 'minecraft:stone', count: 10 });
        stone.stackNetworkId = 7;

        expect(stone.withCount(4).stackNetworkId).toBe(7);
        expect(stone.withDisplay('Rock').stackNetworkId).toBe(0);
        expect(stone.withEnchantments({ 'minecraft:efficiency': 1 }).stackNetworkId).toBe(0);
    });
});
