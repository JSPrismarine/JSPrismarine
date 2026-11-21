import { describe, expect, it } from 'vitest';

import { Item } from '../item/Item';
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
            const main = inventory.container('inventory');
            main.set(0, new Item({ runtimeId: 1, name: 'minecraft:stone' }));
            main.set(3, new Item({ runtimeId: 2, name: 'minecraft:dirt' }));

            expect(inventory.equipment('mainhand')?.getName()).toBe('minecraft:stone');

            inventory.setHandSlot(3);

            expect(inventory.getHandSlot()).toBe(3);
            expect(inventory.equipment('mainhand')?.getName()).toBe('minecraft:dirt');
        });

        it('gives back the very item that was put in the hand', () => {
            // A real item is passed through rather than rebuilt, so a tool keeps its enchantments
            // and everything else a subclass adds.
            const inventory = new HumanInventory();
            const sword = new Item({ runtimeId: 308, name: 'minecraft:diamond_sword' });
            inventory.container('inventory').set(0, sword);
            inventory.setHandSlot(0);

            expect(inventory.equipment('mainhand')).toBe(sword);
        });

        it('names the nine hotbar slots as the ones a hand slot may be', () => {
            expect([0, 8].map(HumanInventory.isHotbarSlot)).toEqual([true, true]);
            expect([-1, 9, 1.5, Number.NaN].map(HumanInventory.isHotbarSlot)).toEqual([false, false, false, false]);
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
                inventory.container('inventory').set(4, stone);
                inventory.container('armor').set(0, helmet);
                inventory.container('offhand').set(0, shield);
                inventory.container('ender_chest').set(13, diamond);
                inventory.container('cursor').set(0, torch);

                inventory.assignStackNetworkIds();

                const held = [stone, helmet, shield, diamond, torch];
                expect(new Set(held.map((item) => item.stackNetworkId))).toEqual(new Set([1, 2, 3, 4, 5]));
            });
        });
    });
});

/**
 * What an empty hand is.
 *
 * It used to be air, and air was once a `Block` cast to look like an item, so asking an empty
 * hand whether it was enchanted threw and a block mined by hand dropped nothing. An empty hand is
 * nothing now, and the code that needs a stack to read asks for one.
 */
describe('an empty hand', () => {
    it('holds nothing rather than a placeholder', () => {
        expect(new HumanInventory().equipment('mainhand')).toBeNull();
    });
});
