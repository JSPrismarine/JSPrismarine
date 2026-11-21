import { describe, expect, it } from 'vitest';

import type { EntityWorldFacts } from './host';
import { FLOOR_Y, TestEntityWorld, entityFixture } from './testing';

/** A test world that counts the block reads the runtime makes of it. */
class CountingWorld extends TestEntityWorld {
    public reads = 0;

    public override get world(): EntityWorldFacts {
        const facts = super.world;
        return {
            ...facts,
            blocks: {
                ...facts.blocks,
                get: (at) => {
                    this.reads += 1;
                    return facts.blocks.get(at);
                }
            }
        };
    }
}

/** A pig the size of a horse, whose box overlaps eight cells: two columns each way, two high. */
const PIG = {
    components: {
        'minecraft:health': { value: 10, max: 10 },
        'minecraft:collision_box': { width: 1.4, height: 1.6 },
        'minecraft:physics': {}
    }
};

/** Pigs standing on the floor, which have Java stats and so feel the cold, and nothing to do. */
const standingPigs = (count: number) => {
    const world = new CountingWorld();
    const fixture = entityFixture(world, {}, { 'minecraft:pig': PIG });
    const pigs = Array.from({ length: count }, (_, index) => {
        const pig = fixture.runtime.spawn('minecraft:pig', { x: index * 4 + 0.5, y: FLOOR_Y + 1, z: 0.5 });
        if (pig === undefined) throw new Error('the fixture declares minecraft:pig');
        return pig;
    });
    let tick = 0;
    const run = (ticks: number): void => {
        for (let step = 0; step < ticks; step += 1) {
            tick += 1;
            world.advance();
            fixture.runtime.tick(tick);
        }
    };
    return { world, fixture, pigs, run };
};

describe('what a body stands in', () => {
    it('reads no block of its box for the medium, the cold or the cobweb of a body standing still', () => {
        const pigCount = 10;
        const ticks = 20;
        const { world, pigs, run } = standingPigs(pigCount);
        run(5);
        const before = pigs.map((pig) => pig.position);

        world.reads = 0;
        run(ticks);

        expect(pigs.map((pig) => pig.position)).toEqual(before);
        // What is left each tick is outside the box: the four support cells under the feet, which
        // this world's navigation view reads again each tick for want of chunk revisions, and the
        // feet's friction and climbable block. Before the cold and the cobweb shared one kept
        // walk, each read the box's eight cells past the navigation memo too: 4800 reads.
        expect(world.reads).toBeLessThanOrEqual(pigCount * ticks * 6);
    });

    it('starts the cold on the tick powder snow is placed around a body standing still', () => {
        const { world, fixture, pigs, run } = standingPigs(1);
        const [pig] = pigs;
        if (pig === undefined) throw new Error('no pig');
        run(5);
        expect(fixture.runtime.frozenTicksOf(pig.id)).toBe(0);

        world.setBlock({ x: 0, y: FLOOR_Y + 1, z: 0 }, 'minecraft:powder_snow');
        run(3);

        expect(fixture.runtime.frozenTicksOf(pig.id)).toBe(3);

        world.setBlock({ x: 0, y: FLOOR_Y + 1, z: 0 }, 'minecraft:air');
        run(1);

        expect(fixture.runtime.frozenTicksOf(pig.id)).toBe(1);
    });

    it('sets in_water on the tick water is placed around a body standing still', () => {
        const { world, pigs, run } = standingPigs(1);
        const [pig] = pigs;
        if (pig === undefined) throw new Error('no pig');
        run(5);
        expect(pig.body.conditions.has('in_water')).toBe(false);

        world.setBlock({ x: 0, y: FLOOR_Y + 1, z: 0 }, 'minecraft:water');
        run(1);

        expect(pig.body.conditions.has('in_water')).toBe(true);
    });
});
