import { describe, expect, it } from 'vitest';

import type { TestWorldOptions } from './testing';
import { FLOOR_Y, TestEntityWorld, entityFixture } from './testing';

const GROUND = { x: 0.5, y: FLOOR_Y + 1, z: 0.5 };

/** Ticks in a day. */
const DAY = 24_000;

/** A hard world a hundred days old under a full moon, whose chunks players lived in for 50 hours. */
const RAMPED: TestWorldOptions = { difficulty: 'hard', gameTime: 100 * 8 * DAY, inhabitedTime: 3_600_000 };

/**
 * A zombie-like mob whose spawn event always adds its door-breaking group, as Bedrock's zombie
 * does on one draw in ten, and whose pickup goal rolls Java's `canPickUpLoot`.
 */
const doorZombie = (options: TestWorldOptions) => {
    const world = new TestEntityWorld({ random: [0.05], ...options });
    const { runtime } = entityFixture(
        world,
        {},
        {
            'jsprismarine:door_zombie': {
                components: {
                    'minecraft:health': { value: 20, max: 20 },
                    'minecraft:collision_box': { width: 0.6, height: 1.95 },
                    'minecraft:behavior.pickup_items': { priority: 6, max_dist: 0, pickup_based_on_chance: true }
                },
                component_groups: { 'jsprismarine:can_break_doors': { 'minecraft:annotation.break_door': {} } },
                events: {
                    'minecraft:entity_spawned': {
                        randomize: [{ weight: 1, add: { component_groups: ['jsprismarine:can_break_doors'] } }]
                    }
                }
            }
        }
    );
    const zombie = runtime.spawn('jsprismarine:door_zombie', GROUND);
    if (zombie === undefined) throw new Error('the fixture declares no jsprismarine:door_zombie');
    return { runtime, zombie };
};

describe("Java's regional rolls at spawn", () => {
    it('leaves a zombie in a fresh region unable to break doors or pick up loot, whatever Bedrock drew', () => {
        // A fresh normal world sits at 2 * 0.75 = 1.5, below the 2 a special multiplier needs.
        const { runtime, zombie } = doorZombie({ difficulty: 'normal' });
        expect(zombie.instance.hasComponent('minecraft:annotation.break_door')).toBe(false);
        expect(runtime.canPickUpLoot(zombie.body)).toBe(false);
    });

    it('lets a zombie in a long-inhabited chunk of an old hard world break doors and pick up loot', () => {
        // The special multiplier is 1 there, so the chances are Java's 0.1 and 0.55, and the
        // world's draws are all 0.05.
        const { runtime, zombie } = doorZombie(RAMPED);
        expect(zombie.instance.hasComponent('minecraft:annotation.break_door')).toBe(true);
        expect(runtime.canPickUpLoot(zombie.body)).toBe(true);
    });

    it('reads the inhabited time of the chunk the zombie spawns in', () => {
        // A fresh hard world sits at 3 * 0.75 = 2.25 and a special multiplier of 0.125, so the 0.05
        // draw fails Java's 0.0125; a chunk players lived in for 50 hours sits at 5.25 and 1.
        expect(doorZombie({ difficulty: 'hard' }).zombie.instance.hasComponent('minecraft:annotation.break_door')).toBe(
            false
        );
        const lived = doorZombie({ difficulty: 'hard', inhabitedTime: 3_600_000 });
        expect(lived.zombie.instance.hasComponent('minecraft:annotation.break_door')).toBe(true);
    });
});
