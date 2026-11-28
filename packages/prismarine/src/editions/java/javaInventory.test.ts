import { describe, expect, it } from 'vitest';

import type { EditionTranslation } from './editionTranslation';
import { containerSlotOf, javaCreativeSlotIntentOf, javaHotbarIntentOf } from './javaInventory';
import { javaWindowSlotOf } from './JavaPresenter';

/** Java item 1 is stone, and nothing else is known. */
const items: EditionTranslation<string, number | undefined> = {
    toJava: (name) => (name === 'minecraft:stone' ? 1 : undefined),
    toBedrock: (id) => (id === 1 ? 'minecraft:stone' : 'minecraft:air')
};

describe('the Java inventory window', () => {
    it('numbers every container slot so the client and the server agree both ways', () => {
        const slots = [
            ...Array.from({ length: 36 }, (_, slot) => ({ container: 'inventory' as const, slot })),
            ...Array.from({ length: 4 }, (_, slot) => ({ container: 'armor' as const, slot })),
            { container: 'offhand' as const, slot: 0 }
        ];
        const windowSlots = slots.map(({ container, slot }) => javaWindowSlotOf(container, slot));

        expect(new Set(windowSlots).size).toBe(slots.length);
        expect(windowSlots.map(containerSlotOf)).toEqual(slots);
        // The hotbar sits at the bottom of the window, below the 27 slots the server numbers after it.
        expect(javaWindowSlotOf('inventory', 0)).toBe(36);
        expect(javaWindowSlotOf('armor', 0)).toBe(5);
    });

    it('has no container slot for the crafting grid or a stack thrown out of the screen', () => {
        expect([0, 1, 4, -1, 46].map(containerSlotOf)).toEqual([undefined, undefined, undefined, undefined, undefined]);
    });
});

describe('Java inventory decoders', () => {
    it('decodes a creative slot into the container slot and the Bedrock item', () => {
        expect(javaCreativeSlotIntentOf({ slot: 36, item: { item: 1, count: 64 } }, items)).toEqual({
            kind: 'setCreativeSlot',
            container: 'inventory',
            slot: 0,
            item: { name: 'minecraft:stone', count: 64 }
        });
        expect(javaCreativeSlotIntentOf({ slot: 45, item: null }, items)?.item).toBeNull();
        expect(
            javaCreativeSlotIntentOf(
                {
                    slot: 37,
                    item: {
                        item: 1,
                        count: 1,
                        components: {
                            'minecraft:custom_name': 'Rock',
                            'minecraft:damage': 3,
                            'minecraft:enchantments': { 'minecraft:unbreaking': 2 }
                        }
                    }
                },
                items
            )?.item
        ).toEqual({
            name: 'minecraft:stone',
            count: 1,
            customName: 'Rock',
            damage: 3,
            enchantments: new Map([['minecraft:unbreaking', 2]])
        });
        expect(javaCreativeSlotIntentOf({ slot: -1, item: { item: 1, count: 1 } }, items)).toBeUndefined();
    });

    it("takes a custom item's base naming its model as the custom item, keeping only what the stack itself sets", () => {
        const lamp = {
            base: 'minecraft:paper',
            components: {
                'minecraft:item_model': 'loopback:lamp',
                'minecraft:item_name': { translate: 'item.loopback:lamp.name' },
                'minecraft:max_stack_size': 16
            }
        };
        const customItems = {
            identifierOf: (model: string) => (model === 'loopback:lamp' ? 'loopback:lamp' : undefined),
            stackOf: (identifier: string) => (identifier === 'loopback:lamp' ? lamp : undefined)
        };
        expect(
            javaCreativeSlotIntentOf(
                {
                    slot: 36,
                    item: {
                        item: 2,
                        count: 4,
                        components: { ...lamp.components, 'minecraft:custom_name': 'Desk Lamp' }
                    }
                },
                items,
                customItems
            )?.item
        ).toEqual({ name: 'loopback:lamp', count: 4, customName: 'Desk Lamp' });
        // A model no custom item draws is the base item as it is.
        expect(
            javaCreativeSlotIntentOf(
                { slot: 36, item: { item: 1, count: 1, components: { 'minecraft:item_model': 'loopback:other' } } },
                items,
                customItems
            )?.item
        ).toEqual({ name: 'minecraft:stone', count: 1, components: { 'minecraft:item_model': 'loopback:other' } });
    });

    it('takes a hotbar slot from 0 to 8 and nothing else', () => {
        expect(javaHotbarIntentOf(8)).toEqual({ kind: 'selectHotbarSlot', slot: 8 });
        expect(javaHotbarIntentOf(9)).toBeUndefined();
        expect(javaHotbarIntentOf(-1)).toBeUndefined();
    });
});
