import type { EntityPosition } from '@jsprismarine/entities';
import { describe, expect, it } from 'vitest';

import { GoalHarness, testMob } from '../harness';
import { voxelGrid } from '../navigation/voxelGrid';
import type { GoalWorld } from '../world';

/** The environment family: sleeping, napping, sitting and eating a block. */

const flatWorld = (size = 32): GoalWorld => {
    const floor = Array.from({ length: size }, () => '#'.repeat(size));
    const air = Array.from({ length: size }, () => '.'.repeat(size));
    const view = voxelGrid([floor, air, air, air]);
    return { navigation: () => view };
};

const walker = { 'minecraft:collision_box': { width: 0.6, height: 1.8 }, 'minecraft:navigation.walk': {} };

describe('minecraft:behavior.sleep', () => {
    it('only runs at night, and lies down once it reaches the bed', () => {
        const states: boolean[] = [];
        const world: GoalWorld = {
            ...flatWorld(),
            poi: (type) => (type === 'bed' ? { x: 10.5, y: 1, z: 8.5 } : undefined),
            setSleeping: (sleeping) => states.push(sleeping)
        };

        const day = new GoalHarness({
            goals: { 'minecraft:behavior.sleep': { priority: 2 } },
            components: walker,
            world,
            at: { x: 8.5, y: 1, z: 8.5 },
            worldFacts: { timeOfDay: () => 6000 }
        });
        day.tick();
        expect(day.running()).toEqual([]);

        const night = new GoalHarness({
            goals: { 'minecraft:behavior.sleep': { priority: 2 } },
            components: walker,
            world,
            at: { x: 8.5, y: 1, z: 8.5 },
            worldFacts: { timeOfDay: () => 14000 }
        });
        night.tick(3);
        expect(night.holderOf('move')).toBe('minecraft:behavior.sleep');
        expect(states).toContain(true);
    });
});

describe('minecraft:behavior.nap', () => {
    it('refuses while a mob it does not except is near, and naps when alone', () => {
        const fox = testMob('fox', { x: 2, y: 1, z: 0 });

        const crowded = new GoalHarness({
            goals: { 'minecraft:behavior.nap': { priority: 8, mob_detect_dist: 6 } },
            world: { mobs: () => [fox] }
        });
        crowded.tick();
        expect(crowded.running()).toEqual([]);

        const alone = new GoalHarness({
            goals: { 'minecraft:behavior.nap': { priority: 8, mob_detect_dist: 6 } },
            world: { mobs: () => [] }
        });
        alone.tick();
        expect(alone.holderOf('move')).toBe('minecraft:behavior.nap');
    });
});

describe('minecraft:behavior.eat_block', () => {
    it('replaces the block it ate once the animation is over', () => {
        const writes: { readonly position: EntityPosition; readonly identifier: string }[] = [];
        const harness = new GoalHarness({
            goals: {
                'minecraft:behavior.eat_block': {
                    priority: 6,
                    time_until_eat: 0.5,
                    eat_and_replace_block_pairs: [
                        { eat_block: 'minecraft:short_grass', replace_block: 'minecraft:air' }
                    ]
                }
            },
            world: {
                blocks: () => [{ position: { x: 0, y: 0, z: 0 }, identifier: 'minecraft:short_grass' }],
                setBlock: (position, identifier) => writes.push({ position, identifier })
            },
            random: () => 0
        });

        harness.tick(12);

        expect(writes).toHaveLength(1);
        expect(writes[0]?.identifier).toBe('minecraft:air');
    });

    it('does nothing when there is no grass under it', () => {
        const harness = new GoalHarness({
            goals: {
                'minecraft:behavior.eat_block': {
                    priority: 6,
                    eat_and_replace_block_pairs: [
                        { eat_block: 'minecraft:short_grass', replace_block: 'minecraft:dirt' }
                    ]
                }
            },
            world: { blocks: () => [] },
            random: () => 0
        });

        harness.tick(5);

        expect(harness.running()).toEqual([]);
    });
});

describe('minecraft:behavior.random_sitting', () => {
    it('sits for at least min_sit_time before it may stand up', () => {
        const states: boolean[] = [];
        const harness = new GoalHarness({
            goals: {
                'minecraft:behavior.random_sitting': {
                    priority: 5,
                    start_chance: 1,
                    stop_chance: 1,
                    min_sit_time: 0.5
                }
            },
            world: { setSitting: (sitting) => states.push(sitting) }
        });

        harness.tick(3);
        expect(states).toEqual([true]);

        harness.tick(12);
        expect(states).toEqual([true, false, true]);
    });
});

describe('minecraft:behavior.play_dead', () => {
    it('plays dead after a damage cause it listens for', () => {
        const harness = new GoalHarness({
            goals: {
                'minecraft:behavior.play_dead': {
                    priority: 0,
                    duration: 0.5,
                    random_start_chance: 1,
                    damage_sources: ['entity_attack']
                }
            },
            world: { damagers: () => [{ mob: undefined, cause: 'entity_attack', total: 4 }] }
        });

        harness.tick();

        expect(harness.holderOf('move')).toBe('minecraft:behavior.play_dead');
    });

    it('ignores a cause it does not list', () => {
        const harness = new GoalHarness({
            goals: {
                'minecraft:behavior.play_dead': {
                    priority: 0,
                    random_start_chance: 1,
                    damage_sources: ['entity_attack']
                }
            },
            world: { damagers: () => [{ mob: undefined, cause: 'drowning', total: 1 }] }
        });

        harness.tick();

        expect(harness.running()).toEqual([]);
    });
});
