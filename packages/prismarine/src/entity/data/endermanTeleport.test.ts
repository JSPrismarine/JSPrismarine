import { describe, expect, it } from 'vitest';

import { entityFixture, FLOOR_Y, TestEntityWorld } from './testing';

const DEFINITIONS = {
    'minecraft:enderman': {
        components: {
            'minecraft:health': { value: 40, max: 40 },
            'minecraft:collision_box': { width: 0.6, height: 2.9 },
            'minecraft:teleport': {
                random_teleports: false,
                random_teleport_cube: [32, 32, 32],
                teleports_on_projectile_hit: true
            }
        }
    },
    'jsprismarine:arrow': {
        components: {
            'minecraft:collision_box': { width: 0.25, height: 0.25 },
            'minecraft:physics': { has_gravity: false },
            'minecraft:projectile': { on_hit: { impact_damage: { damage: 2 } } }
        }
    }
};

/** Shoots an enderman standing on the floor, in a world whose random draws `random`. */
const shoot = (random: readonly number[]) => {
    const world = new TestEntityWorld({ random });
    const { runtime } = entityFixture(world, {}, DEFINITIONS);
    const enderman = runtime.spawn('minecraft:enderman', { x: 0.5, y: FLOOR_Y + 1, z: 0.5 });
    const arrow = runtime.spawn('jsprismarine:arrow', { x: -2.5, y: FLOOR_Y + 2.5, z: 0.5 });
    if (enderman === undefined || arrow === undefined) throw new Error('the fixture spawned no enderman or arrow');
    arrow.body.velocity = { x: 1.5, y: 0, z: 0 };
    for (let tick = 1; tick <= 4; tick += 1) runtime.tick(tick);
    return { world, enderman };
};

describe("an enderman's projectile dodge", () => {
    it("lands on the ground under the drawn spot, as Java's LivingEntity.randomTeleport drops it", () => {
        // Every draw is 0.75: 16 blocks east and south, and 16 up, from where it drops to the floor.
        const { world, enderman } = shoot([0.75]);
        expect(enderman.position.x).toBeCloseTo(16.5);
        expect(enderman.position.z).toBeCloseTo(16.5);
        expect(enderman.position.y).toBe(FLOOR_Y + 1);
        expect(enderman.instance.attributes.value('health')).toBe(40);
        expect(
            world.gameEvents.some((event) => event.event === 'minecraft:teleport' && event.sourceId === enderman.id)
        ).toBe(true);
    });
});
