import { describe, expect, it, vi } from 'vitest';

import { BLOCK_UPDATE_BUDGET_PER_TICK, BlockUpdateScheduler } from './BlockUpdateScheduler';
import type { BlockUpdate } from './BlockUpdateScheduler';
import { World } from './World';

/**
 * A world reduced to its block update queue and a physics pass that records what it was asked.
 *
 * Built on the real prototype, so `runBlockUpdates` is the code under test. Every other update
 * resolves at once, as a state-changing update does, so the run awaits the way it does live.
 */
const worldWithBlockUpdates = (queued: number) => {
    let tick = 0;
    const visited: BlockUpdate[] = [];
    const blockUpdates = new BlockUpdateScheduler();
    for (let x = 0; x < queued; x++) blockUpdates.schedule(x, 64, 0, 0);

    const world: World = Object.assign(Object.create(World.prototype), {
        blockUpdates,
        physics: {
            update: (x: number, y: number, z: number) => {
                visited.push({ x, y, z });
                return x % 2 === 0 ? Promise.resolve() : undefined;
            }
        },
        getTicks: () => tick
    });

    return {
        visited,
        blockUpdates,
        runTick: async (next: number) => {
            tick = next;
            await world['runBlockUpdates']();
        }
    };
};

/** Clocks a host might report: none at all, and one that loses a second on every read. */
const clocks: ReadonlyArray<readonly [string, () => () => number]> = [
    [
        'a clock that throws',
        () => () => {
            throw new Error('the block update phase read the clock');
        }
    ],
    [
        'a clock a second slower on every read',
        () => {
            let now = 0;
            return () => (now += 1000);
        }
    ]
];

describe('World block updates', () => {
    it.each(clocks)('runs the count budget and carries the rest under %s', async (_name, clockOf) => {
        const overflow = 5;
        const { visited, blockUpdates, runTick } = worldWithBlockUpdates(BLOCK_UPDATE_BUDGET_PER_TICK + overflow);

        const read = vi.spyOn(performance, 'now').mockImplementation(clockOf());
        try {
            await runTick(1);
            expect(visited).toHaveLength(BLOCK_UPDATE_BUDGET_PER_TICK);
            expect(blockUpdates.size()).toBe(overflow);

            await runTick(2);
        } finally {
            read.mockRestore();
        }

        // The remainder runs on the next tick, in the order it was queued.
        expect(visited.slice(BLOCK_UPDATE_BUDGET_PER_TICK).map(({ x }) => x)).toEqual(
            Array.from({ length: overflow }, (_unused, index) => BLOCK_UPDATE_BUDGET_PER_TICK + index)
        );
        expect(blockUpdates.size()).toBe(0);
    });
});
