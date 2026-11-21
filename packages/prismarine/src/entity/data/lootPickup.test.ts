import { vanillaItemDefinitions } from '@jsprismarine/items';
import { describe, expect, it } from 'vitest';

import { FARMER_REQUESTED_ITEMS, inPickupReach, villagerWants } from './lootPickup';
import { FLOOR_Y, TestEntityWorld, entityFixture } from './testing';
import { carriedOf, equip, equipmentOf } from '../../testing/mobSlots.test-utils';

const GROUND = { x: 0.5, y: FLOOR_Y + 1, z: 0.5 };
const ZOMBIE_BOX = { position: GROUND, width: 0.6, height: 1.95 };
/** Inside the zombie's reach, but not where it stands. */
const NEAR = { ...GROUND, x: GROUND.x + 0.8 };

describe("a mob's pickup reach", () => {
    it('takes an item a block past the side of its box, and none above or below it', () => {
        expect(inPickupReach(ZOMBIE_BOX, GROUND)).toBe(true);
        expect(inPickupReach(ZOMBIE_BOX, { ...GROUND, x: GROUND.x + 0.3 + 1 + 0.1 })).toBe(true);
        expect(inPickupReach(ZOMBIE_BOX, { ...GROUND, x: GROUND.x + 0.3 + 1 + 0.2 })).toBe(false);
        expect(inPickupReach(ZOMBIE_BOX, { ...GROUND, y: GROUND.y + 2 })).toBe(false);
        expect(inPickupReach(ZOMBIE_BOX, { ...GROUND, y: GROUND.y - 0.5 })).toBe(false);
    });
});

describe("Java's villager pickup", () => {
    const item = (identifier: string, picksUp = false, villagerFood = false) => ({ identifier, picksUp, villagerFood });

    it('takes what it gathers or eats whatever its profession, and what a farmer requests only as a farmer', () => {
        expect(villagerWants(item('minecraft:wheat_seeds', true), undefined)).toBe(true);
        expect(villagerWants(item('minecraft:bread', false, true), 'librarian')).toBe(true);
        expect(villagerWants(item('minecraft:bone_meal'), 'farmer')).toBe(true);
        expect(villagerWants(item('minecraft:bone_meal'), 'librarian')).toBe(false);
        expect(villagerWants(item('minecraft:gold_ingot'), 'farmer')).toBe(false);
        expect(FARMER_REQUESTED_ITEMS.has('minecraft:wheat')).toBe(true);
    });
});

describe('a mob that picks up by touch', () => {
    /**
     * A zombie-like mob whose pickup goal looks no further than where it stands, so only the touch
     * pickup can reach an item a little way off.
     */
    const zombieRuntime = (gameRules: Readonly<Record<string, boolean>> = {}) => {
        const world = new TestEntityWorld({ gameRules });
        const { runtime } = entityFixture(
            world,
            { itemDefinitions: vanillaItemDefinitions() },
            {
                'jsprismarine:zombie': {
                    components: {
                        'minecraft:health': { value: 20, max: 20 },
                        'minecraft:collision_box': { width: 0.6, height: 1.95 },
                        'minecraft:behavior.pickup_items': {
                            priority: 6,
                            max_dist: 0,
                            pickup_based_on_chance: true,
                            can_pickup_any_item: true,
                            excluded_items: ['minecraft:glow_ink_sac']
                        }
                    }
                }
            }
        );
        const zombie = runtime.spawn('jsprismarine:zombie', GROUND);
        if (zombie === undefined) throw new Error('the fixture declares no jsprismarine:zombie');
        return { world, runtime, zombie };
    };

    it('wears a helmet it touches once its spawn roll let it pick up, with no goal running', () => {
        const { world, runtime, zombie } = zombieRuntime();
        zombie.body.canPickUpLoot = true;
        world.host.drop({ ...GROUND, x: GROUND.x + 1 }, { identifier: 'minecraft:iron_helmet', count: 1 });
        world.host.drop(NEAR, { identifier: 'minecraft:gold_ingot', count: 3 });
        world.host.drop(NEAR, { identifier: 'minecraft:glow_ink_sac', count: 1 });

        runtime.tick(1);

        expect(equipmentOf(zombie.body).head?.identifier).toBe('minecraft:iron_helmet');
        // A hand takes the whole stack, where Java's armor slots take one.
        expect(equipmentOf(zombie.body).mainhand).toEqual({ identifier: 'minecraft:gold_ingot', count: 3 });
        expect(world.host.items?.().map((lying) => lying.item.identifier)).toEqual(['minecraft:glow_ink_sac']);
    });

    it('puts a second helmet in its main hand when its head is taken', () => {
        const { world, runtime, zombie } = zombieRuntime();
        zombie.body.canPickUpLoot = true;
        equip(zombie.body, { head: { identifier: 'minecraft:leather_helmet', count: 1 } }, runtime.content());
        world.host.drop(NEAR, { identifier: 'minecraft:iron_helmet', count: 1 });

        runtime.tick(1);

        expect(equipmentOf(zombie.body).head?.identifier).toBe('minecraft:leather_helmet');
        expect(equipmentOf(zombie.body).mainhand?.identifier).toBe('minecraft:iron_helmet');
    });

    it('leaves items lying when its roll failed or mobGriefing is off', () => {
        const unlucky = zombieRuntime();
        unlucky.zombie.body.canPickUpLoot = false;
        unlucky.world.host.drop(NEAR, { identifier: 'minecraft:iron_helmet', count: 1 });
        unlucky.runtime.tick(1);
        expect(equipmentOf(unlucky.zombie.body).head).toBeUndefined();

        const peaceful = zombieRuntime({ mobGriefing: false });
        peaceful.zombie.body.canPickUpLoot = true;
        peaceful.world.host.drop(NEAR, { identifier: 'minecraft:iron_helmet', count: 1 });
        peaceful.runtime.tick(1);
        expect(equipmentOf(peaceful.zombie.body).head).toBeUndefined();
    });
});

describe("a fox's pickup goal", () => {
    const foxRuntime = () => {
        const world = new TestEntityWorld();
        const { runtime } = entityFixture(
            world,
            { itemDefinitions: vanillaItemDefinitions() },
            {
                'minecraft:fox': {
                    components: {
                        'minecraft:health': { value: 10, max: 10 },
                        'minecraft:movement': { value: 0.3 },
                        'minecraft:collision_box': { width: 0.6, height: 0.7 },
                        'minecraft:equip_item': { can_wear_armor: false },
                        'minecraft:shareables': { singular_pickup: true, all_items: true, all_items_max_amount: 1 },
                        'minecraft:behavior.pickup_items': { priority: 1, max_dist: 3, goal_radius: 2 }
                    }
                }
            }
        );
        const fox = runtime.spawn('minecraft:fox', GROUND);
        if (fox === undefined) throw new Error('the fixture declares no minecraft:fox');
        return { world, runtime, fox };
    };

    it('leaves an item lying while its mouth is full, as Fox.canHoldItem does', () => {
        const full = foxRuntime();
        equip(full.fox.body, { mainhand: { identifier: 'minecraft:rabbit_foot', count: 1 } }, full.runtime.content());
        full.world.host.drop(NEAR, { identifier: 'minecraft:gold_ingot', count: 1 });
        for (let tick = 1; tick <= 40; tick += 1) full.runtime.tick(tick);
        expect(full.world.host.items?.().map((lying) => lying.item.identifier)).toEqual(['minecraft:gold_ingot']);
        expect(carriedOf(full.fox.body)).toEqual([]);

        const empty = foxRuntime();
        empty.world.host.drop(NEAR, { identifier: 'minecraft:gold_ingot', count: 1 });
        for (let tick = 1; tick <= 40; tick += 1) empty.runtime.tick(tick);
        expect(equipmentOf(empty.fox.body).mainhand?.identifier).toBe('minecraft:gold_ingot');
    });
});
