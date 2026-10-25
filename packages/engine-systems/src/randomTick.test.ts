import { describe, expect, it } from 'vitest';

import { BlockRandomPositions, DEFAULT_RANDOM_TICK_SPEED, drawSectionPositions, runRandomTicks } from './randomTick';
import { createTestWorld } from './testWorld';
import type { BlockPosition } from './world';
import { block, positionKey } from './world';

describe('BlockRandomPositions', () => {
    it('defaults to Java random_tick_speed of 3', () => {
        expect(DEFAULT_RANDOM_TICK_SPEED).toBe(3);
    });

    it('reproduces the first draw of Java getBlockRandomPos from a zero seed', () => {
        // Worked by hand from `Level.getBlockRandomPos`: 0 * 3 + 1013904223 is
        // 1013904223, shifted right by 2 is 253476055. Its low four bits are 7,
        // bits 16 to 19 are 11 and bits 8 to 11 are 12.
        expect(new BlockRandomPositions().next(0, 0, 0)).toEqual({ x: 7, y: 11, z: 12 });
    });

    it('offsets every draw by the section corner', () => {
        const base = new BlockRandomPositions().next(0, 0, 0);
        const moved = new BlockRandomPositions().next(32, -64, 16);

        expect(moved).toEqual({ x: base.x + 32, y: base.y - 64, z: base.z + 16 });
    });

    it('keeps every draw inside the 16 by 16 by 16 section', () => {
        const positions = new BlockRandomPositions();
        for (let i = 0; i < 5000; i++) {
            const at = positions.next(0, 0, 0);
            expect(at.x).toBeGreaterThanOrEqual(0);
            expect(at.x).toBeLessThan(16);
            expect(at.y).toBeGreaterThanOrEqual(0);
            expect(at.y).toBeLessThan(16);
            expect(at.z).toBeGreaterThanOrEqual(0);
            expect(at.z).toBeLessThan(16);
        }
    });

    it('reaches all 4096 positions of a section over many chunk ticks', () => {
        const positions = new BlockRandomPositions();
        const seen = new Set<string>();
        // Twenty draws per position on average, which is 27307 chunk ticks at
        // Java's speed of 3. The generator's multiplier is 3, so it needs the
        // headroom: 20481 draws still leave 27 positions untouched.
        for (let tick = 0; tick < 27307; tick++) {
            for (const at of drawSectionPositions(positions, { x: 0, y: 0, z: 0 })) seen.add(positionKey(at));
        }

        expect(seen.size).toBe(4096);
    });

    it('spreads the y coordinate evenly across the section', () => {
        const positions = new BlockRandomPositions();
        const counts = new Array<number>(16).fill(0);
        const draws = 16000;
        for (let i = 0; i < draws; i++) counts[positions.next(0, 0, 0).y]! += 1;

        const expected = draws / 16;
        for (const count of counts) {
            expect(count).toBeGreaterThan(expected * 0.85);
            expect(count).toBeLessThan(expected * 1.15);
        }
    });
});

describe('runRandomTicks', () => {
    it('draws random_tick_speed positions per section and skips blocks that do not tick', () => {
        const world = createTestWorld();
        // Lava is the one block in this package that takes random ticks.
        world.place({ x: 7, y: 11, z: 12 }, block('minecraft:lava'));

        const ticked: BlockPosition[] = [];
        const ran = runRandomTicks(world, new BlockRandomPositions(), [{ x: 0, y: 0, z: 0 }], (at) => ticked.push(at));

        expect(ran).toBe(1);
        expect(ticked).toEqual([{ x: 7, y: 11, z: 12 }]);
    });

    it('draws nothing when the tick speed is zero', () => {
        const world = createTestWorld();
        world.place({ x: 7, y: 11, z: 12 }, block('minecraft:lava'));

        expect(runRandomTicks(world, new BlockRandomPositions(), [{ x: 0, y: 0, z: 0 }], () => {}, 0)).toBe(0);
    });

    it('can draw the same position twice in one chunk tick', () => {
        const positions = new BlockRandomPositions();
        let repeats = 0;
        for (let tick = 0; tick < 20000; tick++) {
            const drawn = drawSectionPositions(positions, { x: 0, y: 0, z: 0 }).map(positionKey);
            if (new Set(drawn).size < drawn.length) repeats++;
        }

        expect(repeats).toBeGreaterThan(0);
    });
});
