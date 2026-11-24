import { describe, expect, it } from 'vitest';

import { Item } from '../item/Item';
import { ItemContainer } from './ItemContainer';
import type { SlotValue } from './slotLog';

const stack = (name: string, count = 1) => new Item({ name, count });

describe('ItemContainer', () => {
    it('holds a stack or nothing, with the count on the stack', () => {
        const container = new ItemContainer(3);
        const dirt = stack('minecraft:dirt', 5);

        expect(container.set(1, dirt)).toBe(true);

        expect(container.items()).toEqual([null, dirt, null]);
        expect(container.get(1)).toBe(dirt);
        expect(container.get(1)?.getAmount()).toBe(5);
        expect(container.isEmpty(0)).toBe(true);
    });

    it('empties a slot written with air or with a count of zero', () => {
        const container = new ItemContainer(2, [stack('minecraft:dirt'), stack('minecraft:stone')]);

        container.set(0, Item.air());
        container.set(1, stack('minecraft:stone', 0));

        expect(container.items()).toEqual([null, null]);
    });

    it('refuses a slot outside the container, the last slot included', () => {
        // `Inventory.setItem` compared with `>`, so the slot one past the end was written.
        const container = new ItemContainer(4);

        for (const slot of [-1, 4, 1.5, Number.NaN]) {
            expect(container.set(slot, stack('minecraft:dirt'))).toBe(false);
            expect(container.get(slot)).toBeNull();
        }
        expect(container.size).toBe(4);
        expect(container.stacks()).toEqual([]);
    });

    it('hands out a copy of its slots, so changing the list changes nothing', () => {
        const container = new ItemContainer(2);
        const slots = container.items();

        container.set(0, stack('minecraft:dirt'));

        expect(slots).toEqual([null, null]);
    });

    describe('add', () => {
        it('puts the stack in the first empty slot', () => {
            const container = new ItemContainer(3);
            const cobblestone = stack('minecraft:cobblestone');

            expect(container.add(cobblestone)).toBe(0);

            expect(container.get(0)).toBe(cobblestone);
        });

        it('tops up a stack already there instead of taking a new slot', () => {
            // Sixty-four cobblestone picked up one at a time is one stack, not sixty-four slots.
            const container = new ItemContainer(36);

            for (let i = 0; i < 64; i++) container.add(stack('minecraft:cobblestone'));

            expect(container.stacks().map((item) => item.getAmount())).toEqual([64]);
        });

        it('keeps what the stack carries when it grows', () => {
            // No stackable vanilla item wears, so the durability here only stands for state on
            // the stack: the top-up copies the stack it grows rather than building a bare one.
            const container = new ItemContainer(3);
            const named = new Item({ name: 'minecraft:stone', count: 1, customName: 'Keepsake' }).withEnchantments({
                'minecraft:unbreaking': 2
            });
            named.durability = 7;
            container.set(0, named);

            container.add(named.withCount(3));

            const grown = container.get(0);
            expect(grown).not.toBe(named);
            expect(grown?.getAmount()).toBe(4);
            expect(grown?.getCustomName()).toBe('Keepsake');
            expect(grown?.getEnchantmentLevel('minecraft:unbreaking')).toBe(2);
            expect(grown?.getDurability()).toBe(7);
            // A write replaces the stack, so the one that was there is as it was.
            expect(named.getAmount()).toBe(1);
        });

        it('gives the parts of a split stack no network id, and a whole stack keeps its own', () => {
            const container = new ItemContainer(3);
            const big = stack('minecraft:stone', 100);
            big.stackNetworkId = 9;
            container.add(big);
            expect(container.items().map((item) => item?.stackNetworkId)).toEqual([0, 0, undefined]);

            const whole = stack('minecraft:dirt', 5);
            whole.stackNetworkId = 11;
            container.add(whole);
            expect(container.get(2)?.stackNetworkId).toBe(11);
        });

        it('keeps stacks with different data in separate slots', () => {
            const container = new ItemContainer(3);
            const named = new Item({ name: 'minecraft:stone', count: 1, customName: 'Keepsake' });
            container.set(0, named);

            expect(container.room(stack('minecraft:stone'))).toBe(64 * 2);
            container.add(stack('minecraft:stone', 3));
            container.add(new Item({ name: 'minecraft:stone', count: 2, customName: 'Other' }));

            expect(container.items().map((item) => [item?.getCustomName(), item?.getAmount()])).toEqual([
                ['Keepsake', 1],
                [undefined, 3],
                ['Other', 2]
            ]);
        });

        it('keeps two maps apart unless they show the same map', () => {
            const container = new ItemContainer(3);
            const map = (mapId: number) => new Item({ name: 'minecraft:filled_map', meta: 5, count: 1, mapId });
            container.add(map(4));
            container.add(map(9));
            container.add(map(4));

            expect(container.items().map((item) => [item?.getMapId(), item?.getAmount()])).toEqual([
                [4, 2],
                [9, 1],
                [undefined, undefined]
            ]);
        });

        it('splits a stack larger than a slot holds into copies of it', () => {
            const container = new ItemContainer(3);
            const pearls = new Item({ name: 'minecraft:ender_pearl', count: 20, customName: 'Spares' });

            expect(container.add(pearls)).toBe(0);

            expect(container.stacks().map((item) => item.getAmount())).toEqual([16, 4]);
            expect(container.stacks().map((item) => item.getCustomName())).toEqual(['Spares', 'Spares']);
        });

        it('does not mix two different things into one slot', () => {
            const container = new ItemContainer(3);
            container.add(stack('minecraft:cobblestone'));
            container.add(stack('minecraft:dirt'));

            expect(container.stacks().map((item) => item.getName())).toEqual([
                'minecraft:cobblestone',
                'minecraft:dirt'
            ]);
        });

        it('says how much would not fit, rather than swallowing it', () => {
            const container = new ItemContainer(2, [stack('minecraft:stone', 64), stack('minecraft:cobblestone', 62)]);

            expect(container.add(stack('minecraft:cobblestone', 5))).toBe(3);
            expect(container.get(1)?.getAmount()).toBe(64);
        });

        it('adds nothing for air', () => {
            const container = new ItemContainer(1);

            expect(container.add(Item.air())).toBe(0);
            expect(container.isEmpty(0)).toBe(true);
        });
    });

    it('says how much of a stack would fit, without putting any in', () => {
        const container = new ItemContainer(3, [stack('minecraft:dirt', 60), stack('minecraft:stone', 64)]);

        expect(container.room(stack('minecraft:dirt'))).toBe(4 + 64);
        expect(container.room(stack('minecraft:stone'))).toBe(64);
        expect(container.room(stack('minecraft:air'))).toBe(0);
        expect(container.items().map((item) => item?.getAmount() ?? 0)).toEqual([60, 64, 0]);
    });

    it('empties every slot on a clear', () => {
        const container = new ItemContainer(3, [stack('minecraft:dirt'), null, stack('minecraft:stone')]);

        container.clear();

        expect(container.items()).toEqual([null, null, null]);
    });

    describe('resize', () => {
        it('hands back what was in the slots that went', () => {
            const dirt = stack('minecraft:dirt');
            const stone = stack('minecraft:stone');
            const container = new ItemContainer(4, [dirt, null, stone, null]);

            expect(container.resize(2)).toEqual([stone]);

            expect(container.size).toBe(2);
            expect(container.items()).toEqual([dirt, null]);
            expect(container.get(2)).toBeNull();
        });

        it('rounds a fractional size down and still hands back what went', () => {
            const dirt = stack('minecraft:dirt');
            const stone = stack('minecraft:stone');
            const sand = stack('minecraft:sand');
            const container = new ItemContainer(3, [dirt, stone, sand]);

            expect(container.resize(1.5)).toEqual([stone, sand]);
            expect(container.items()).toEqual([dirt]);
            expect(container.resize(Number.NaN)).toEqual([dirt]);
            expect(container.size).toBe(0);
        });

        it('grows with empty slots', () => {
            const container = new ItemContainer(1, [stack('minecraft:dirt')]);

            expect(container.resize(3)).toEqual([]);

            expect(container.items().slice(1)).toEqual([null, null]);
            expect(container.set(2, stack('minecraft:stone'))).toBe(true);
        });
    });

    describe('observe', () => {
        const observed = (container: ItemContainer) => {
            const heard: [number, SlotValue, SlotValue][] = [];
            container.observe((slot, before, after) => heard.push([slot, before, after]));
            return heard;
        };

        it('reports each write with the value the slot held before it', () => {
            const container = new ItemContainer(3);
            const heard = observed(container);

            container.set(2, stack('minecraft:stone', 3));
            container.add(stack('minecraft:stone', 2));
            container.set(2, null);

            const three = { name: 'minecraft:stone', count: 3 };
            const five = { name: 'minecraft:stone', count: 5 };
            expect(heard).toEqual([
                [2, null, three],
                [2, three, five],
                [2, five, null]
            ]);
        });

        it('reports a stack changed in place with the value it was last logged at', () => {
            const container = new ItemContainer(1, [stack('minecraft:diamond_sword')]);
            const heard = observed(container);
            const sword = container.get(0)!;

            // A change in place is not a write, so the next write still names the logged value.
            sword.durability -= 10;
            container.set(0, sword);

            expect(heard).toEqual([
                [
                    0,
                    { name: 'minecraft:diamond_sword', count: 1 },
                    { name: 'minecraft:diamond_sword', count: 1, damage: 10 }
                ]
            ]);
        });

        it('reports the slots a shrink empties', () => {
            const container = new ItemContainer(3, [null, null, stack('minecraft:dirt')]);
            const heard = observed(container);

            container.resize(1);

            expect(heard).toEqual([[2, { name: 'minecraft:dirt', count: 1 }, null]]);
        });
    });
});
