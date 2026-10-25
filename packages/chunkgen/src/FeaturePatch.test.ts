import { describe, expect, it } from 'vitest';

import { ChunkHolderMap } from './ChunkHolderMap';
import type { ChunkStatus } from './ChunkStatus';
import { isOrAfter } from './ChunkStatus';
import {
    DuplicateFeaturePatchError,
    FEATURE_PATCH_ORDER,
    FeaturePatchOutOfRangeError,
    InboundFeaturePatches
} from './FeaturePatch';
import { GenerationScheduler } from './GenerationScheduler';
import type { StagedChunk } from './StagedChunk';
import type { StepRegion } from './StepTasks';

/** A seeded shuffle, so a test that depends on an arrival order still reproduces. */
const shuffled = <T>(values: readonly T[], seed: number): T[] => {
    const order = [...values];
    let state = seed;
    for (let at = order.length - 1; at > 0; at--) {
        state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
        const pick = state % (at + 1);
        [order[at], order[pick]] = [order[pick]!, order[at]!];
    }
    return order;
};

describe('the merge order', () => {
    it('is the eight neighbors, dx ascending fastest', () => {
        expect(FEATURE_PATCH_ORDER.map(([dx, dz]) => `${dx},${dz}`)).toEqual([
            '-1,-1',
            '0,-1',
            '1,-1',
            '-1,0',
            '1,0',
            '-1,1',
            '0,1',
            '1,1'
        ]);
    });

    it('is exactly the ring at Chebyshev distance 1, so the chunk itself is not in it', () => {
        // Read through a widened view: the literal tuple types are narrow enough that the
        // compiler answers this by itself, and a test the compiler answers does not run.
        const offsets: readonly (readonly number[])[] = FEATURE_PATCH_ORDER;

        expect(offsets).toHaveLength(8);
        expect(offsets.map(([dx, dz]) => Math.max(Math.abs(dx!), Math.abs(dz!)))).toEqual(Array(8).fill(1));
    });
});

describe('taking a patch', () => {
    it('refuses the chunk itself', () => {
        const inbound = new InboundFeaturePatches<string>();

        expect(() => inbound.receive(0, 0, 'own')).toThrow(FeaturePatchOutOfRangeError);
    });

    it('refuses a chunk past the features write radius', () => {
        const inbound = new InboundFeaturePatches<string>();

        expect(() => inbound.receive(2, 0, 'far')).toThrow(FeaturePatchOutOfRangeError);
        expect(() => inbound.receive(-1, 2, 'far')).toThrow(FeaturePatchOutOfRangeError);
    });

    it('refuses a second patch from the same neighbor, which means its step ran twice', () => {
        const inbound = new InboundFeaturePatches<string>();
        inbound.receive(1, 0, 'first');

        expect(() => inbound.receive(1, 0, 'second')).toThrow(DuplicateFeaturePatchError);
    });

    it('records which neighbors have handed one over', () => {
        const inbound = new InboundFeaturePatches<string>();
        inbound.receive(-1, 1, 'southwest');

        expect(inbound.has(-1, 1)).toBe(true);
        expect(inbound.has(1, -1)).toBe(false);
        expect(inbound.size).toBe(1);
    });
});

describe('merging', () => {
    it('applies the patches in position order whatever order they arrived in', () => {
        const arrivals = FEATURE_PATCH_ORDER.map(([dx, dz]) => [dx, dz, `${dx},${dz}`] as const);
        const expected = arrivals.map(([, , patch]) => patch);

        for (const seed of [1, 7, 99, 12_345, 2_024]) {
            const inbound = new InboundFeaturePatches<string>();
            for (const [dx, dz, patch] of shuffled(arrivals, seed)) inbound.receive(dx, dz, patch);

            expect(inbound.inMergeOrder()).toEqual(expected);
        }
    });

    it('skips the neighbors that wrote nothing', () => {
        const inbound = new InboundFeaturePatches<string>();
        inbound.receive(1, 1, 'southeast');
        inbound.receive(0, -1, 'north');

        expect(inbound.inMergeOrder()).toEqual(['north', 'southeast']);
    });

    it('settles a contested block the same way whichever neighbor arrived first', () => {
        // Two neighbors both write a block at the same position. The last patch in the merge
        // order wins, and which one that is must not depend on who finished first.
        const won = (first: readonly [number, number], second: readonly [number, number]): string => {
            const inbound = new InboundFeaturePatches<string>();
            inbound.receive(first[0], first[1], `${first[0]},${first[1]}`);
            inbound.receive(second[0], second[1], `${second[0]},${second[1]}`);
            return inbound.inMergeOrder().at(-1)!;
        };

        expect(won([1, 1], [-1, -1])).toBe('1,1');
        expect(won([-1, -1], [1, 1])).toBe('1,1');
        expect(won([0, 1], [1, 0])).toBe('0,1');
        expect(won([1, 0], [0, 1])).toBe('0,1');
    });
});

/**
 * A whole generator, small enough to read, built out of the ladder and the patch merge.
 *
 * Each chunk's feature pass plants one tree whose trunk sits on its eastern border, so the crown
 * spills into the next chunk, and stakes a claim on the origin of all nine chunks of its
 * neighborhood, so every chunk's origin is contested by itself and all eight neighbors. The first
 * is the user-visible point of the merge and the second is the part a wrong merge order breaks.
 */

/** One block a feature wrote, in world coordinates. */
interface Write {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly key: string;
}

/** What one chunk's feature pass wrote into one other chunk. */
interface TestPatch {
    readonly writes: readonly Write[];
}

/** Blocks along one edge of a chunk. */
const WIDTH = 16;

const chunkOf = (value: number): number => Math.floor(value / WIDTH);

class TestChunk implements StagedChunk {
    public readonly blocks = new Map<string, string>();
    private persisted: ChunkStatus = 'empty';
    private outbound = new Map<string, TestPatch>();

    public constructor(
        public readonly chunkX: number,
        public readonly chunkZ: number
    ) {}

    public get status(): ChunkStatus {
        return this.persisted;
    }

    public advanceTo(status: ChunkStatus): void {
        if (isOrAfter(this.persisted, status)) throw new RangeError(`${this.persisted} cannot advance to ${status}`);
        this.persisted = status;
    }

    /** Whether a world position is one of this chunk's own columns. */
    public holds(x: number, z: number): boolean {
        return chunkOf(x) === this.chunkX && chunkOf(z) === this.chunkZ;
    }

    public write(write: Write): void {
        this.blocks.set(`${write.x},${write.y},${write.z}`, write.key);
    }

    public at(x: number, y: number, z: number): string | undefined {
        return this.blocks.get(`${x},${y},${z}`);
    }

    public recordFeatures(patches: ReadonlyMap<string, TestPatch>): void {
        this.outbound = new Map(patches);
    }

    public writesInto(chunkX: number, chunkZ: number): TestPatch | undefined {
        return this.outbound.get(`${chunkX},${chunkZ}`);
    }

    /** Every block, as one string, so two runs can be compared by equality. */
    public digest(): string {
        return [...this.blocks.entries()].sort(([left], [right]) => (left < right ? -1 : 1)).join(';');
    }
}

/** The floor every chunk's terrain lays down, so the feature pass has something to stand on. */
const terrainTask = (region: StepRegion<TestChunk>): TestChunk => {
    for (let localX = 0; localX < WIDTH; localX++) {
        for (let localZ = 0; localZ < WIDTH; localZ++) {
            region.center.write({
                x: region.chunkX * WIDTH + localX,
                y: 0,
                z: region.chunkZ * WIDTH + localZ,
                key: 'floor'
            });
        }
    }
    return region.center;
};

/**
 * The writes one chunk's feature pass makes: a tree on its eastern border, and a claim on the
 * origin of every chunk of its neighborhood.
 */
const featureWritesOf = (chunkX: number, chunkZ: number): readonly Write[] => {
    const trunkX = chunkX * WIDTH + WIDTH - 1;
    const trunkZ = chunkZ * WIDTH + 8;
    const writes: Write[] = [{ x: trunkX, y: 1, z: trunkZ, key: 'trunk' }];
    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            if (dx !== 0 || dz !== 0) writes.push({ x: trunkX + dx, y: 2, z: trunkZ + dz, key: 'leaves' });
        }
    }

    for (const [dx, dz] of [[0, 0], ...FEATURE_PATCH_ORDER]) {
        writes.push({ x: (chunkX + dx) * WIDTH, y: 3, z: (chunkZ + dz) * WIDTH, key: `claim:${chunkX},${chunkZ}` });
    }
    return writes;
};

/** Applies what lands in this chunk and hands the rest to whoever asks for it later. */
const featuresTask = (region: StepRegion<TestChunk>): TestChunk => {
    const outbound = new Map<string, Write[]>();
    for (const write of featureWritesOf(region.chunkX, region.chunkZ)) {
        if (region.center.holds(write.x, write.z)) {
            region.center.write(write);
            continue;
        }

        const key = `${chunkOf(write.x)},${chunkOf(write.z)}`;
        const existing = outbound.get(key);
        if (existing === undefined) outbound.set(key, [write]);
        else existing.push(write);
    }

    region.center.recordFeatures(new Map([...outbound].map(([key, writes]) => [key, { writes }])));
    return region.center;
};

/** The merge: this chunk's own state, then the eight inbound patches in position order. */
const fullTask = (region: StepRegion<TestChunk>): TestChunk => {
    const inbound = new InboundFeaturePatches<TestPatch>();
    for (const [dx, dz] of FEATURE_PATCH_ORDER) {
        const patch = region.neighbor(dx, dz, 'features').writesInto(region.chunkX, region.chunkZ);
        if (patch !== undefined) inbound.receive(dx, dz, patch);
    }
    for (const patch of inbound.inMergeOrder()) {
        for (const write of patch.writes) region.center.write(write);
    }
    return region.center;
};

/** A scheduler over the three bodies above, with a fresh holder map each time. */
const generator = (): GenerationScheduler<TestChunk> =>
    new GenerationScheduler<TestChunk>({
        holders: new ChunkHolderMap<TestChunk>((chunkX, chunkZ) => new TestChunk(chunkX, chunkZ)),
        tasks: { terrain: terrainTask, features: featuresTask, full: fullTask }
    });

/** The sixteen chunks of a 4 by 4 area, which is wide enough to have an interior. */
const AREA = [0, 1, 2, 3].flatMap((chunkZ) => [0, 1, 2, 3].map((chunkX) => [chunkX, chunkZ] as const));

/**
 * Generates an area in a given order, `batch` requests at a time, and digests every chunk.
 *
 * @returns One `<position> <digest>` line per chunk, sorted by position, so the comparison is
 * over the blocks rather than over the order the chunks came back in.
 */
const digestArea = async (order: readonly (readonly [number, number])[], batch: number): Promise<string[]> => {
    const scheduler = generator();
    const digests: string[] = [];
    for (let at = 0; at < order.length; at += batch) {
        const slice = order.slice(at, at + batch);
        const chunks = await Promise.all(slice.map(([x, z]) => scheduler.generate(x, z, 'full')));
        for (const chunk of chunks) digests.push(`${chunk.chunkX},${chunk.chunkZ} ${chunk.digest()}`);
    }
    return digests.sort();
};

describe('a feature that straddles a chunk border', () => {
    it('comes out whole on both sides of the border', async () => {
        const chunk = await generator().generate(1, 0, 'full');

        // Chunk 1,0's own tree: the trunk sits on its eastern border at x 31, and the three
        // crown cells at x 32 belong to chunk 2,0.
        expect(chunk.at(31, 1, 8)).toBe('trunk');
        expect(chunk.at(30, 2, 7)).toBe('leaves');
        expect(chunk.at(31, 2, 9)).toBe('leaves');
        expect(chunk.at(32, 2, 8)).toBeUndefined();

        // Chunk 0,0's tree, whose trunk is at x 15 and whose crown reaches x 16. Under the
        // generator this replaces, a chunk asked for on its own never received these, which is
        // what cut a tree off at the border.
        expect(chunk.at(16, 2, 7)).toBe('leaves');
        expect(chunk.at(16, 2, 8)).toBe('leaves');
        expect(chunk.at(16, 2, 9)).toBe('leaves');
    });

    it('holds the same crown whether the neighbor was asked for first, last, or not at all', async () => {
        const alone = await generator().generate(1, 0, 'full');

        const after = generator();
        for (const [x, z] of AREA) await after.generate(x, z, 'full');

        expect((await after.generate(1, 0, 'full')).digest()).toBe(alone.digest());
    });
});

describe('the merge order inside a running generator', () => {
    it('settles a contested block in position order, not in finishing order', async () => {
        // Every chunk stakes a claim on the origin of all nine chunks of its neighborhood, so
        // each origin is written by nine feature passes. The chunk's own write lands first and
        // the eight patches follow in position order, so the last word is always the neighbor at
        // (1, 1).
        for (const [chunkX, chunkZ] of AREA) {
            const chunk = await generator().generate(chunkX, chunkZ, 'full');
            expect(chunk.at(chunkX * WIDTH, 3, chunkZ * WIDTH)).toBe(`claim:${chunkX + 1},${chunkZ + 1}`);
        }
    });

    it('gives the same sixteen chunks whatever order and batch size they are asked for in', async () => {
        const rowMajor = AREA;
        const reversed = [...AREA].reverse();
        // Written out rather than shuffled, so a failure names the same order every time.
        const scattered = [
            [2, 1],
            [0, 0],
            [3, 3],
            [1, 2],
            [0, 3],
            [3, 0],
            [1, 1],
            [2, 2],
            [0, 1],
            [3, 1],
            [1, 0],
            [2, 3],
            [0, 2],
            [3, 2],
            [1, 3],
            [2, 0]
        ] as const satisfies readonly (readonly [number, number])[];

        const reference = await digestArea(rowMajor, 1);
        expect(reference).toHaveLength(AREA.length);

        for (const [name, order] of [
            ['row major', rowMajor],
            ['reversed', reversed],
            ['scattered', scattered]
        ] as const) {
            for (const batch of [1, 2, 3, 5, 16]) {
                expect(await digestArea(order, batch), `${name}, ${batch} at a time`).toEqual(reference);
            }
        }
    });
});
