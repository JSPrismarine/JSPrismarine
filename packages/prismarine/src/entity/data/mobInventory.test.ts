import { describe, expect, it } from 'vitest';

import { ItemContainer } from '../../inventory/ItemContainer';
import { Item } from '../../item/Item';
import type { MobEquipmentSlot } from '../equipment';
import { countIn, editIdentifiers, identifiersIn, takeFrom } from './mobInventory';
import { entityFixture, FLOOR_Y, TestEntityWorld } from './testing';
import { containerOf, equip, equipmentOf, setContainerSlot } from '../../testing/mobSlots.test-utils';

const GROUND = { x: 0.5, y: FLOOR_Y + 1, z: 0.5 };

/** A mount whose chest group gives it more room, and a cow with no container at all. */
const EXTRA = {
    'jsprismarine:mount': {
        components: {
            'minecraft:health': { value: 20, max: 20 },
            'minecraft:inventory': { container_type: 'horse', inventory_size: 2 }
        },
        component_groups: {
            chested: { 'minecraft:inventory': { container_type: 'horse', inventory_size: 5 } }
        },
        events: {
            add_chest: { add: { component_groups: ['chested'] } },
            remove_chest: { remove: { component_groups: ['chested'] } }
        }
    }
};

const fixture = () => {
    const world = new TestEntityWorld();
    const { runtime } = entityFixture(world, {}, EXTRA);
    const spawn = (identifier: string) => {
        const entity = runtime.spawn(identifier, GROUND);
        if (entity === undefined) throw new Error(`the fixture declares no ${identifier}`);
        return entity;
    };
    return { world, runtime, spawn };
};

const stack = (name: string, count = 1) => new Item({ name, count });

describe("a mob's inventory", () => {
    it('lays out a hand, an off hand, four armor slots, a body slot and the container its type declares', () => {
        const { spawn } = fixture();

        const sizes = (identifier: string) =>
            spawn(identifier)
                .body.inventory.entries()
                .map(([name, container]) => [name, container.size]);

        expect(sizes('jsprismarine:mount')).toEqual([
            ['mainhand', 1],
            ['offhand', 1],
            ['armor', 4],
            ['body', 1],
            ['inventory', 2]
        ]);
        expect(sizes('minecraft:cow')).toContainEqual(['inventory', 0]);
    });

    it('reads and writes an aliased equipment slot through its container slot, as one stack', () => {
        const { runtime, spawn } = fixture();
        const mount = spawn('jsprismarine:mount');

        mount.body.equipmentInventorySlots.set('body', 1);
        equip(mount.body, { body: { identifier: 'minecraft:iron_horse_armor', count: 1 } }, runtime.content());

        expect(containerOf(mount.body)).toEqual([undefined, { identifier: 'minecraft:iron_horse_armor', count: 1 }]);
        expect(mount.body.inventory.container('body').get(0)).toBeNull();
        expect(equipmentOf(mount.body).body).toEqual({ identifier: 'minecraft:iron_horse_armor', count: 1 });

        // Without the alias the body slot reads its own empty slot, and the stack stays in the container.
        mount.body.equipmentInventorySlots.delete('body');
        expect(equipmentOf(mount.body).body).toBeUndefined();
        expect(containerOf(mount.body)[1]).toEqual({ identifier: 'minecraft:iron_horse_armor', count: 1 });
    });

    it('tells the components about a write to an equipment slot, and nothing about a slot none reads', () => {
        const { runtime, spawn } = fixture();
        const mount = spawn('jsprismarine:mount');
        const heard: [MobEquipmentSlot, boolean][] = [];
        mount.body.onEquipmentChanged = (slot, equipped) => heard.push([slot, equipped]);
        const revision = () => mount.body.equipmentRevision;
        const start = revision();

        equip(mount.body, { mainhand: { identifier: 'minecraft:stick', count: 1 } }, runtime.content());
        expect(heard).toEqual([['mainhand', true]]);
        expect(revision()).toBe(start + 1);

        setContainerSlot(mount.body, 1, { identifier: 'minecraft:iron_horse_armor', count: 1 }, runtime.content());
        expect(heard).toHaveLength(1);
        expect(revision()).toBe(start + 1);

        // Pointing the body slot at the stack is an equipment change, and so is taking the stack.
        mount.body.equipmentInventorySlots.set('body', 1);
        setContainerSlot(mount.body, 1, undefined);
        expect(heard).toEqual([
            ['mainhand', true],
            ['body', true],
            ['body', false]
        ]);
        expect(revision()).toBe(start + 3);
    });

    it('moves the revision for an undone slot write without telling the components', () => {
        const { runtime, spawn } = fixture();
        const mount = spawn('jsprismarine:mount');
        equip(mount.body, { head: { identifier: 'minecraft:iron_helmet', count: 1 } }, runtime.content());
        const heard: MobEquipmentSlot[] = [];
        mount.body.onEquipmentChanged = (slot) => heard.push(slot);
        const before = mount.body.equipmentRevision;

        expect(mount.body.restoreSlot('armor', 0, null, runtime.content())).toBe(true);

        expect(mount.body.inventory.equipment('head')).toBeNull();
        expect(mount.body.equipmentRevision).toBe(before + 1);
        expect(heard).toEqual([]);
        expect(mount.body.restoreSlot('ender_chest', 0, null)).toBe(false);
    });

    it('drops at its feet what a container that shrinks no longer holds', () => {
        const { world, runtime, spawn } = fixture();
        const mount = spawn('jsprismarine:mount');
        mount.instance.raise('add_chest', 'self', 'test');
        mount.instance.applyQueuedEvents();
        runtime.tick(1);
        expect(mount.body.containerCapacity).toBe(5);
        setContainerSlot(mount.body, 0, { identifier: 'minecraft:saddle', count: 1 }, runtime.content());
        setContainerSlot(mount.body, 4, { identifier: 'minecraft:diamond', count: 3 }, runtime.content());

        mount.instance.raise('remove_chest', 'self', 'test');
        mount.instance.applyQueuedEvents();
        runtime.tick(2);

        expect(mount.body.containerCapacity).toBe(2);
        expect(containerOf(mount.body)).toEqual([{ identifier: 'minecraft:saddle', count: 1 }, undefined]);
        expect(world.drops.map((drop) => drop.item)).toEqual([{ identifier: 'minecraft:diamond', count: 3 }]);
    });
});

describe('a container read by identifier', () => {
    it('lists each item once per count and counts one identifier', () => {
        const container = new ItemContainer(3, [stack('minecraft:wheat', 2), null, stack('minecraft:bread')]);

        expect(identifiersIn(container)).toEqual(['minecraft:wheat', 'minecraft:wheat', 'minecraft:bread']);
        expect(countIn(container, 'minecraft:wheat')).toBe(2);
    });

    it('takes from the first slots that hold an item', () => {
        const container = new ItemContainer(2, [stack('minecraft:wheat', 2), stack('minecraft:wheat', 2)]);

        expect(takeFrom(container, 'minecraft:wheat', 3)).toBe(3);
        expect(container.items().map((item) => item?.getAmount() ?? 0)).toEqual([0, 1]);
        expect(takeFrom(container, 'minecraft:wheat', 5)).toBe(1);
    });

    it('writes back what work changed and leaves the stacks it did not touch as they were', () => {
        const sword = new Item({ name: 'minecraft:iron_sword', count: 1, customName: 'Kept' });
        const container = new ItemContainer(3, [sword, stack('minecraft:wheat', 3)]);

        const { result, overflow } = editIdentifiers(
            container,
            (identifiers) => {
                identifiers.splice(identifiers.indexOf('minecraft:wheat'), 3);
                identifiers.push('minecraft:bread');
                return 'baked';
            },
            (identifier, count) => stack(identifier, count)
        );

        expect(result).toBe('baked');
        expect(overflow).toEqual([]);
        expect(container.get(0)).toBe(sword);
        expect(identifiersIn(container)).toEqual(['minecraft:iron_sword', 'minecraft:bread']);
    });

    it('hands back what the work added and the container had no room for', () => {
        const container = new ItemContainer(1, [stack('minecraft:wheat')]);

        const { overflow } = editIdentifiers(
            container,
            (identifiers) => identifiers.push('minecraft:bread'),
            (identifier, count) => stack(identifier, count)
        );

        expect(overflow.map((item) => [item.getName(), item.getAmount()])).toEqual([['minecraft:bread', 1]]);
    });
});
