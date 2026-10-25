import { describe, expect, it, vi } from 'vitest';

import { ChunkHolder, ChunkNotReadyError, ChunkStepOutOfOrderError } from './ChunkHolder';
import { GENERATION_PYRAMID } from './ChunkPyramid';
import type { ChunkStatus } from './ChunkStatus';
import { ChunkStatusRegressionError, ProtoChunk } from './ProtoChunk';

/** A short column, because these tests read one block and allocating 192 KiB per holder is waste. */
const newChunk = (chunkX: number, chunkZ: number): ProtoChunk =>
    ProtoChunk.create({ chunkX, chunkZ, minY: 0, height: 16 });

const holderAt = (chunkX = 0, chunkZ = 0): ChunkHolder => new ChunkHolder(chunkX, chunkZ, newChunk);

const step = (status: ChunkStatus) => GENERATION_PYRAMID.stepTo(status);

/** Climbs a holder to a status with bodies that do nothing, so a test can start part way up. */
const climbTo = async (holder: ChunkHolder, status: ChunkStatus): Promise<void> => {
    for (const rung of ['empty', 'structure_starts', 'structure_references', 'biomes'] as const) {
        await holder.applyStep(step(rung), (chunk) => chunk);
        if (rung === status) return;
    }
};

describe('running a step exactly once', () => {
    it('runs the body once however many callers ask for the status at the same time', async () => {
        const holder = holderAt();
        const body = vi.fn((chunk: ProtoChunk) => chunk);

        const results = await Promise.all(Array.from({ length: 10 }, () => holder.applyStep(step('empty'), body)));

        expect(body).toHaveBeenCalledTimes(1);
        expect(new Set(results).size).toBe(1);
        expect(holder.status).toBe('empty');
    });

    it('hands back the same promise, so a later caller cannot start a second run', async () => {
        const holder = holderAt();
        const body = vi.fn((chunk: ProtoChunk) => chunk);

        const first = holder.applyStep(step('empty'), body);
        await first;
        const second = holder.applyStep(step('empty'), body);

        expect(second).toBe(first);
        expect(body).toHaveBeenCalledTimes(1);
    });

    it('records the promise for a status before the body can be re-entered', async () => {
        const holder = holderAt();
        await holder.applyStep(step('empty'), (chunk) => chunk);

        expect(holder.futureFor('empty')).toBeDefined();
        expect(holder.futureFor('structure_starts')).toBeUndefined();
    });

    it('refuses a second body on a rung, because the chunk refuses to reach a status twice', async () => {
        // `advanceTo` is the backstop under the promise slot: if a body were ever run twice on a
        // rung, the chunk would report it rather than quietly take the second body's blocks.
        const holder = holderAt();
        await holder.applyStep(step('empty'), (chunk) => chunk);
        await holder.applyStep(step('structure_starts'), (chunk) => chunk);

        const chunk = holder.chunkAt('structure_starts');
        expect(() => chunk.advanceTo('structure_starts')).toThrow(ChunkStatusRegressionError);
    });
});

describe('climbing the ladder one rung at a time', () => {
    it('waits for the parent status before running the body', async () => {
        const holder = holderAt();
        const order: string[] = [];
        let releaseEmpty = (): void => undefined;
        const emptyFinished = new Promise<void>((resolve) => {
            releaseEmpty = resolve;
        });

        const empty = holder.applyStep(step('empty'), async (chunk) => {
            await emptyFinished;
            order.push('empty');
            return chunk;
        });
        const starts = holder.applyStep(step('structure_starts'), (chunk) => {
            order.push('structure_starts');
            return chunk;
        });

        releaseEmpty();
        await Promise.all([empty, starts]);

        expect(order).toEqual(['empty', 'structure_starts']);
    });

    it('reports a request that skips a rung rather than catching up on its own', async () => {
        const holder = holderAt(3, -4);
        await holder.applyStep(step('empty'), (chunk) => chunk);

        expect(() => holder.applyStep(step('biomes'), (chunk) => chunk)).toThrow(ChunkStepOutOfOrderError);
        expect(() => holder.applyStep(step('biomes'), (chunk) => chunk)).toThrow(
            'The chunk at 3, -4 cannot start biomes: it has started empty, ' +
                'and a chunk climbs the ladder one rung at a time.'
        );
    });

    it('reports a first request that is not empty', () => {
        const holder = holderAt();

        expect(() => holder.applyStep(step('structure_starts'), (chunk) => chunk)).toThrow(
            'The chunk at 0, 0 cannot start structure_starts: it has started no status, ' +
                'and a chunk climbs the ladder one rung at a time.'
        );
    });

    it('marks a rung started as soon as it is claimed and reached only when its body finishes', async () => {
        const holder = holderAt();
        await holder.applyStep(step('empty'), (chunk) => chunk);

        let release = (): void => undefined;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const running = holder.applyStep(step('structure_starts'), async (chunk) => {
            await gate;
            return chunk;
        });

        expect(holder.startedStatus).toBe('structure_starts');
        expect(holder.status).toBe('empty');

        release();
        await running;

        expect(holder.status).toBe('structure_starts');
    });
});

describe('reading the chunk', () => {
    it('refuses a read at a status the chunk has not reached', async () => {
        const holder = holderAt(2, 5);
        await holder.applyStep(step('empty'), (chunk) => chunk);

        expect(() => holder.chunkAt('biomes')).toThrow(ChunkNotReadyError);
        expect(() => holder.chunkAt('biomes')).toThrow('The chunk at 2, 5 was read at biomes while it holds empty.');
    });

    it('refuses a read before any status has run', () => {
        expect(() => holderAt(1, 1).chunkAt('empty')).toThrow(
            'The chunk at 1, 1 was read at empty while it holds no status.'
        );
    });

    it('allows a read at or below the status the chunk reached', async () => {
        const holder = holderAt();
        await climbTo(holder, 'biomes');

        expect(holder.hasReached('empty')).toBe(true);
        expect(holder.hasReached('biomes')).toBe(true);
        expect(holder.hasReached('terrain')).toBe(false);
        expect(holder.chunkAt('empty')).toBe(holder.chunkAt('biomes'));
    });

    it('allocates the chunk on the first step, not when the holder is created', async () => {
        const factory = vi.fn(newChunk);
        const holder = new ChunkHolder(0, 0, factory);
        holder.acquire();

        expect(factory).not.toHaveBeenCalled();

        await holder.applyStep(step('empty'), (chunk) => chunk);
        await holder.applyStep(step('structure_starts'), (chunk) => chunk);

        expect(factory).toHaveBeenCalledTimes(1);
    });
});

describe('taking the chunk a body hands back', () => {
    it('accepts a chunk that already holds the target, which is what a worker returns', async () => {
        const holder = holderAt();
        await holder.applyStep(step('empty'), (chunk) => chunk);

        const adopted = newChunk(0, 0);
        adopted.advanceTo('structure_starts');
        await holder.applyStep(step('structure_starts'), () => adopted);

        expect(holder.chunkAt('structure_starts')).toBe(adopted);
        expect(holder.status).toBe('structure_starts');
    });

    it('refuses a chunk that climbed past the rung the step was for', async () => {
        const holder = holderAt();
        await holder.applyStep(step('empty'), (chunk) => chunk);

        const overshot = newChunk(0, 0);
        overshot.advanceTo('biomes');

        await expect(holder.applyStep(step('structure_starts'), () => overshot)).rejects.toThrow(
            ChunkStatusRegressionError
        );
    });
});

describe('a body that throws', () => {
    it('rejects every caller of that status and does not retry', async () => {
        const holder = holderAt();
        const body = vi.fn(() => {
            throw new Error('terrain exploded');
        });

        const first = holder.applyStep(step('empty'), body);
        const second = holder.applyStep(step('empty'), body);

        await expect(first).rejects.toThrow('terrain exploded');
        await expect(second).rejects.toThrow('terrain exploded');
        expect(body).toHaveBeenCalledTimes(1);
        expect(holder.status).toBeUndefined();
    });
});

describe('reference counting', () => {
    it('counts acquisitions and gives the remaining count back on release', () => {
        const holder = holderAt();

        holder.acquire();
        holder.acquire();
        expect(holder.referenceCount).toBe(2);
        expect(holder.release()).toBe(1);
        expect(holder.release()).toBe(0);
    });

    it('refuses a release that nobody owns, which would drop a holder another run is reading', () => {
        const holder = holderAt(-7, 8);

        expect(() => holder.release()).toThrow(RangeError);
        expect(() => holder.release()).toThrow('The chunk at -7, 8 has no reference left to release.');
    });
});
