import { describe, expect, it } from 'vitest';

import { assembleChickenJockey, CHICKEN_JOCKEY_RIDERS } from './chickenJockey';
import type { ChickenJockeyHost } from './chickenJockey';
import { entityFixture, FLOOR_Y, TestEntityWorld } from './testing';

/** A host that replays rolls and records what the rule asked of it. */
const host = (rolls: readonly number[], free: readonly string[]) => {
    const asked = { mounted: [] as string[], spawned: 0, rolls: 0 };
    const next = [...rolls];
    const world: ChickenJockeyHost<string> = {
        nextFloat: () => {
            asked.rolls += 1;
            return next.shift() ?? 1;
        },
        freeChickens: () => free,
        spawnChicken: () => {
            asked.spawned += 1;
            return 'spawned chicken';
        },
        mount: (chicken) => asked.mounted.push(chicken)
    };
    return { world, asked };
};

describe('assembleChickenJockey', () => {
    it('seats the baby on the first free chicken when the first roll is under 0.05', () => {
        const { world, asked } = host([0.04], ['near chicken', 'far chicken']);
        expect(assembleChickenJockey(world)).toBe('near chicken');
        expect(asked).toEqual({ mounted: ['near chicken'], spawned: 0, rolls: 1 });
    });

    it('leaves the baby on foot when the first roll wins and no chicken is free, without a second roll', () => {
        const { world, asked } = host([0.04, 0.01], []);
        expect(assembleChickenJockey(world)).toBeUndefined();
        expect(asked).toEqual({ mounted: [], spawned: 0, rolls: 1 });
    });

    it('spawns a chicken under the baby when only the second roll is under 0.05', () => {
        const { world, asked } = host([0.05, 0.04], ['near chicken']);
        expect(assembleChickenJockey(world)).toBe('spawned chicken');
        expect(asked).toEqual({ mounted: ['spawned chicken'], spawned: 1, rolls: 2 });
    });

    it('gives the baby no chicken when both rolls miss', () => {
        const { world, asked } = host([0.05, 0.05], ['near chicken']);
        expect(assembleChickenJockey(world)).toBeUndefined();
        expect(asked).toEqual({ mounted: [], spawned: 0, rolls: 2 });
    });

    it("rolls for Java's Zombie and every class that extends it", () => {
        expect([...CHICKEN_JOCKEY_RIDERS].sort()).toEqual([
            'minecraft:drowned',
            'minecraft:husk',
            'minecraft:zombie',
            'minecraft:zombie_pigman',
            'minecraft:zombie_villager_v2'
        ]);
    });
});

const box = { 'minecraft:collision_box': { width: 0.6, height: 0.9 } };

/** A baby zombie, and an adult chicken with a seat, as the vanilla files have them once spawned. */
const JOCKEY_ENTITIES = {
    'minecraft:zombie': { components: { ...box, 'minecraft:is_baby': {} } },
    'minecraft:husk': { components: { ...box } },
    'minecraft:chicken': {
        components: {
            'minecraft:collision_box': { width: 0.6, height: 0.8 },
            'minecraft:rideable': { seat_count: 1, family_types: ['zombie'], seats: { position: [0, 0.5, 0] } }
        }
    }
};

const jockeyFixture = (random: readonly number[]) =>
    entityFixture(new TestEntityWorld({ random }), {}, JOCKEY_ENTITIES);

describe('a baby zombie spawning', () => {
    it('climbs onto a free chicken beside it on a winning first roll', () => {
        const { runtime } = jockeyFixture([0.01]);
        const chicken = runtime.spawn('minecraft:chicken', { x: 3.5, y: FLOOR_Y + 1, z: 0.5 });
        const zombie = runtime.spawn('minecraft:zombie', { x: 0.5, y: FLOOR_Y + 1, z: 0.5 });
        expect(zombie && runtime.vehicleOf(zombie.body)?.id).toBe(chicken?.id);
    });

    it('leaves a chicken already carrying a rider alone', () => {
        const { runtime } = jockeyFixture([0.01]);
        runtime.spawn('minecraft:chicken', { x: 3.5, y: FLOOR_Y + 1, z: 0.5 });
        const first = runtime.spawn('minecraft:zombie', { x: 0.5, y: FLOOR_Y + 1, z: 0.5 });
        const second = runtime.spawn('minecraft:zombie', { x: 0.5, y: FLOOR_Y + 1, z: 0.5 });
        expect(first && runtime.vehicleOf(first.body)).toBeDefined();
        expect(second && runtime.vehicleOf(second.body)).toBeUndefined();
    });

    it('ignores a chicken beyond the 5 blocks Java searches', () => {
        const { runtime } = jockeyFixture([0.01]);
        runtime.spawn('minecraft:chicken', { x: 7.5, y: FLOOR_Y + 1, z: 0.5 });
        const zombie = runtime.spawn('minecraft:zombie', { x: 0.5, y: FLOOR_Y + 1, z: 0.5 });
        expect(zombie && runtime.vehicleOf(zombie.body)).toBeUndefined();
    });

    it('gets a chicken spawned under it when only the second roll wins', () => {
        const { runtime } = jockeyFixture([0.5, 0.01]);
        const zombie = runtime.spawn('minecraft:zombie', { x: 0.5, y: FLOOR_Y + 1, z: 0.5 });
        const vehicle = zombie && runtime.vehicleOf(zombie.body);
        expect(vehicle?.identifier?.()).toBe('minecraft:chicken');
    });

    it('never makes an adult, or a mob Java does not roll for, a jockey', () => {
        const { runtime } = jockeyFixture([0.01]);
        runtime.spawn('minecraft:chicken', { x: 3.5, y: FLOOR_Y + 1, z: 0.5 });
        const husk = runtime.spawn('minecraft:husk', { x: 0.5, y: FLOOR_Y + 1, z: 0.5 });
        expect(husk && runtime.vehicleOf(husk.body)).toBeUndefined();
    });
});
