import { describe, expect, it } from 'vitest';

import { Item } from '../item/Item';
import ContainerEntry from './ContainerEntry';
import HumanInventory from './HumanInventory';

describe('inventory', () => {
    describe('HumanInventory', () => {
        /**
         * The hand slot was a getter returning zero, so whichever hotbar slot a player
         * selected the server still believed they held slot one - and handed that item to
         * anything that asked what they were mining with.
         */
        it('holds what the selected slot holds', () => {
            const inventory = new HumanInventory();
            inventory.setItem(0, new ContainerEntry({ item: new Item({ id: 1, name: 'minecraft:stone' }) }));
            inventory.setItem(3, new ContainerEntry({ item: new Item({ id: 2, name: 'minecraft:dirt' }) }));

            expect(inventory.getItemInHand().getName()).toBe('minecraft:stone');

            inventory.setHandSlot(3);

            expect(inventory.getHandSlotIndex()).toBe(3);
            expect(inventory.getItemInHand().getName()).toBe('minecraft:dirt');
        });

        it('ignores a slot outside the hotbar', () => {
            // The slot arrives off the wire, so it is not to be trusted as an index.
            const inventory = new HumanInventory();
            inventory.setHandSlot(4);

            for (const slot of [-1, 9, 36, 1.5, Number.NaN]) {
                inventory.setHandSlot(slot);
                expect(inventory.getHandSlotIndex()).toBe(4);
            }
        });
    });
});

/**
 * What an empty hand is.
 *
 * Air, and air is a `Block` - so this used to hand back a block cast to look like an item.
 * The cast holds until something calls a method only an item has, and breaking a block calls
 * `hasEnchantment` on whatever is held to decide about silk touch. Mining by hand therefore
 * threw, after the block had been cleared and before its drop was made: the block vanished
 * and nothing fell.
 */
describe('HumanInventory.getItemInHand', () => {
    it('gives back an item for an empty hand, not a block wearing its name', () => {
        const held = new HumanInventory().getItemInHand();

        expect(held.getName()).toBe('minecraft:air');
        expect(() => held.hasEnchantment(0 as any)).not.toThrow();
        expect(held.hasEnchantment(0 as any)).toBe(false);
        expect(typeof held.getToolType()).toBe('number');
    });

    it('gives back the very item that was put in the hand', () => {
        // A real item is passed through rather than rebuilt, so a tool keeps its enchantments
        // and everything else a subclass adds.
        const inventory = new HumanInventory();
        const sword = new Item({ id: 308, name: 'minecraft:diamond_sword' });
        inventory.setItem(0, new ContainerEntry({ item: sword }));
        inventory.setHandSlot(0);

        expect(inventory.getItemInHand()).toBe(sword);
    });
});

/**
 * Putting a stack in without saying where.
 *
 * This did nothing at all. It looked for a slot with nothing in it, and every slot has
 * something in it - an empty one holds air - so the condition was never true. A stack picked
 * up off the ground was taken out of the world and put nowhere.
 */
describe('Inventory.addItem', () => {
    const stack = (name: string, count: number) =>
        new ContainerEntry({ item: new Item({ id: 0, name, count }), count });

    it('puts the stack somewhere, which it used to not do', () => {
        const inventory = new HumanInventory();

        expect(inventory.addItem(stack('minecraft:cobblestone', 1))).toBe(0);
        expect(inventory.getItems()).toHaveLength(1);
        expect(inventory.getItem(0).getName()).toBe('minecraft:cobblestone');
    });

    it('tops up a stack already there instead of taking a new slot', () => {
        // Sixty-four cobblestone picked up one at a time is one stack, not sixty-four slots.
        const inventory = new HumanInventory();

        for (let i = 0; i < 64; i++) inventory.addItem(stack('minecraft:cobblestone', 1));

        expect(inventory.getItems()).toHaveLength(1);
        expect(inventory.getItems()[0]!.getCount()).toBe(64);
    });

    it('overflows into the next slot at the stack limit', () => {
        const inventory = new HumanInventory();

        for (let i = 0; i < 70; i++) inventory.addItem(stack('minecraft:cobblestone', 1));

        expect(inventory.getItems().map((entry) => entry.getCount())).toEqual([64, 6]);
    });

    it('does not mix two different things into one slot', () => {
        const inventory = new HumanInventory();
        inventory.addItem(stack('minecraft:cobblestone', 1));
        inventory.addItem(stack('minecraft:dirt', 1));

        expect(inventory.getItems()).toHaveLength(2);
    });

    it('says how much would not fit, rather than swallowing it', () => {
        // What stops a full inventory from making a dropped stack disappear.
        const inventory = new HumanInventory();
        for (let slot = 0; slot < 36; slot++) inventory.setItem(slot, stack('minecraft:stone', 64));

        expect(inventory.addItem(stack('minecraft:cobblestone', 5))).toBe(5);
    });
});

describe('Inventory.removeItem', () => {
    it('leaves air behind, so the container keeps its length', () => {
        // The inventory goes on the wire as a list whose position is the slot. Deleting the
        // entry left the container one short, moving every stack after the hole up by one.
        const inventory = new HumanInventory();
        inventory.addItem(
            new ContainerEntry({ item: new Item({ id: 0, name: 'minecraft:dirt', count: 3 }), count: 3 })
        );

        inventory.removeItem(0);

        expect(inventory.getItems(true)).toHaveLength(36);
        expect(inventory.getItem(0).getName()).toBe('minecraft:air');
    });
});
