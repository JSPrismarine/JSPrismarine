import { describe, expect, it } from 'vitest';

import type { TestWorldOptions } from './testing';
import { FLOOR_Y, TestEntityWorld, entityFixture } from './testing';

const GROUND = { x: 0.5, y: FLOOR_Y + 1, z: 0.5 };

/** Ticks in a day. */
const DAY = 24_000;

/** A hard world a hundred days old under a full moon, whose chunks players lived in for 50 hours. */
const RAMPED: TestWorldOptions = { difficulty: 'hard', gameTime: 100 * 8 * DAY, inhabitedTime: 3_600_000 };

/** A zombie-like mob whose pickup goal rolls Java's `canPickUpLoot`. */
const lootZombie = (options: TestWorldOptions) => {
    const world = new TestEntityWorld({ random: [0.05], ...options });
    const { runtime } = entityFixture(
        world,
        {},
        {
            'jsprismarine:loot_zombie': {
                components: {
                    'minecraft:health': { value: 20, max: 20 },
                    'minecraft:collision_box': { width: 0.6, height: 1.95 },
                    'minecraft:behavior.pickup_items': { priority: 6, max_dist: 0, pickup_based_on_chance: true }
                }
            }
        }
    );
    const zombie = runtime.spawn('jsprismarine:loot_zombie', GROUND);
    if (zombie === undefined) throw new Error('the fixture declares no jsprismarine:loot_zombie');
    return { runtime, zombie };
};

describe("Java's regional rolls", () => {
    it('leaves a zombie in a fresh region unable to pick up loot', () => {
        // A fresh normal world sits at 2 * 0.75 = 1.5, below the 2 a special multiplier needs.
        const { runtime, zombie } = lootZombie({ difficulty: 'normal' });
        expect(runtime.canPickUpLoot(zombie.body)).toBe(false);
    });

    it('lets a zombie in a long-inhabited chunk of an old hard world pick up loot', () => {
        // The special multiplier is 1 there, so the chance is Java's 0.55, and the
        // world's draws are all 0.05.
        const { runtime, zombie } = lootZombie(RAMPED);
        expect(runtime.canPickUpLoot(zombie.body)).toBe(true);
    });

    it('reads the inhabited time of the chunk the zombie spawns in', () => {
        // A fresh normal world sits at 1.5; a chunk players lived in for 50 hours at 2 * (0.75 + 0.75)
        // = 3, a special multiplier of 0.5 and a chance of 0.275 the 0.05 draw passes.
        const lived = lootZombie({ difficulty: 'normal', inhabitedTime: 3_600_000 });
        expect(lived.runtime.canPickUpLoot(lived.zombie.body)).toBe(true);
    });
});
