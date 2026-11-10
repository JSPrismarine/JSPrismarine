import { describe, expect, it } from 'vitest';

import { Item } from '../item/Item';
import ContainerEntry from './ContainerEntry';
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

const entry = (item: Item): ContainerEntry => new ContainerEntry({ item, count: item.getAmount() });

describe('storedInventory', () => {
    // A save that holds a player's record across later ticks depends on this: the record has to
    // be a copy, so nothing the player does after it was taken can reach what gets written.
    it('returns a record that later changes to the inventory do not reach', () => {
        const inventory = new HumanInventory();
        inventory.setItem(0, entry(sword()));
        inventory.setItem(1, entry(new Item({ name: 'minecraft:black_shulker_box' }).withContents([null, sword()])));
        inventory.getEnderChest().setItem(3, entry(new Item({ name: 'minecraft:diamond', count: 5 })));

        const stored = storedInventory(inventory);
        const before = structuredClone(stored);

        inventory.getItem(0).durability = 1;
        inventory.getItem(1).getContents()[1]!.durability = 1;
        inventory.setItem(2, entry(new Item({ name: 'minecraft:dirt', count: 3 })));
        inventory.removeItem(1);
        inventory.getEnderChest().removeItem(3);
        inventory.setHandSlot(4);

        expect(stored).toEqual(before);
    });
});
