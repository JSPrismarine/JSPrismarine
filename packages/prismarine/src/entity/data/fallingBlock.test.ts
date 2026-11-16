import { describe, expect, it } from 'vitest';

import { FLOOR_Y, TestEntityWorld, entityFixture } from './testing';

const FALLING = 'minecraft:falling_block';
const HEAVY = 'test:heavy_block';

/** A falling block whose stone hurts what it lands in, as the overlay writes an anvil's. */
const heavyBlock = {
    components: {
        'minecraft:collision_box': { width: 0.98, height: 0.98 },
        'jsprismarine:falling_block': {
            gravity: 0.04,
            drag: 0.02,
            hurts_entities: { 'minecraft:stone': { per_block: 2, max: 40 } }
        }
    }
};

const fixture = () => entityFixture(new TestEntityWorld(), {}, { [HEAVY]: heavyBlock });

describe('a falling block', () => {
    it("falls by Java's gravity before its drag, 0.04 in the first tick and 0.0792 in the second", () => {
        const { runtime } = fixture();
        const start = FLOOR_Y + 11;
        const block = runtime.spawn(FALLING, { x: 0.5, y: start, z: 0.5 }, { data: { block: 'minecraft:stone' } });
        if (block === undefined) throw new Error('the fixture spawned no falling block');

        runtime.tick(1);
        expect(start - block.position.y).toBeCloseTo(0.04, 12);
        runtime.tick(2);
        expect(start - block.position.y).toBeCloseTo(0.04 + 0.04 * 0.98 + 0.04, 12);
    });

    it('breaks into its item on a torch, which it cannot replace, and leaves the torch', () => {
        const { runtime, world } = fixture();
        const torch = { x: 0, y: FLOOR_Y + 1, z: 0 };
        world.setBlock(torch, 'minecraft:torch');
        runtime.spawn(FALLING, { x: 0.5, y: FLOOR_Y + 4, z: 0.5 }, { data: { block: 'minecraft:stone' } });
        for (let tick = 1; tick <= 40; tick += 1) runtime.tick(tick);

        expect(world.world.blocks.get(torch)?.identifier).toBe('minecraft:torch');
        expect(world.drops.map((drop) => drop.item.identifier)).toEqual(['minecraft:stone']);
    });

    it('hurts what it lands in by 2 for each block fallen past the first', () => {
        const { runtime, world } = fixture();
        const cow = runtime.spawn('minecraft:cow', { x: 0.5, y: FLOOR_Y + 1, z: 0.5 });
        runtime.spawn(HEAVY, { x: 0.5, y: FLOOR_Y + 6, z: 0.5 }, { data: { block: 'minecraft:stone' } });
        for (let tick = 1; tick <= 40; tick += 1) {
            if (cow !== undefined) cow.body.position = { x: 0.5, y: FLOOR_Y + 1, z: 0.5 };
            runtime.tick(tick);
        }

        const blows = world.commits.filter((commit) => commit.target.id === cow?.id);
        expect(blows.map((blow) => [blow.intent.cause, blow.intent.amount])).toEqual([['anvil', 8]]);
    });
});
