import { describe, expect, it } from 'vitest';

import { ChunkHolderMap } from './ChunkHolderMap';
import type { ChunkStatus } from './ChunkStatus';
import { CHUNK_STATUSES } from './ChunkStatus';
import { ChunkReadOutOfWindowError } from './ChunkStep';
import { GenerationScheduler } from './GenerationScheduler';
import { ProtoChunk } from './ProtoChunk';
import type { StepRegion, StepTask, StepTasks } from './StepTasks';

/**
 * A short column. These bodies write one block and one biome per chunk, and a full 192 KiB
 * overworld column times the 625 holders a `full` target drags in would be 120 MiB of nothing.
 */
const newChunk = (chunkX: number, chunkZ: number): ProtoChunk =>
    ProtoChunk.create({ chunkX, chunkZ, minY: 0, height: 16 });

/** Where each chunk's one block and one biome live, which is its own corner column. */
const originOf = (region: StepRegion): readonly [number, number] => [region.chunkX * 16, region.chunkZ * 16];

/** The biome the fake `biomes` body writes, a function of the chunk position and nothing else. */
const biomeOf = (chunkX: number, chunkZ: number): string => `test:b${chunkX}_${chunkZ}`;

/** The nine offsets a `terrain` body reads, in the order it reads them. */
const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [0, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1]
];

/** Counts the bodies that ran, keyed by status and chunk position. */
class RunLog {
    private readonly counts = new Map<string, number>();

    public record(status: ChunkStatus, chunkX: number, chunkZ: number): void {
        const key = `${status}@${chunkX},${chunkZ}`;
        this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
    }

    /** How many distinct chunks a status ran on. */
    public chunksAt(status: ChunkStatus): number {
        return this.positionsAt(status).length;
    }

    /** How many times a status's body ran, counting a chunk twice when it ran twice. */
    public runsAt(status: ChunkStatus): number {
        return [...this.counts.entries()]
            .filter(([key]) => key.startsWith(`${status}@`))
            .reduce((sum, [, count]) => sum + count, 0);
    }

    /** The chunks a status ran on, sorted so a test can write the set out by hand. */
    public positionsAt(status: ChunkStatus): string[] {
        return [...this.counts.keys()]
            .filter((key) => key.startsWith(`${status}@`))
            .map((key) => key.slice(status.length + 1))
            .sort();
    }

    /** Every (status, chunk) a body ran more than once on. Empty is the invariant. */
    public repeated(): string[] {
        return [...this.counts.entries()].filter(([, count]) => count > 1).map(([key, count]) => `${key} x${count}`);
    }

    /** How many bodies ran in total. */
    public get total(): number {
        return [...this.counts.values()].reduce((sum, count) => sum + count, 0);
    }
}

/** The world the fake bodies build, and a counter over everything that ran in it. */
interface Harness {
    readonly scheduler: GenerationScheduler;
    readonly holders: ChunkHolderMap;
    readonly log: RunLog;
}

/**
 * Bodies for all ten statuses, so every rung is counted.
 *
 * `biomes` writes a biome derived from the chunk position. `terrain` reads its own biome and its
 * eight neighbors' through the region, which the step table allows at distance 1, and writes them
 * as one block key. A layer loop that failed to drive `biomes` out to radius 1 would raise
 * `ChunkNotReadyError` here rather than quietly writing a different block.
 */
const fakeTasks = (log: RunLog, overrides: StepTasks = {}): StepTasks => {
    const tasks: Record<string, StepTask> = {};
    for (const status of CHUNK_STATUSES) {
        tasks[status] = (region) => {
            log.record(status, region.chunkX, region.chunkZ);
            return region.center;
        };
    }

    tasks.biomes = (region) => {
        log.record('biomes', region.chunkX, region.chunkZ);
        const [x, z] = originOf(region);
        region.center.setBiome(x, 0, z, biomeOf(region.chunkX, region.chunkZ));
        return region.center;
    };

    tasks.terrain = (region) => {
        log.record('terrain', region.chunkX, region.chunkZ);
        const read = NEIGHBOR_OFFSETS.map(([dx, dz]) => {
            const neighbor = region.neighbor(dx, dz, 'biomes');
            return neighbor.biomeAt((region.chunkX + dx) * 16, 0, (region.chunkZ + dz) * 16);
        });
        const [x, z] = originOf(region);
        region.center.setBlock(x, 0, z, `test:t[${read.join('|')}]`);
        return region.center;
    };

    return { ...tasks, ...overrides };
};

const harness = (overrides: StepTasks = {}): Harness => {
    const log = new RunLog();
    const holders = new ChunkHolderMap(newChunk);
    return { scheduler: new GenerationScheduler({ holders, tasks: fakeTasks(log, overrides) }), holders, log };
};

/** What a chunk's `terrain` body wrote, which is the value every order has to agree on. */
const digestOf = (chunk: ProtoChunk): string => chunk.blockAt(chunk.chunkX * 16, 0, chunk.chunkZ * 16);

const square = (minX: number, minZ: number, width: number): ReadonlyArray<readonly [number, number]> => {
    const positions: Array<readonly [number, number]> = [];
    for (let z = minZ; z < minZ + width; z++) {
        for (let x = minX; x < minX + width; x++) positions.push([x, z]);
    }
    return positions;
};

const sortedPositions = (positions: ReadonlyArray<readonly [number, number]>): string[] =>
    positions.map(([x, z]) => `${x},${z}`).sort();

describe('the layers a target walks', () => {
    // Written out from the accumulated-dependency table in the slice 4 tests, not read back from
    // the pyramid. `terrain` reads `biomes` one ring out and `structure_starts` eight rings out,
    // so reaching it needs `structure_starts` nine rings out and `biomes` one.
    it('walks 9, 9, 1, 1, 0 for a terrain target', () => {
        expect(harness().scheduler.layersFor('terrain')).toEqual([
            ['empty', 9],
            ['structure_starts', 9],
            ['structure_references', 1],
            ['biomes', 1],
            ['terrain', 0]
        ]);
    });

    it('walks 11, 11, 3, 3, 2, 1, 1, 0, 0, 0 for a full target', () => {
        expect(harness().scheduler.layersFor('full')).toEqual([
            ['empty', 11],
            ['structure_starts', 11],
            ['structure_references', 3],
            ['biomes', 3],
            ['terrain', 2],
            ['features', 1],
            ['initialize_light', 1],
            ['light', 0],
            ['spawn', 0],
            ['full', 0]
        ]);
    });

    it('gives the target status its own layer at radius 0, where the dependency table reads -1', () => {
        // A step never names its own status among its dependencies, so without Java's special case
        // in `getAccumulatedRadiusOf` the last layer would run on no chunks at all.
        expect(harness().scheduler.layersFor('empty')).toEqual([['empty', 0]]);
    });
});

describe('running a status body exactly once per chunk', () => {
    it('shares one run of each rung between ten callers asking for the same chunk', async () => {
        const { scheduler, log } = harness();

        await Promise.all(Array.from({ length: 10 }, () => scheduler.generate(0, 0, 'terrain')));

        // One chunk at `terrain` is a 19 by 19 square at `empty` and `structure_starts`, a 3 by 3
        // at `structure_references` and `biomes`, and the chunk itself at `terrain`.
        expect(log.repeated()).toEqual([]);
        expect(log.runsAt('empty')).toBe(361);
        expect(log.runsAt('structure_starts')).toBe(361);
        expect(log.runsAt('structure_references')).toBe(9);
        expect(log.runsAt('biomes')).toBe(9);
        expect(log.runsAt('terrain')).toBe(1);
        expect(log.total).toBe(741);
    });

    it('shares the overlap between nine concurrent requests rather than redoing it', async () => {
        const { scheduler, log } = harness();
        const targets = square(0, 0, 3);

        await Promise.all(targets.map(([x, z]) => scheduler.generate(x, z, 'terrain')));

        // Nine targets spanning 3 by 3, so each layer covers (3 + 2r) by (3 + 2r): 21 by 21 at
        // radius 9, 5 by 5 at radius 1, and the nine targets at radius 0. Nine separate runs with
        // no sharing would be 9 times 361 at `empty` instead of 441.
        expect(log.repeated()).toEqual([]);
        expect(log.runsAt('empty')).toBe(441);
        expect(log.runsAt('structure_starts')).toBe(441);
        expect(log.runsAt('structure_references')).toBe(25);
        expect(log.runsAt('biomes')).toBe(25);
        expect(log.runsAt('terrain')).toBe(9);
        expect(log.total).toBe(941);

        expect(log.positionsAt('terrain')).toEqual(sortedPositions(square(0, 0, 3)));
        expect(log.positionsAt('biomes')).toEqual(sortedPositions(square(-1, -1, 5)));
    });

    it('builds terrain 49 times for a 3 by 3 of full targets, where today it is built 81', async () => {
        // This is the defect ADR 0002 opens with. `DataDrivenGenerator.generateChunk` builds a 3
        // by 3 of terrain tiles per chunk, so nine chunks build 81 of them and a chunk's own
        // terrain is built up to nine times. A `full` target needs `terrain` out to radius 2, and
        // the union of nine such windows is 7 by 7.
        const { scheduler, log } = harness();

        await Promise.all(square(0, 0, 3).map(([x, z]) => scheduler.generate(x, z, 'full')));

        expect(log.repeated()).toEqual([]);
        expect(log.runsAt('terrain')).toBe(49);
        expect(log.positionsAt('terrain')).toEqual(sortedPositions(square(-2, -2, 7)));
        expect(log.runsAt('features')).toBe(25);
        expect(log.runsAt('full')).toBe(9);
    });

    it('counts every layer of a 3 by 3 of full targets, 1538 bodies and none run twice', async () => {
        const { scheduler, log } = harness();

        await Promise.all(square(0, 0, 3).map(([x, z]) => scheduler.generate(x, z, 'full')));

        // Widths 11, 11, 3, 3, 2, 1, 1, 0, 0, 0 over a 3 by 3 of targets: 625, 625, 81, 81, 49,
        // 25, 25, 9, 9, 9.
        expect(CHUNK_STATUSES.map((status) => log.runsAt(status))).toEqual([625, 625, 81, 81, 49, 25, 25, 9, 9, 9]);
        expect(log.total).toBe(1538);
        expect(log.repeated()).toEqual([]);
    });

    it('redoes the overlap when two requests do not meet in time and nothing retains it', async () => {
        const { scheduler, log } = harness();

        await scheduler.generate(0, 0, 'terrain');
        await scheduler.generate(1, 0, 'terrain');

        // Sharing is what two runs that overlap in time get. These two do not: the first gave its
        // references back before the second asked, so its 361 holders were dropped and the second
        // run built its own 361. Exactly once is a property of a holder's lifetime, and this is
        // the lifetime a caller asked for by retaining nothing.
        expect(log.runsAt('empty')).toBe(722);
        // The two squares span x -9 to 10 and z -9 to 9, which is 20 by 19 distinct chunks.
        expect(log.chunksAt('empty')).toBe(380);
        expect(log.runsAt('terrain')).toBe(2);
        expect(log.positionsAt('terrain')).toEqual(['0,0', '1,0']);
    });
});

describe('what a retained reference prevents', () => {
    it('does not rebuild a chunk a caller still holds', async () => {
        const { scheduler, holders, log } = harness();
        holders.acquire(0, 0);

        await scheduler.generate(0, 0, 'terrain');
        await scheduler.generate(0, 0, 'terrain');

        // The retained holder keeps its promise for every rung, so the second run shares all five
        // of them. The 360 holders around it were dropped and rebuilt, and so were the eight
        // chunks the `biomes` layer covers.
        expect(log.runsAt('terrain')).toBe(1);
        expect(log.runsAt('biomes')).toBe(17);
        expect(log.runsAt('structure_references')).toBe(17);
        expect(log.runsAt('empty')).toBe(721);
        expect(log.runsAt('structure_starts')).toBe(721);

        holders.release(0, 0);
    });

    it('rebuilds a chunk nothing holds, which is the lifetime the count buys', async () => {
        const { scheduler, log } = harness();

        await scheduler.generate(0, 0, 'terrain');
        await scheduler.generate(0, 0, 'terrain');

        expect(log.runsAt('terrain')).toBe(2);
    });

    it('leaves the holder map empty once every run has finished', async () => {
        const { scheduler, holders } = harness();

        await Promise.all(square(0, 0, 3).map(([x, z]) => scheduler.generate(x, z, 'terrain')));

        expect(holders.size).toBe(0);
    });

    it('keeps a shared holder while a second run still needs it', async () => {
        let release = (): void => undefined;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const { scheduler, holders } = harness({
            terrain: async (region) => {
                if (region.chunkX === 0) await gate;
                return region.center;
            }
        });

        const slow = scheduler.generate(0, 0, 'terrain');
        const quick = scheduler.generate(1, 0, 'terrain');
        await quick;

        // The quick run gave back its 361 references. What is left is exactly the slow run's own
        // 19 by 19 square, including the 342 holders the two runs shared.
        expect(holders.size).toBe(361);
        expect(holders.get(0, 0)?.referenceCount).toBe(1);
        expect(holders.get(1, 0)?.referenceCount).toBe(1);
        expect(holders.get(9, 0)?.referenceCount).toBe(1);
        expect(holders.get(10, 0)).toBeUndefined();

        release();
        await slow;

        expect(holders.size).toBe(0);
    });
});

describe('order independence', () => {
    const area = square(0, 0, 4);

    /** Generates the area in a given order and batch size, and reads back what each chunk holds. */
    const run = async (
        order: ReadonlyArray<readonly [number, number]>,
        batchSize: number
    ): Promise<Map<string, string>> => {
        const { scheduler } = harness();
        const digests = new Map<string, string>();
        for (let start = 0; start < order.length; start += batchSize) {
            const batch = order.slice(start, start + batchSize);
            const chunks = await Promise.all(batch.map(([x, z]) => scheduler.generate(x, z, 'terrain')));
            for (const chunk of chunks) digests.set(`${chunk.chunkX},${chunk.chunkZ}`, digestOf(chunk));
        }
        return digests;
    };

    /** A fixed permutation, written out so the shuffle is part of the test rather than a seed. */
    const SHUFFLED = [9, 2, 15, 0, 7, 12, 4, 11, 1, 14, 6, 3, 10, 8, 13, 5].map((index) => {
        const position = area[index];
        if (position === undefined) throw new Error(`The area has no chunk at index ${index}.`);
        return position;
    });

    it('writes the block the step table says it should, read back by hand', async () => {
        const { scheduler } = harness();

        const chunk = await scheduler.generate(0, 0, 'terrain');

        expect(digestOf(chunk)).toBe(
            'test:t[test:b-1_-1|test:b0_-1|test:b1_-1|test:b-1_0|test:b0_0|test:b1_0|' +
                'test:b-1_1|test:b0_1|test:b1_1]'
        );
    });

    it('gives the same 16 chunks whatever order and batch size they are asked for in', async () => {
        const rowMajor = await run(area, 1);

        expect(rowMajor.size).toBe(16);
        expect(await run([...area].reverse(), 1)).toEqual(rowMajor);
        expect(await run(SHUFFLED, 1)).toEqual(rowMajor);
        expect(await run(area, 2)).toEqual(rowMajor);
        expect(await run(area, 5)).toEqual(rowMajor);
        expect(await run(area, 16)).toEqual(rowMajor);
        expect(await run(SHUFFLED, 16)).toEqual(rowMajor);
        expect(await run([...area].reverse(), 3)).toEqual(rowMajor);
    });

    it('gives the same chunk whether it is asked for alone or inside a batch of sixteen', async () => {
        const alone = await run([[2, 1] as const], 1);
        const batched = await run(area, 16);

        expect(batched.get('2,1')).toBe(alone.get('2,1'));
    });
});

describe('the read window a body is held to', () => {
    it('refuses a terrain body that reaches two rings out', async () => {
        const { scheduler } = harness({
            terrain: (region) => region.neighbor(2, 0, 'biomes')
        });

        await expect(scheduler.generate(0, 0, 'terrain')).rejects.toThrow(ChunkReadOutOfWindowError);
    });

    it('refuses a terrain body that reads a neighbor at a status the window does not guarantee', async () => {
        const { scheduler } = harness({
            terrain: (region) => region.neighbor(1, 0, 'terrain')
        });

        await expect(scheduler.generate(0, 0, 'terrain')).rejects.toThrow(
            'The terrain step asked for terrain at distance 1, where only biomes is guaranteed.'
        );
    });

    it('gives the body its own chunk back for the zero offset without going through the map', async () => {
        const { scheduler } = harness({
            terrain: (region) => {
                expect(region.neighbor(0, 0, 'biomes')).toBe(region.center);
                return region.center;
            }
        });

        await expect(scheduler.generate(0, 0, 'terrain')).resolves.toBeDefined();
    });

    it('releases the whole window when a body throws', async () => {
        const { scheduler, holders } = harness({
            terrain: () => {
                throw new Error('the terrain body failed');
            }
        });

        await expect(scheduler.generate(0, 0, 'terrain')).rejects.toThrow('the terrain body failed');
        expect(holders.size).toBe(0);
    });
});
