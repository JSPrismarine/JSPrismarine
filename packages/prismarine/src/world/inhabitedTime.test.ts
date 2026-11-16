import { describe, expect, it } from 'vitest';

import Chunk from './chunk/Chunk';
import { Dimensions } from './DimensionType';
import { SPAWNING_REACH, playerCloseEnoughForSpawning, tickInhabitedTime } from './inhabitedTime';

/** A player standing at a point, or a spectator there. */
const at = (x: number, z: number, spectator = false) => ({ x, z, spectator });

describe('chunk inhabited time', () => {
    it("counts a chunk whose middle a player stands within Java's 128 blocks of", () => {
        // Chunk 0, 0 has its middle column at 8, 8.
        expect(playerCloseEnoughForSpawning(0, 0, [at(8 + SPAWNING_REACH - 0.5, 8)])).toBe(true);
        expect(playerCloseEnoughForSpawning(0, 0, [at(8 + SPAWNING_REACH, 8)])).toBe(false);
        expect(playerCloseEnoughForSpawning(0, 0, [at(8 + 100, 8 + 100)])).toBe(false);
        expect(playerCloseEnoughForSpawning(0, 0, [at(8, 8, true)])).toBe(false);
    });

    it('advances only the chunks a player is near, one tick at a time', () => {
        const near = new Chunk(0, 0, new Map(), Dimensions.Overworld);
        const far = new Chunk(20, 0, new Map(), Dimensions.Overworld);
        for (let tick = 0; tick < 3; tick += 1) tickInhabitedTime([near, far], [at(0, 0)]);
        tickInhabitedTime([near, far], [at(0, 0, true)]);
        expect(near.getInhabitedTime()).toBe(3);
        expect(far.getInhabitedTime()).toBe(0);
    });

    it('marks a chunk changed once a minute of inhabited time, so the count is saved', () => {
        const chunk = new Chunk(0, 0, new Map(), Dimensions.Overworld);
        chunk.markLoadedFromDisk([], false);
        for (let tick = 0; tick < 1199; tick += 1) chunk.incrementInhabitedTime();
        expect(chunk.getHasChanged()).toBe(false);
        chunk.incrementInhabitedTime();
        expect(chunk.getHasChanged()).toBe(true);
    });
});
