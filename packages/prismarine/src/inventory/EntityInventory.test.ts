import { describe, expect, it } from 'vitest';

import { Item } from '../item/Item';
import { EntityInventory, mobLayout, PLAYER_LAYOUT } from './EntityInventory';
import type { EntityInventoryObserver, InventoryContainer } from './EntityInventory';
import type { SlotValue } from './slotLog';
import { slotValueOf } from './slotLog';

type Heard = { container: InventoryContainer; slot: number; before: SlotValue; after: SlotValue };

/** An inventory whose writes are collected, as the change log would hear them. */
const observed = <I extends EntityInventory>(inventory: I) => {
    const slots: Heard[] = [];
    const hands: [number, number][] = [];
    const observer: EntityInventoryObserver = {
        slot: (container, slot, before, after) => slots.push({ container, slot, before, after }),
        handSlot: (before, after) => hands.push([before, after])
    };
    inventory.observe(observer);
    return { inventory, slots, hands };
};

const stack = (name: string, count = 1) => new Item({ name, count });
const player = () => new EntityInventory(PLAYER_LAYOUT);

describe('EntityInventory', () => {
    describe('the player layout', () => {
        it('has the containers a player carries, at their sizes', () => {
            const inventory = player();

            expect(inventory.entries().map(([name, container]) => [name, container.size])).toEqual([
                ['inventory', 36],
                ['armor', 4],
                ['offhand', 1],
                ['ender_chest', 27],
                ['cursor', 1]
            ]);
            expect(inventory.containerNamed('body')).toBeUndefined();
            expect(inventory.containerNamed('crafting')).toBeUndefined();
        });

        it('reads the main hand from the hotbar slot the hand points at', () => {
            const inventory = player();
            const sword = stack('minecraft:diamond_sword');
            inventory.container('inventory').set(3, sword);

            expect(inventory.equipment('mainhand')).toBeNull();

            inventory.setHandSlot(3);

            expect(inventory.equipment('mainhand')).toBe(sword);
            expect(inventory.equipmentAddress('mainhand')).toEqual({ container: 'inventory', slot: 3 });
        });

        it('has no body slot', () => {
            const inventory = player();

            expect(inventory.setEquipment('body', stack('minecraft:diamond_horse_armor'))).toBe(false);
            expect(inventory.equipment('body')).toBeNull();
        });

        it('reads worn equipment from the armor container, head to feet', () => {
            const inventory = player();
            const boots = stack('minecraft:iron_boots');

            inventory.setEquipment('feet', boots);

            expect(inventory.container('armor').get(3)).toBe(boots);
            expect(inventory.getEquipment()).toEqual({ feet: boots });
        });

        it('ignores a hand slot outside the hotbar', () => {
            // The slot arrives off the wire, so it is not to be trusted as an index.
            const inventory = player();
            inventory.setHandSlot(4);

            for (const slot of [-1, 9, 36, 1.5, Number.NaN]) {
                inventory.setHandSlot(slot);
                expect(inventory.getHandSlot()).toBe(4);
            }
        });

        it('resizes the held stack, and empties the hand at zero', () => {
            const inventory = player();
            inventory.container('inventory').set(0, stack('minecraft:apple', 3));

            expect(inventory.setEquipmentCount('mainhand', 2)).toBe(true);
            expect(inventory.equipment('mainhand')?.getAmount()).toBe(2);

            inventory.setEquipmentCount('mainhand', 0);
            expect(inventory.equipment('mainhand')).toBeNull();
            expect(inventory.setEquipmentCount('mainhand', 1)).toBe(false);
        });

        it('sums the armor worn', () => {
            const inventory = player();
            inventory.setEquipment('chest', stack('minecraft:iron_chestplate'));
            inventory.setEquipment('head', stack('minecraft:diamond_helmet'));

            expect(inventory.getArmorDefensePoints()).toBe(6 + 3);
            expect(inventory.getArmorToughness()).toBe(2);
        });
    });

    describe('a mob layout', () => {
        it('has a main hand, an off hand, armor, a body slot and an inventory of the given size', () => {
            const inventory = new EntityInventory(mobLayout(15));

            expect(inventory.entries().map(([name, container]) => [name, container.size])).toEqual([
                ['mainhand', 1],
                ['offhand', 1],
                ['armor', 4],
                ['body', 1],
                ['inventory', 15]
            ]);
            expect(inventory.containerNamed('cursor')).toBeUndefined();
        });

        it('reads the main hand and the body from containers of their own', () => {
            const inventory = new EntityInventory(mobLayout(0));
            const bow = stack('minecraft:bow');
            const carpet = stack('minecraft:red_carpet');

            inventory.setEquipment('mainhand', bow);
            inventory.setEquipment('body', carpet);

            expect(inventory.container('mainhand').get(0)).toBe(bow);
            expect(inventory.container('body').get(0)).toBe(carpet);
            expect(inventory.getEquipment()).toEqual({ mainhand: bow, body: carpet });
        });

        it('has no hand slot to move', () => {
            const inventory = new EntityInventory(mobLayout(2));

            inventory.setHandSlot(1);

            expect(inventory.getHandSlot()).toBe(0);
            expect(inventory.equipmentAddress('mainhand')).toEqual({ container: 'mainhand', slot: 0 });
        });

        it('reads an aliased equipment slot through the container slot it names', () => {
            // A horse's armor lives in its inventory, so `body` is that slot and not a second copy.
            const inventory = new EntityInventory(mobLayout(2));
            const armor = stack('minecraft:iron_horse_armor');
            inventory.setAlias('body', { container: 'inventory', slot: 1 });

            inventory.setEquipment('body', armor);

            expect(inventory.container('inventory').get(1)).toBe(armor);
            expect(inventory.container('body').get(0)).toBeNull();
            expect(inventory.equipment('body')).toBe(armor);

            inventory.container('inventory').set(1, null);
            expect(inventory.equipment('body')).toBeNull();

            inventory.setAlias('body', undefined);
            expect(inventory.equipmentAddress('body')).toEqual({ container: 'body', slot: 0 });
        });

        it('sums armor through an alias, and not the armor slot the alias hides', () => {
            const inventory = new EntityInventory(mobLayout(2));
            inventory.setEquipment('head', stack('minecraft:iron_helmet'));
            inventory.setAlias('head', { container: 'inventory', slot: 0 });
            inventory.container('inventory').set(0, stack('minecraft:diamond_helmet'));

            expect(inventory.getArmorDefensePoints()).toBe(3);
            expect(inventory.getArmorToughness()).toBe(2);
        });

        it('does not alias to a slot the layout lacks', () => {
            const inventory = new EntityInventory(mobLayout(2));
            inventory.setAlias('body', { container: 'inventory', slot: 5 });

            expect(inventory.equipmentAddress('body')).toBeUndefined();
            expect(inventory.setEquipment('body', stack('minecraft:saddle'))).toBe(false);
        });

        it('logs a write by the container it lands in', () => {
            const { inventory, slots } = observed(new EntityInventory(mobLayout(2)));
            inventory.setAlias('body', { container: 'inventory', slot: 0 });

            inventory.setEquipment('mainhand', stack('minecraft:iron_sword'));
            inventory.setEquipment('body', stack('minecraft:saddle'));

            expect(slots.map(({ container, slot }) => [container, slot])).toEqual([
                ['mainhand', 0],
                ['inventory', 0]
            ]);
        });
    });

    describe('logged slots', () => {
        it('names each container a write lands in', () => {
            const { inventory, slots } = observed(player());

            inventory.container('armor').set(1, stack('minecraft:iron_chestplate'));
            inventory.container('offhand').set(0, stack('minecraft:shield'));
            inventory.container('ender_chest').set(26, stack('minecraft:diamond', 2));
            inventory.container('cursor').set(0, stack('minecraft:torch', 16));
            inventory.container('cursor').set(0, null);

            expect(slots.map(({ container, slot, after }) => [container, slot, after?.['name'] ?? null])).toEqual([
                ['armor', 1, 'minecraft:iron_chestplate'],
                ['offhand', 0, 'minecraft:shield'],
                ['ender_chest', 26, 'minecraft:diamond'],
                ['cursor', 0, 'minecraft:torch'],
                ['cursor', 0, null]
            ]);
        });

        it('reports a move of the hand, and not a selection of the slot it is already on', () => {
            const { inventory, hands } = observed(player());

            inventory.setHandSlot(0);
            inventory.setHandSlot(4);
            inventory.setHandSlot(40);

            expect(hands).toEqual([[0, 4]]);
        });

        it('writes a logged value back through the slot it names', () => {
            const { inventory } = observed(player());
            const main = inventory.container('inventory');
            main.set(5, stack('minecraft:apple', 4));
            const logged = inventory.slotValue('inventory', 5);

            main.set(5, null);
            expect(inventory.restoreSlot('inventory', 5, logged)).toBe(true);
            expect(inventory.restoreSlot('cursor', 0, slotValueOf(stack('minecraft:bow')))).toBe(true);

            expect(slotValueOf(main.get(5))).toEqual(logged);
            expect(inventory.slotItem('cursor', 0)?.getName()).toBe('minecraft:bow');
            expect(inventory.restoreSlot('armor', 4, null)).toBe(false);
            expect(inventory.restoreSlot('crafting', 0, null)).toBe(false);
            expect(inventory.slotItem('body', 0)).toBeUndefined();
            expect(inventory.slotItem('armor', 2)).toBeNull();
        });
    });
});
