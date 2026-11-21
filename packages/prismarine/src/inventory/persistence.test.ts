import { describe, expect, it } from 'vitest';

import { Item } from '../item/Item';
import HumanInventory from './HumanInventory';
import { storedInventory } from './persistence';

/** An enchanted, renamed, damaged sword, so every optional field of a stored stack is present. */
const sword = (): Item => {
    const stack = new Item({ name: 'minecraft:diamond_sword', count: 1 })
        .withEnchantments({ 'minecraft:sharpness': 5 })
        .withDisplay('Edge', ['First line']);
    stack.durability = stack.getMaxDurability() - 10;
    return stack;
};

describe('storedInventory', () => {
    // A save that holds a player's record across later ticks depends on this: the record has to
    // be a copy, so nothing the player does after it was taken can reach what gets written.
    it('returns a record that later changes to the inventory do not reach', () => {
        const inventory = new HumanInventory();
        const main = inventory.container('inventory');
        const enderChest = inventory.container('ender_chest');
        main.set(0, sword());
        main.set(1, new Item({ name: 'minecraft:black_shulker_box' }).withContents([null, sword()]));
        enderChest.set(3, new Item({ name: 'minecraft:diamond', count: 5 }));

        const stored = storedInventory(inventory);
        const before = structuredClone(stored);

        main.get(0)!.durability = 1;
        main.get(1)!.getContents()[1]!.durability = 1;
        main.set(2, new Item({ name: 'minecraft:dirt', count: 3 }));
        main.set(1, null);
        enderChest.set(3, null);
        inventory.setHandSlot(4);

        expect(stored).toEqual(before);
    });
});
