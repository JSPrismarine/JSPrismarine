import { describe, expect, it } from 'vitest';

import { inHopperReach, insertStack } from './itemHopper';
import { FLOOR_Y, TestEntityWorld, entityFixture } from './testing';

const GROUND = { x: 0.5, y: FLOOR_Y + 1, z: 0.5 };
const CART = { position: GROUND, width: 0.98, height: 0.7 };

describe("a hopper minecart's reach", () => {
    it('takes an item on its own block and one a quarter block past its side', () => {
        expect(inHopperReach(CART, GROUND)).toBe(true);
        expect(inHopperReach(CART, { ...GROUND, x: GROUND.x + 0.49 + 0.25 + 0.1 })).toBe(true);
        expect(inHopperReach(CART, { ...GROUND, y: GROUND.y + 1.9 })).toBe(true);
    });

    it('leaves an item a block and a half away or below it', () => {
        expect(inHopperReach(CART, { ...GROUND, x: GROUND.x + 1.5 })).toBe(false);
        expect(inHopperReach(CART, { ...GROUND, y: GROUND.y - 1 })).toBe(false);
    });
});

describe('insertStack', () => {
    it('tops up a matching stack before it takes an empty slot, slot by slot', () => {
        const slots = [{ identifier: 'minecraft:dirt', count: 60 }, undefined];
        const { slots: after, inserted } = insertStack(slots, 2, { identifier: 'minecraft:dirt', count: 10 }, 64);
        expect(inserted).toBe(10);
        expect(after).toEqual([
            { identifier: 'minecraft:dirt', count: 64 },
            { identifier: 'minecraft:dirt', count: 6 }
        ]);
    });

    it('puts in only what fits', () => {
        const full = [{ identifier: 'minecraft:stone', count: 64 }];
        expect(insertStack(full, 1, { identifier: 'minecraft:dirt', count: 3 }, 64).inserted).toBe(0);
    });
});

describe('a hopper minecart in the runtime', () => {
    it('takes one item stack in reach each tick and leaves one out of reach', () => {
        const world = new TestEntityWorld();
        const { runtime } = entityFixture(
            world,
            {},
            {
                'jsprismarine:hopper_cart': {
                    components: {
                        'minecraft:collision_box': { width: 0.98, height: 0.7 },
                        'minecraft:inventory': { container_type: 'minecart_hopper', inventory_size: 5 },
                        'minecraft:item_hopper': {}
                    }
                }
            }
        );
        const cart = runtime.spawn('jsprismarine:hopper_cart', GROUND);
        if (cart === undefined) throw new Error('the fixture declares no hopper cart');
        world.host.drop(GROUND, { identifier: 'minecraft:dirt', count: 5 });
        world.host.drop(GROUND, { identifier: 'minecraft:cobblestone', count: 3 });
        world.host.drop({ ...GROUND, x: GROUND.x + 3 }, { identifier: 'minecraft:diamond', count: 1 });

        runtime.tick(1);
        expect(world.host.items?.().length).toBe(2);
        runtime.tick(2);
        expect(world.host.items?.().map((lying) => lying.item.identifier)).toEqual(['minecraft:diamond']);
        expect(cart.body.containerSlots).toEqual([
            { identifier: 'minecraft:dirt', count: 5 },
            { identifier: 'minecraft:cobblestone', count: 3 }
        ]);
    });
});
