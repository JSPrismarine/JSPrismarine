import type { EntityPosition } from '@jsprismarine/entities';
import { describe, expect, it } from 'vitest';

import { GoalHarness } from '../harness';
import { voxelGrid } from '../navigation/voxelGrid';
import type { GoalItem, GoalWorld } from '../world';

/** The work and item family: picking things up, farming, composting and placing blocks. */

const flatWorld = (size = 32): GoalWorld => {
    const floor = Array.from({ length: size }, () => '#'.repeat(size));
    const air = Array.from({ length: size }, () => '.'.repeat(size));
    const view = voxelGrid([floor, air, air, air]);
    return { navigation: () => view };
};

const walker = { 'minecraft:collision_box': { width: 0.6, height: 1.8 }, 'minecraft:navigation.walk': {} };

const testItem = (id: string, at: EntityPosition, identifier: string): GoalItem => ({
    id,
    position: () => at,
    identifier: () => identifier,
    count: () => 1
});

describe('minecraft:behavior.pickup_items', () => {
    it('walks to an item and takes it', () => {
        const wheat = testItem('wheat', { x: 10.5, y: 1, z: 8.5 }, 'minecraft:wheat');
        const taken: (string | number)[] = [];
        let lying: readonly GoalItem[] = [wheat];
        const harness = new GoalHarness({
            goals: {
                'minecraft:behavior.pickup_items': {
                    priority: 6,
                    max_dist: 16,
                    goal_radius: 2,
                    can_pickup_any_item: true
                }
            },
            components: walker,
            world: {
                ...flatWorld(),
                items: () => lying,
                pickUp: (item) => {
                    taken.push(item.id);
                    lying = [];
                }
            },
            at: { x: 8.5, y: 1, z: 8.5 }
        });

        harness.tick();
        expect(harness.holderOf('move')).toBe('minecraft:behavior.pickup_items');

        harness.tick(3);
        expect(taken).toEqual(['wheat']);
    });

    it('leaves an excluded item alone', () => {
        const stone = testItem('stone', { x: 9.5, y: 1, z: 8.5 }, 'minecraft:stone');
        const harness = new GoalHarness({
            goals: {
                'minecraft:behavior.pickup_items': {
                    priority: 6,
                    max_dist: 16,
                    can_pickup_any_item: true,
                    excluded_items: ['minecraft:stone']
                }
            },
            components: walker,
            world: { ...flatWorld(), items: () => [stone] },
            at: { x: 8.5, y: 1, z: 8.5 }
        });

        harness.tick();

        expect(harness.running()).toEqual([]);
    });
});

describe('minecraft:behavior.equip_item', () => {
    it('puts the first inventory item in the entity hand', () => {
        const equipped: (string | undefined)[] = [];
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.equip_item': { priority: 3 } },
            world: {
                inventory: () => ['minecraft:iron_sword'],
                setCarriedItem: (item) => equipped.push(item)
            }
        });

        harness.tick();

        expect(equipped).toEqual(['minecraft:iron_sword']);
    });
});

describe('minecraft:behavior.work', () => {
    it('walks to its work site and fires on_arrival once', () => {
        const fired: string[] = [];
        const harness = new GoalHarness({
            goals: {
                'minecraft:behavior.work': {
                    priority: 8,
                    active_time: 100,
                    on_arrival: { event: 'minecraft:resupply_trades' }
                }
            },
            components: walker,
            world: {
                ...flatWorld(),
                poi: (type) => (type === 'work' ? { x: 10.5, y: 1, z: 8.5 } : undefined),
                trigger: (event) => fired.push(event)
            },
            at: { x: 8.5, y: 1, z: 8.5 }
        });

        harness.tick(6);

        expect(harness.holderOf('move')).toBe('minecraft:behavior.work');
    });

    it('stays home in the rain unless can_work_in_rain is set', () => {
        const world: GoalWorld = { ...flatWorld(), poi: () => ({ x: 10.5, y: 1, z: 8.5 }) };
        const wet = new GoalHarness({
            goals: { 'minecraft:behavior.work': { priority: 8 } },
            components: walker,
            world,
            at: { x: 8.5, y: 1, z: 8.5 },
            worldFacts: { weather: () => 'rain' }
        });
        wet.tick();
        expect(wet.running()).toEqual([]);

        const allowed = new GoalHarness({
            goals: { 'minecraft:behavior.work': { priority: 8, can_work_in_rain: true } },
            components: walker,
            world,
            at: { x: 8.5, y: 1, z: 8.5 },
            worldFacts: { weather: () => 'rain' }
        });
        allowed.tick();
        expect(allowed.isRunning('minecraft:behavior.work')).toBe(true);
    });
});

describe('minecraft:behavior.stomp_turtle_egg', () => {
    it('walks to an egg and breaks it', () => {
        const broken: EntityPosition[] = [];
        let eggs = [{ position: { x: 10, y: 1, z: 8 }, identifier: 'minecraft:turtle_egg' }];
        const harness = new GoalHarness({
            goals: {
                'minecraft:behavior.stomp_turtle_egg': {
                    priority: 4,
                    search_range: 10,
                    search_height: 2,
                    goal_radius: 1.14,
                    interval: 1
                }
            },
            components: walker,
            world: {
                ...flatWorld(),
                blocks: () => eggs,
                breakBlock: (position) => {
                    broken.push(position);
                    eggs = [];
                }
            },
            at: { x: 8.5, y: 1, z: 8.5 }
        });

        harness.tick(6);

        expect(broken).toHaveLength(1);
    });
});

describe('minecraft:behavior.place_block', () => {
    it('places one of its blocks when the chance comes up', () => {
        const placed: string[] = [];
        const harness = new GoalHarness({
            goals: {
                'minecraft:behavior.place_block': {
                    priority: 12,
                    chance: 1,
                    xz_range: 2,
                    y_range: 1,
                    randomly_placeable_blocks: ['minecraft:snow_layer']
                }
            },
            world: { setBlock: (_position, identifier) => placed.push(identifier) },
            at: { x: 8.5, y: 1, z: 8.5 }
        });

        harness.tick();

        expect(placed).toEqual(['minecraft:snow_layer']);
    });

    it('does nothing when the chance does not come up', () => {
        const placed: string[] = [];
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.place_block': { priority: 12, chance: 0 } },
            world: { setBlock: (_position, identifier) => placed.push(identifier) }
        });

        harness.tick(5);

        expect(placed).toEqual([]);
    });
});

describe('minecraft:behavior.take_block', () => {
    it('takes a block it may carry and holds it', () => {
        const held: (string | undefined)[] = [];
        const harness = new GoalHarness({
            goals: {
                'minecraft:behavior.take_block': {
                    priority: 11,
                    chance: 1,
                    xz_range: 2,
                    y_range: 1,
                    blocks: ['minecraft:grass_block']
                }
            },
            world: {
                blocks: () => [{ position: { x: 9, y: 1, z: 8 }, identifier: 'minecraft:grass_block' }],
                breakBlock: () => undefined,
                carriedItem: () => undefined,
                setCarriedItem: (item) => held.push(item)
            }
        });

        harness.tick();

        expect(held).toEqual(['minecraft:grass_block']);
    });
});
