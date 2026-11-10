import { describe, expect, it } from 'vitest';

import CraftingInput from '../crafting/CraftingInput';
import { Item } from '../item/Item';
import ContainerEntry from './ContainerEntry';
import HumanInventory from './HumanInventory';
import type { HumanInventoryObserver } from './HumanInventory';
import type { PlayerContainer, SlotValue } from './slotLog';
import { itemOfSlotValue, slotValueOf, slotValueOfItem } from './slotLog';

type Heard = { container: PlayerContainer; slot: number; before: SlotValue; after: SlotValue };

/** An inventory whose writes are collected, as the change log would hear them. */
const observed = () => {
    const inventory = new HumanInventory();
    const slots: Heard[] = [];
    const hands: [number, number][] = [];
    const observer: HumanInventoryObserver = {
        slot: (container, slot, before, after) => slots.push({ container, slot, before, after }),
        handSlot: (before, after) => hands.push([before, after])
    };
    inventory.observeCarried(observer);
    return { inventory, slots, hands };
};

const stack = (name: string, count = 1) => new Item({ name, count });
const entry = (name: string, count = 1) => new ContainerEntry({ item: stack(name, count) });

describe('logged inventory slots', () => {
    it('reports each write with the value the slot held before it', () => {
        const { inventory, slots } = observed();

        inventory.setItem(2, entry('minecraft:stone', 3));
        inventory.setItem(2, entry('minecraft:stone', 5));
        inventory.removeItem(2);

        expect(slots).toEqual([
            { container: 'inventory', slot: 2, before: null, after: { name: 'minecraft:stone', count: 3 } },
            {
                container: 'inventory',
                slot: 2,
                before: { name: 'minecraft:stone', count: 3 },
                after: { name: 'minecraft:stone', count: 5 }
            },
            { container: 'inventory', slot: 2, before: { name: 'minecraft:stone', count: 5 }, after: null }
        ]);
    });

    it('names the armor, off hand, ender chest and cursor as containers of their own', () => {
        const { inventory, slots } = observed();

        inventory.getArmor().setItem(1, entry('minecraft:iron_chestplate'));
        inventory.getOffhand().setItem(0, entry('minecraft:shield'));
        inventory.getEnderChest().setItem(26, entry('minecraft:diamond', 2));
        inventory.setCursor(stack('minecraft:torch', 16));
        inventory.setCursor(null);

        expect(slots.map(({ container, slot, after }) => [container, slot, after?.['name'] ?? null])).toEqual([
            ['armor', 1, 'minecraft:iron_chestplate'],
            ['offhand', 0, 'minecraft:shield'],
            ['ender_chest', 26, 'minecraft:diamond'],
            ['cursor', 0, 'minecraft:torch'],
            ['cursor', 0, null]
        ]);
    });

    it('reports a move of the hand, and not a selection of the slot it is already on', () => {
        const { inventory, hands } = observed();

        inventory.setHandSlot(0);
        inventory.setHandSlot(4);
        inventory.setHandSlot(40);

        expect(hands).toEqual([[0, 4]]);
    });

    it('reports a stack changed in place with the value it was last logged at', () => {
        const { inventory, slots } = observed();
        inventory.setItem(0, entry('minecraft:diamond_sword'));
        const sword = inventory.getItem(0);

        // A change in place is not a write, so the next write still names the logged value.
        sword.durability -= 10;
        inventory.setItem(0, new ContainerEntry({ item: sword }));

        expect(slots.at(-1)?.before).toEqual({ name: 'minecraft:diamond_sword', count: 1 });
        expect(slots.at(-1)?.after).toEqual({ name: 'minecraft:diamond_sword', count: 1, damage: 10 });
    });

    it('writes a logged value back through the slot it names', () => {
        const { inventory } = observed();
        inventory.setItem(5, entry('minecraft:apple', 4));
        const logged = slotValueOf(inventory.getEntry(5));

        inventory.removeItem(5);
        expect(inventory.restoreSlot('inventory', 5, logged)).toBe(true);
        expect(inventory.restoreSlot('cursor', 0, slotValueOfItem(stack('minecraft:bow')))).toBe(true);

        expect(slotValueOf(inventory.getEntry(5))).toEqual(logged);
        expect(inventory.getCursor()?.getName()).toBe('minecraft:bow');
        expect(inventory.restoreSlot('armor', 4, null)).toBe(false);
        expect(inventory.restoreSlot('crafting', 0, null)).toBe(false);
    });

    it('refuses a logged value that is not a stored stack', () => {
        expect(() => itemOfSlotValue({ count: 1 })).toThrow(TypeError);
    });

    it('reports every crafting slot a clear empties, and none it leaves empty', () => {
        const grid = new CraftingInput();
        const heard: [number, SlotValue, SlotValue][] = [];
        grid.observe((slot, before, after) => heard.push([slot, before, after]));

        grid.set(0, stack('minecraft:oak_planks'));
        grid.clear();

        const planks = { name: 'minecraft:oak_planks', count: 1 };
        expect(heard).toEqual([
            [0, null, planks],
            [0, planks, null]
        ]);
    });
});
