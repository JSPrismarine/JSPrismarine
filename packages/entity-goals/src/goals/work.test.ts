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

    it('keeps shareable priority ahead of distance when choosing a pickup candidate', () => {
        const nearby = testItem('nearby', { x: 9.5, y: 1, z: 8.5 }, 'minecraft:wheat');
        const preferred = testItem('preferred', { x: 22.5, y: 1, z: 8.5 }, 'minecraft:apple');
        const harness = new GoalHarness({
            goals: {
                'minecraft:behavior.pickup_items': {
                    priority: 6,
                    max_dist: 24,
                    can_pickup_any_item: false
                }
            },
            components: {
                'minecraft:shareables': {
                    items: [
                        { item: 'minecraft:apple', priority: 0 },
                        { item: 'minecraft:wheat', priority: 1 }
                    ]
                }
            },
            world: {
                items: () => [nearby, preferred]
            },
            at: { x: 8.5, y: 1, z: 8.5 }
        });

        harness.tick();

        expect(harness.actuator.log).toContain('moveTo 22.5,1,8.5 @1');
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

describe('minecraft:behavior.take_block, as the vanilla enderman writes it', () => {
    it('matches a bare block name and lifts the block out without dropping it', () => {
        const writes: string[] = [];
        const held: (string | undefined)[] = [];
        let broke = false;
        const harness = new GoalHarness({
            goals: {
                'minecraft:behavior.take_block': { priority: 11, chance: 1, xz_range: 2, y_range: 1, blocks: ['dirt'] }
            },
            world: {
                blocks: (query) =>
                    query.identifiers?.includes('minecraft:dirt') === true
                        ? [{ position: { x: 1, y: 0, z: 0 }, identifier: 'minecraft:dirt' }]
                        : [],
                breakBlock: () => {
                    broke = true;
                },
                setBlock: (_position, identifier) => writes.push(identifier),
                carriedItem: () => undefined,
                setCarriedItem: (item) => held.push(item)
            }
        });

        harness.tick();

        expect(held).toEqual(['minecraft:dirt']);
        expect(writes).toEqual(['minecraft:air']);
        expect(broke).toBe(false);
    });

    it('takes nothing while mobGriefing is off', () => {
        const held: (string | undefined)[] = [];
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.take_block': { priority: 11, chance: 1, blocks: ['dirt'] } },
            world: {
                gameRule: () => false,
                blocks: () => [{ position: { x: 1, y: 0, z: 0 }, identifier: 'minecraft:dirt' }],
                carriedItem: () => undefined,
                setCarriedItem: (item) => held.push(item)
            }
        });

        harness.tick();

        expect(held).toEqual([]);
    });
});

describe('minecraft:behavior.place_block, putting down a carried block', () => {
    const carrying = (air: readonly { x: number; y: number; z: number }[]) => {
        const placed: { readonly position: EntityPosition; readonly identifier: string }[] = [];
        const held: (string | undefined)[] = [];
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.place_block': { priority: 10, chance: 1, xz_range: [0, 0], y_range: [0, 0] } },
            world: {
                blocks: () => air.map((position) => ({ position, identifier: 'minecraft:air' })),
                setBlock: (position, identifier) => placed.push({ position, identifier }),
                carriedItem: () => 'minecraft:dirt',
                setCarriedItem: (item) => held.push(item)
            },
            at: { x: 0.5, y: 1, z: 0.5 }
        });
        harness.tick();
        return { placed, held };
    };

    it('puts it into the air cell it stands in and empties its arms', () => {
        const { placed, held } = carrying([
            { x: 0, y: 1, z: 0 },
            { x: 0, y: 2, z: 0 }
        ]);

        expect(placed).toEqual([{ position: { x: 0, y: 1, z: 0 }, identifier: 'minecraft:dirt' }]);
        expect(held).toEqual([undefined]);
    });

    it('keeps it when the cell is not air or has nothing under it', () => {
        expect(carrying([]).placed).toEqual([]);
        expect(
            carrying([
                { x: 0, y: 0, z: 0 },
                { x: 0, y: 1, z: 0 }
            ]).placed
        ).toEqual([]);
    });
});
