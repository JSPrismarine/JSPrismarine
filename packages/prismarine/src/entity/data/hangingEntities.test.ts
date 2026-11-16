import { describe, expect, it } from 'vitest';

import { hangingState, paintingSightOf } from './hangingEntities';
import { bedrockPaintingMotif, paintingState } from './paintings';
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
        // Java's painting stands at the center of the block it hangs in.
        expect(painting?.position.y).toBe(FLOOR_Y + 2.5);
    });
});

/** A painting placed facing south in front of a stone wall of some blocks, west to east. */
const placedOn = (wall: readonly number[], draws: readonly number[] = [0]) => {
    const world = new TestEntityWorld({ random: draws });
    const { runtime } = entityFixture(world);
    for (const x of wall) world.setBlock({ x, y: FLOOR_Y + 2, z: 0 }, 'minecraft:stone');
    const painting = runtime.spawn(
        'minecraft:painting',
        { x: 0.5, y: FLOOR_Y + 2, z: 1.5 },
        { data: { facing: 'south' } }
    );
    return painting === undefined
        ? undefined
        : {
              painting,
              picture: painting.instance.componentState.get(paintingState),
              sight: paintingSightOf(
                  painting.position,
                  painting.instance.componentState.get(paintingState),
                  painting.instance.componentState.get(hangingState)
              )
          };
};

describe("Java's Painting.create", () => {
    it('hangs the largest placeable picture that fits the wall', () => {
        // The pool is 2 by 1, and a painting facing south runs east from its block.
        expect(placedOn([0, 1])?.picture?.variant).toBe('minecraft:pool');
        expect(placedOn([-1, 0])?.picture?.variant).not.toBe('minecraft:pool');
    });

    it('draws one of the largest at random', () => {
        expect(placedOn([0], [0])?.picture?.variant).toBe('minecraft:kebab');
        expect(placedOn([0], [0.9])?.picture?.variant).toBe('minecraft:aztec');
    });

    it('places nothing where no picture fits', () => {
        expect(placedOn([])).toBeUndefined();
    });

    it('shows a client the center of the face, half a block east for an even width, and the motif', () => {
        const placed = placedOn([0, 1]);
        expect(placed?.sight).toEqual({
            position: { x: 1, y: FLOOR_Y + 2.5, z: 1.03125 },
            direction: 0,
            motif: 'Pool'
        });
    });
});

describe('a painting motif', () => {
    it('names an atlas tile in PascalCase and a picture with its own texture by its file', () => {
        expect(bedrockPaintingMotif('minecraft:skull_and_roses')).toBe('SkullAndRoses');
        expect(bedrockPaintingMotif('minecraft:aztec2')).toBe('Aztec2');
        expect(bedrockPaintingMotif('minecraft:prairie_ride')).toBe('prairie_ride');
    });
});
