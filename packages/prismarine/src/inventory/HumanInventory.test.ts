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

        describe('stack network ids', () => {
            it('counts per player, and leaves a stack its id', () => {
                const first = new HumanInventory();
                const second = new HumanInventory();
                const stone = new Item({ name: 'minecraft:stone' });
                const dirt = new Item({ name: 'minecraft:dirt' });

                expect(first.assignStackNetworkId(stone)).toBe(1);
                expect(first.assignStackNetworkId(dirt)).toBe(2);
                expect(first.assignStackNetworkId(stone)).toBe(1);
                // Another player's count starts on its own.
                expect(second.assignStackNetworkId(new Item({ name: 'minecraft:stone' }))).toBe(1);
            });

            it('gives air none', () => {
                expect(new HumanInventory().assignStackNetworkId(Item.air())).toBe(0);
            });

            it('gives every stack the player holds one, the ender chest included', () => {
                const inventory = new HumanInventory();
                const stone = new Item({ name: 'minecraft:stone' });
                const helmet = new Item({ name: 'minecraft:iron_helmet' });
                const shield = new Item({ name: 'minecraft:shield' });
                const diamond = new Item({ name: 'minecraft:diamond' });
                const torch = new Item({ name: 'minecraft:torch' });
                inventory.setItem(4, new ContainerEntry({ item: stone, count: 1 }));
                inventory.getArmor().setItem(0, new ContainerEntry({ item: helmet, count: 1 }));
                inventory.getOffhand().setItem(0, new ContainerEntry({ item: shield, count: 1 }));
                inventory.getEnderChest().setItem(13, new ContainerEntry({ item: diamond, count: 1 }));
                inventory.setCursor(torch);

                inventory.assignStackNetworkIds();

                const held = [stone, helmet, shield, diamond, torch];
                expect(new Set(held.map((item) => item.stackNetworkId))).toEqual(new Set([1, 2, 3, 4, 5]));
            });
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
        expect(() => held.hasEnchantment('minecraft:silk_touch')).not.toThrow();
        expect(held.hasEnchantment('minecraft:silk_touch')).toBe(false);
        expect(held.isTool()).toBe(false);
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

    it('grows the stack the client is shown, not only the slot', () => {
        // The wire writes the item's count, not the entry's. Raising only the entry's left two
        // dirt picked up one at a time showing as one on the retail client.
        const inventory = new HumanInventory();
        inventory.addItem(stack('minecraft:dirt', 1));

        inventory.addItem(stack('minecraft:dirt', 1));

        expect(inventory.getEntry(0)?.getCount()).toBe(2);
        expect(inventory.getItem(0).getAmount()).toBe(2);
    });

    it('keeps what the stack carries when it grows', () => {
        // No stackable vanilla item wears, so the durability here only stands for state on the
        // stack: the top-up copies the stack it grows rather than building a bare one.
        const inventory = new HumanInventory();
        const named = new Item({ name: 'minecraft:stone', count: 1, customName: 'Keepsake' }).withEnchantments({
            'minecraft:unbreaking': 2
        });
        named.durability = 7;
        inventory.setItem(0, new ContainerEntry({ item: named, count: 1 }));

        inventory.addItem(stack('minecraft:stone', 3));

        const grown = inventory.getItem(0);
        expect(grown.getAmount()).toBe(4);
        expect(grown.getCustomName()).toBe('Keepsake');
        expect(grown.getEnchantmentLevel('minecraft:unbreaking')).toBe(2);
        expect(grown.getDurability()).toBe(7);
    });

    it('keeps what a split stack carries', () => {
        // A stack larger than one slot holds is split, and each part is a copy of it.
        const inventory = new HumanInventory();
        const pearls = new Item({ name: 'minecraft:ender_pearl', count: 20, customName: 'Spares' });

        expect(inventory.addItem(new ContainerEntry({ item: pearls, count: 20 }))).toBe(0);

        expect(inventory.getItems().map((entry) => entry.getItem().getAmount())).toEqual([16, 4]);
        expect(inventory.getItems().map((entry) => entry.getItem().getCustomName())).toEqual(['Spares', 'Spares']);
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
