import { Navigator, navigationProfile } from '@jsprismarine/entity-goals';
import { describe, expect, it } from 'vitest';

import { brainEntityOf, brainWorldOf } from './brainWorld';
import type { DataEntity } from './DataEntity';
import type { ExtraEntities } from './testing';
import { entityFixture, FLOOR_Y, TestEntityWorld } from './testing';

/** Where a body on the fixture's stone floor has its feet. */
const GROUND = FLOOR_Y + 1;

/** A walker with a pig's Java move control, at a given width. */
const walker = (width: number) => ({
    components: {
        'minecraft:health': { value: 10, max: 10 },
        'minecraft:movement': { value: 0.25 },
        'minecraft:physics': {},
        'minecraft:jump.static': {},
        'minecraft:navigation.walk': {},
        'minecraft:collision_box': { width, height: 0.9 }
    }
});

/** Walks an entity to a destination with a navigator ticked before each runtime tick, as a goal ticks. */
const walk = (
    extra: ExtraEntities,
    world: TestEntityWorld,
    from: { x: number; y: number; z: number },
    to: { x: number; y: number; z: number },
    ticks: number
): DataEntity => {
    const { runtime } = entityFixture(world, {}, extra);
    const entity = runtime.spawn('minecraft:pig', from);
    if (entity === undefined) throw new Error('the fixture declares no pig');
    const navigator = new Navigator({
        actuator: runtime.actuatorFor(entity.instance),
        navigation: () => runtime.navigation(),
        profile: () => navigationProfile(entity.instance)
    });
    expect(navigator.moveTo(to, 1, 0)).toBe(true);
    for (let tick = 1; tick <= ticks && navigator.tick(); tick += 1) runtime.tick(tick);
    return entity;
};

describe('a walker following a path', () => {
    it.each([0.6, 0.9, 1.4])('walks down a one-block step at width %s', (width) => {
        const world = new TestEntityWorld();
        // A raised floor at x 0 to 3 and the open ground beyond it, one block lower.
        for (let x = -2; x <= 3; x += 1)
            for (let z = -2; z <= 3; z += 1) world.setBlock({ x, y: GROUND, z }, 'minecraft:stone');

        const entity = walk(
            { 'minecraft:pig': walker(width) },
            world,
            { x: 1.5, y: GROUND + 1, z: 0.5 },
            { x: 7.5, y: GROUND, z: 0.5 },
            200
        );

        expect(entity.position.y).toBeCloseTo(GROUND, 6);
        expect(entity.position.x).toBeGreaterThan(6.5);
    });
});

describe("a brain's random walk target", () => {
    /** A world whose random source hands out the draws a test queues, then a half. */
    const drawn = () => {
        const queue: number[] = [];
        const next = () => queue.shift() ?? 0.5;
        const world = new TestEntityWorld({
            random: { nextFloat: next, nextInt: (bound) => Math.floor(next() * bound) }
        });
        const { runtime } = entityFixture(world, {}, { 'minecraft:pig': walker(0.9) });
        const pig = runtime.spawn('minecraft:pig', { x: 0.5, y: GROUND, z: 0.5 });
        if (pig === undefined) throw new Error('the fixture declares no pig');
        return { queue, runtime, body: brainEntityOf(pig, runtime) };
    };

    it('lands a draw inside the ground on top of it', () => {
        const { queue, runtime, body } = drawn();
        // Four blocks along x, three below the feet, inside the floor.
        queue.push(0.5 + 4 / 20, 0.5 - 3 / 14, 0.5);

        expect(brainWorldOf(runtime).randomPos(body, { xzRange: 10, yRange: 7, medium: 'land' })).toEqual({
            x: 4.5,
            y: GROUND,
            z: 0.5
        });
    });

    it('refuses a land draw in the air', () => {
        const { queue, runtime, body } = drawn();
        for (let attempt = 0; attempt < 10; attempt += 1) queue.push(0.5 + 4 / 20, 0.5 + 3 / 14, 0.5);

        expect(brainWorldOf(runtime).randomPos(body, { xzRange: 10, yRange: 7, medium: 'land' })).toBeUndefined();
    });

    it('draws away from what it flees', () => {
        const { queue, runtime, body } = drawn();
        // Five blocks toward the threat, which the draw turns away from it.
        queue.push(0.5 + 5 / 20, 0.5, 0.5);

        const to = brainWorldOf(runtime).randomPos(body, {
            xzRange: 10,
            yRange: 7,
            medium: 'land',
            away: { x: 6.5, y: GROUND, z: 0.5 }
        });

        expect(to).toEqual({ x: -4.5, y: GROUND, z: 0.5 });
    });
});

describe('a walker that looks one way and walks another', () => {
    it('walks where its path goes, with its head turned no more than 75 degrees from its body', () => {
        const { runtime } = entityFixture(new TestEntityWorld(), {}, { 'minecraft:pig': walker(0.9) });
        const pig = runtime.spawn('minecraft:pig', { x: 0.5, y: GROUND, z: 0.5 });
        if (pig === undefined) throw new Error('the fixture declares no pig');

        for (let tick = 1; tick <= 40; tick += 1) {
            // A look at something behind it, as a look goal runs beside a stroll.
            pig.body.lookAt({ x: pig.position.x - 10, y: GROUND + 1, z: pig.position.z });
            pig.body.moveTo({ x: 20.5, y: GROUND, z: 0.5 }, 1);
            runtime.tick(tick);
            const turn = Math.abs(((pig.body.headYaw - pig.body.yaw + 540) % 360) - 180);
            expect(turn).toBeLessThanOrEqual(75 + 1e-9);
        }

        expect(pig.position.x).toBeGreaterThan(3);
        expect(Math.abs(pig.position.z - 0.5)).toBeLessThan(1e-6);
    });

    it('turns its body after its head while it stands', () => {
        const { runtime } = entityFixture(new TestEntityWorld(), {}, { 'minecraft:pig': walker(0.9) });
        const pig = runtime.spawn('minecraft:pig', { x: 0.5, y: GROUND, z: 0.5 });
        if (pig === undefined) throw new Error('the fixture declares no pig');

        pig.body.lookAt({ x: 0.5, y: GROUND + 1, z: 10.5 });
        runtime.tick(1);

        expect(pig.body.yaw).toBeCloseTo(pig.body.headYaw, 9);
    });
});
