/**
 * What gets in front of a chunk a player is waiting on, counted rather than timed.
 *
 * The question is how many background tasks the workers start between the moment a player's
 * chunk is requested and the moment its last task starts. That is a count of decisions made by
 * the admission queue, the pool's bands and the bands tasks inherit from their dependents, so it
 * is the same on every machine at every load. A wall-clock figure on a shared host cannot tell a
 * real improvement from noise.
 *
 * The pieces are the real ones: {@link GenerationQueue}, {@link GenerationPool} over a runner whose
 * tasks finish when the test says so, and {@link urgencyAround}. A chunk's build is modelled the
 * way the generator makes it: the terrain tiles of the 5 by 5 around it, then its feature pass.
 */
import { GenerationPool } from '@jsprismarine/chunkgen';
import type { GenerationPriority, GenerationResult, GenerationTask, TaskRunnerFactory } from '@jsprismarine/chunkgen';
import { describe, expect, it } from 'vitest';

import { GenerationQueue } from './GenerationQueue';
import { urgencyAround } from './urgencyAround';

/** A runner that starts tasks at once and finishes them one at a time, oldest first. */
class ManualRunner {
    public readonly started: GenerationTask[] = [];
    public readonly threads: readonly unknown[] = [];
    private readonly finishers: Array<() => void> = [];

    public run(task: GenerationTask): Promise<GenerationResult> {
        this.started.push(task);
        return new Promise<GenerationResult>((resolve) => {
            this.finishers.push(() => resolve({ payload: undefined, transferList: [] }));
        });
    }

    public finishOldest(): boolean {
        const finish = this.finishers.shift();
        finish?.();
        return finish !== undefined;
    }

    public async destroy(): Promise<void> {}
}

const flush = async (): Promise<void> => {
    for (let turn = 0; turn < 20; turn++) await Promise.resolve();
};

interface Options {
    readonly workers: number;
    /** How many background chunks are requested before the player's. */
    readonly flood: number;
    /** Whether a chunk's dependency tasks take the band of the most urgent chunk that reads them. */
    readonly inheritBands: boolean;
    /** Whether `immediate` requests may be admitted past the queue's depth. */
    readonly bypassDepth: boolean;
}

/**
 * Runs the scenario and returns how many background tasks started before the player's chunk had
 * every one of its tasks started.
 */
const overtakes = async ({ workers, flood, inheritBands, bypassDepth }: Options): Promise<number> => {
    const runner = new ManualRunner();
    const factory: TaskRunnerFactory = () => runner;
    const pool = new GenerationPool({ pipeline: 'unused', workers }, factory);
    const queue = new GenerationQueue(workers);
    const urgencies = new Map<string, GenerationPriority>();
    const keyOf = (x: number, z: number): string => `${x},${z}`;
    const playerChunk = { x: 0, z: 0 };

    const task = (status: 'terrain' | 'features', x: number, z: number): GenerationTask => ({
        status,
        chunkX: x,
        chunkZ: z,
        dimension: 0
    });
    const bandOf = (x: number, z: number, radius: number): GenerationPriority =>
        inheritBands ? urgencyAround(urgencies, keyOf, x, z, radius) : (urgencies.get(keyOf(x, z)) ?? 'soon');

    /** A chunk's build: its 5 by 5 of terrain, all asked for at once, then its feature pass. */
    const build = async (x: number, z: number): Promise<void> => {
        const tiles: Promise<unknown>[] = [];
        for (let dz = -2; dz <= 2; dz++) {
            for (let dx = -2; dx <= 2; dx++) {
                tiles.push(pool.run(task('terrain', x + dx, z + dz), bandOf(x + dx, z + dz, 2)));
            }
        }
        await Promise.all(tiles);
        await pool.run(task('features', x, z), bandOf(x, z, 1));
    };

    const request = async (x: number, z: number, band: GenerationPriority): Promise<void> => {
        urgencies.set(keyOf(x, z), band);
        // Without the bypass an `immediate` request is queued like any other and waits for a slot.
        const admitted = bypassDepth ? band : band === 'immediate' ? 'soon' : band;
        await queue.run(x, z, async () => build(x, z), admitted);
    };

    // Background chunks far from the player, each needing its own tiles.
    for (let index = 0; index < flood; index++) void request(1000 + index * 8, 1000, 'idle');
    await flush();

    const startedBefore = runner.started.length;
    void request(playerChunk.x, playerChunk.z, 'immediate');

    // Drive the pool one finished task at a time until the player's feature pass has started.
    const playerFeaturesStarted = () =>
        runner.started.some((t) => t.status === 'features' && t.chunkX === playerChunk.x && t.chunkZ === playerChunk.z);
    for (let guard = 0; guard < 20_000 && !playerFeaturesStarted(); guard++) {
        await flush();
        if (playerFeaturesStarted()) break;
        if (!runner.finishOldest()) break;
    }
    await flush();

    expect(playerFeaturesStarted()).toBe(true);
    const playersTask = (t: GenerationTask): boolean => Math.abs(t.chunkX) <= 2 && Math.abs(t.chunkZ) <= 2;
    return runner.started.slice(startedBefore).filter((started) => !playersTask(started)).length;
};

describe('what starts ahead of a chunk a player is waiting on', () => {
    const base = { workers: 6, flood: 40 } as const;

    it('is bounded by the tasks already running when bands are inherited and the depth is bypassed', async () => {
        const ahead = await overtakes({ ...base, inheritBands: true, bypassDepth: true });

        // Only what the workers already held when the player arrived may finish ahead of it.
        expect(ahead).toBeLessThanOrEqual(base.workers + 1);
    });

    it('lets a whole admission depth of background builds go first when dependencies take the default band', async () => {
        const without = await overtakes({ ...base, inheritBands: false, bypassDepth: true });
        const withInheritance = await overtakes({ ...base, inheritBands: true, bypassDepth: true });

        // Six admitted builds of 25 terrain tiles each stand in front of the player's own tiles.
        expect(without).toBeGreaterThanOrEqual(base.workers * 20);
        expect(without).toBeGreaterThan(withInheritance * 10);
    });

    it('does not depend on how many background chunks are queued once bands are inherited', async () => {
        const small = await overtakes({ ...base, flood: 10, inheritBands: true, bypassDepth: true });
        const large = await overtakes({ ...base, flood: 80, inheritBands: true, bypassDepth: true });

        expect(large).toBe(small);
    });

    it('waits for admission slots held by background builds when the depth is not bypassed', async () => {
        const bypassed = await overtakes({ ...base, inheritBands: true, bypassDepth: true });
        const queued = await overtakes({ ...base, inheritBands: true, bypassDepth: false });

        expect(queued).toBeGreaterThan(bypassed);
    });
});
