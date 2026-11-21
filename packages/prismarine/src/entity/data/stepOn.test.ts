import { describe, expect, it } from 'vitest';

import { entityFixture, FLOOR_Y, TestEntityWorld } from './testing';

/** A body that stands where it is put: a collision box and nothing that moves it. */
const POST = 'jsprismarine:post';

const fixture = () => {
    const world = new TestEntityWorld();
    const built = entityFixture(
        world,
        {},
        {
            [POST]: { components: { 'minecraft:collision_box': { width: 0.6, height: 1.8 } } }
        }
    );
    const post = built.runtime.spawn(POST, { x: 0.5, y: FLOOR_Y + 1, z: 0.5 });
    if (post === undefined) throw new TypeError('the fixture declares no post');
    const tick = () => {
        world.advance(1);
        built.runtime.tick(world.world.level.gameTime());
    };
    return { ...built, world, post, tick };
};

describe("a body moving into a block, Java's Entity.checkInsideBlocks", () => {
    it('steps on each block its box moves into, once, and not again while it stays', () => {
        const { world, post, tick } = fixture();

        tick();
        expect(world.stepOns).toEqual([
            { at: { x: 0, y: FLOOR_Y + 1, z: 0 }, entity: post.id },
            { at: { x: 0, y: FLOOR_Y + 2, z: 0 }, entity: post.id }
        ]);

        tick();
        expect(world.stepOns).toHaveLength(2);

        // Straddling the next block east, it is in both columns, and only the new one is stepped on.
        post.body.position = { x: 1, y: FLOOR_Y + 1, z: 0.5 };
        tick();
        expect(world.stepOns.slice(2)).toEqual([
            { at: { x: 1, y: FLOOR_Y + 1, z: 0 }, entity: post.id },
            { at: { x: 1, y: FLOOR_Y + 2, z: 0 }, entity: post.id }
        ]);
    });
});
