import { describe, expect, it } from 'vitest';

import CraftingInput from '../crafting/CraftingInput';
import { Item } from '../item/Item';
import type { SlotValue } from './slotLog';
import { entityContainerNamed, itemOfSlotValue, slotValueOf } from './slotLog';

const stack = (name: string, count = 1) => new Item({ name, count });

describe('logged inventory slots', () => {
    it('names every container of every entity, and nothing else', () => {
        expect(entityContainerNamed('ender_chest')).toBe('ender_chest');
        expect(entityContainerNamed('body')).toBe('body');
        expect(entityContainerNamed('hotbar')).toBeUndefined();
    });

    it('logs an empty slot as null, and a stack as its saved form', () => {
        expect(slotValueOf(null)).toBeNull();
        expect(slotValueOf(stack('minecraft:apple', 4))).toEqual({ name: 'minecraft:apple', count: 4 });
    });

    it('refuses a logged value that is not a stored stack', () => {
        expect(() => itemOfSlotValue({ count: 1 })).toThrow(TypeError);
        expect(() => itemOfSlotValue({ name: 'minecraft:stone_pickaxe', count: 1, canDestroy: [1] })).toThrow(
            TypeError
        );
    });

    it('keeps the blocks a stack may be placed on and may destroy through its logged value', () => {
        const pickaxe = new Item({
            name: 'minecraft:stone_pickaxe',
            canPlaceOnBlocks: ['minecraft:dirt'],
            canDestroyBlocks: ['minecraft:stone', 'minecraft:cobblestone']
        });

        const restored = itemOfSlotValue(slotValueOf(pickaxe));

        expect(restored?.getCanPlaceOnBlocks()).toEqual(['minecraft:dirt']);
        expect(restored?.getCanDestroyBlocks()).toEqual(['minecraft:stone', 'minecraft:cobblestone']);
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
