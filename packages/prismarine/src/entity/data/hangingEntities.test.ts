import { describe, expect, it } from 'vitest';

import { FLOOR_Y, TestEntityWorld, entityFixture } from './testing';

const WALL = { x: 0, y: FLOOR_Y + 2, z: 0 };

/** A painting hung on the south face of a stone block, run for some ticks after `change`. */
const hungPainting = (change: (world: TestEntityWorld) => void, ticks: number) => {
    const world = new TestEntityWorld();
    const { runtime } = entityFixture(world);
    world.setBlock(WALL, 'minecraft:stone');
    const painting = runtime.spawn('minecraft:painting', { x: 0.5, y: FLOOR_Y + 2, z: 1.03 });
    if (painting === undefined) throw new Error('the fixture spawned no painting');
    change(world);
    let gone: number | undefined;
    for (let tick = 1; tick <= ticks && gone === undefined; tick += 1) {
        runtime.tick(tick);
        if (runtime.byId(painting.id) === undefined) gone = tick;
    }
    return { world, gone };
};

describe('a painting', () => {
    it('hangs on while its wall stands', () => {
        expect(hungPainting(() => undefined, 250).gone).toBeUndefined();
    });

    it("breaks on Java's check after its wall goes, and drops a painting", () => {
        const { world, gone } = hungPainting((world) => world.setBlock(WALL, 'minecraft:air'), 250);
        expect(gone).toBe(101);
        expect(world.drops.map((drop) => drop.item.identifier)).toEqual(['minecraft:painting']);
    });

    it('does not fall, since nothing but its wall holds it', () => {
        const world = new TestEntityWorld();
        const { runtime } = entityFixture(world);
        world.setBlock(WALL, 'minecraft:stone');
        const painting = runtime.spawn('minecraft:painting', { x: 0.5, y: FLOOR_Y + 2, z: 1.03 });
        for (let tick = 1; tick <= 40; tick += 1) runtime.tick(tick);
        expect(painting?.position.y).toBe(FLOOR_Y + 2);
    });
});
