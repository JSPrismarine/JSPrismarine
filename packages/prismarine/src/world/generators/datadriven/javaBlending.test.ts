import { describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../../../block/state/BlockRuntimeIds';
import Chunk from '../../chunk/Chunk';
import { CURRENT_GENERATION } from '../../chunk/ChunkGeneration';
import type { ChunkGeneration } from '../../chunk/ChunkGeneration';
import { Dimensions } from '../../DimensionType';
import type { StoredChunkReader } from '../../providers/Provider';
import { createJavaBlockOracle } from './javaBlockOracle';
import { OldChunks, blendedBiomeCells, blenderFor, oldChunkViewOf } from './javaBlending';
import { DataDrivenGenerator, defaultTerrainPipeline } from './DataDrivenGenerator';
import { findJavaWorldgenSources } from './javaWorldgenSources';
import { loadJavaWorldgenRegistries } from './javaWorldgenData';

const sources = findJavaWorldgenSources();
const SEED = 1234n;
/** One terrain-only chunk is under a second; the budget covers a cold registry load. */
const TIMEOUT = 180_000;

const id = (name: string): number => BlockRuntimeIds.getByName(name);

/** The two tags Java's `isGround` excludes, as a data pack would declare them. */
const oracle = createJavaBlockOracle(
    new Map<string, unknown>([
        ['minecraft:leaves', { values: ['minecraft:oak_leaves'] }],
        ['minecraft:logs', { values: ['minecraft:oak_log'] }]
    ])
);

const fallback = (): string => 'minecraft:the_void';

/** A plateau of stone with a grass top at `height`, and a tree and a pond on it. */
const plateau = (cx: number, cz: number, height: number): Chunk => {
    const chunk = new Chunk(cx, cz, new Map(), Dimensions.Overworld);
    for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
            chunk.fillColumn(x, z, -64, height - 1, id('minecraft:stone'));
            chunk.setBlockRuntimeId(x, height, z, id('minecraft:grass_block'));
        }
    }
    chunk.setBlockRuntimeId(3, height + 1, 3, id('minecraft:oak_log'));
    chunk.setBlockRuntimeId(3, height + 2, 3, id('minecraft:oak_leaves'));
    chunk.setBlockRuntimeId(5, height + 1, 5, id('minecraft:water'));
    chunk.setBlockRuntimeId(6, height + 1, 6, id('minecraft:red_mushroom_block'));
    chunk.setBlockRuntimeId(7, height + 1, 7, id('minecraft:wooden_door'));
    chunk.setBlockRuntimeId(8, height + 1, 8, id('minecraft:torch'));
    return chunk;
};

/** A save holding old plateaus at the listed positions and current chunks elsewhere nearby. */
const storedWith = (old: readonly (readonly [number, number])[], height = 100) => {
    const reads = { generation: 0, terrain: 0 };
    const isOld = (x: number, z: number) => old.some(([ox, oz]) => ox === x && oz === z);
    const reader: StoredChunkReader = {
        generationAt: (x, z): ChunkGeneration | undefined => {
            reads.generation++;
            return isOld(x, z) ? { dataVersion: 0, blending: { minSection: -4, maxSection: 20 } } : CURRENT_GENERATION;
        },
        terrainAt: (x, z) => {
            reads.terrain++;
            return isOld(x, z) ? plateau(x, z, height) : undefined;
        }
    };
    return { reader, reads };
};

describe('the old chunk view', () => {
    const view = oldChunkViewOf(plateau(0, 0, 70), oracle, fallback);

    it("reads Java's surface blocks through the edition mapping", () => {
        expect(view.isSurfaceBlock(0, 70, 0)).toBe(true);
        expect(view.isSurfaceBlock(0, 69, 0)).toBe(true);
        expect(view.isSurfaceBlock(0, 71, 0)).toBe(false);
        expect(view.isSurfaceBlock(3, 71, 3)).toBe(false);
    });

    it('excludes air, leaves, logs, mushroom blocks and blocks without collision from ground', () => {
        expect(view.isGround(0, 70, 0)).toBe(true);
        expect(view.isGround(0, 71, 0)).toBe(false);
        expect(view.isGround(3, 71, 3)).toBe(false);
        expect(view.isGround(3, 72, 3)).toBe(false);
        expect(view.isGround(5, 71, 5)).toBe(false);
        expect(view.isGround(6, 71, 6)).toBe(false);
        // A door has a collision shape, a torch has none.
        expect(view.isGround(7, 71, 7)).toBe(true);
        expect(view.isGround(8, 71, 8)).toBe(false);
    });

    it('reads stored biomes as Java biomes', () => {
        expect(view.noiseBiome(0, 17, 0)).toBe('minecraft:plains');
    });
});

describe('the old chunks of a save', () => {
    it('finds no records, and builds none, where no old chunk is in reach', () => {
        const { reader, reads } = storedWith([[40, 40]]);
        const old = new OldChunks(reader, oracle, fallback);
        expect(old.recordsAround(0, 0)).toBeUndefined();
        expect(old.anyWithin(0, 0, 7)).toBe(false);
        expect(reads.terrain).toBe(0);
    });

    it('calculates each old chunk once against its own neighbors', () => {
        const { reader, reads } = storedWith([
            [-1, 0],
            [-2, 0]
        ]);
        const old = new OldChunks(reader, oracle, fallback);
        const records = old.recordsAround(0, 0)!;
        expect(records.map((record) => [record.chunkX, record.chunkZ])).toEqual([
            [-2, 0],
            [-1, 0]
        ]);
        // The two old chunks face each other, so neither records that shared edge.
        const nearer = records.find((record) => record.chunkX === -1)!;
        expect(nearer.snapshot.heights.some((height) => height === 100)).toBe(true);

        old.recordsAround(1, 0);
        expect(reads.terrain).toBe(2);
    });

    it('lets the blender pull new terrain toward an old edge', () => {
        const { reader } = storedWith([[-1, 0]]);
        const old = new OldChunks(reader, oracle, fallback);
        const blender = blenderFor(0, 0, old.recordsAround(0, 0));
        expect(blender.isEmpty()).toBe(false);
        // On the shared edge the old surface height is fixed; far into the chunk it fades.
        expect(blender.blendOffsetAndFactor(0, 0).alpha).toBe(0);
        expect(blender.blendOffsetAndFactor(15, 8).alpha).toBeGreaterThan(0);
    });

    it('keeps biomes the biome source chose when there is nothing to blend', () => {
        const base = (): string => 'minecraft:desert';
        expect(blendedBiomeCells(undefined, base)).toBe(base);
    });
});

describe.skipIf(sources === undefined)('blending real terrain', { tags: ['real-data'] }, () => {
    const registries = sources === undefined ? undefined : loadJavaWorldgenRegistries(sources);

    const topSolid = (chunk: Chunk, x: number, z: number): number => {
        for (let y = chunk.getMaxY(); y >= chunk.getMinY(); y--) {
            const name = chunk.getBlock(x, y, z).name;
            if (name !== 'minecraft:air' && name !== 'minecraft:water') return y;
        }
        return chunk.getMinY();
    };

    const generate = async (
        cx: number,
        cz: number,
        stored?: StoredChunkReader,
        terrainWorkers = false
    ): Promise<Chunk> => {
        const generator = new DataDrivenGenerator({
            registries: registries!,
            decorate: false,
            carve: false,
            ...(terrainWorkers ? { terrain: { pipeline: defaultTerrainPipeline(), workers: 1 } } : {})
        });
        if (stored !== undefined) generator.useStoredChunks(stored);
        try {
            return await generator.generateChunk(cx, cz, SEED);
        } finally {
            generator.stopGenerating();
        }
    };

    it(
        "pulls a new chunk's edge to an old chunk's surface and leaves distant chunks alone",
        async () => {
            const { reader } = storedWith([[0, 0]], 150);
            const plain = await generate(1, 0);
            const blended = await generate(1, 0, reader);

            // The column on the shared edge takes the old height; the far side keeps more of its own.
            const edge = topSolid(blended, 0, 8);
            expect(Math.abs(edge - 150)).toBeLessThan(Math.abs(topSolid(plain, 0, 8) - 150));
            expect(Math.abs(edge - 150)).toBeLessThanOrEqual(2);

            const farPlain = await generate(30, 0);
            const farBlended = await generate(30, 0, reader);
            for (const [x, z] of [
                [0, 0],
                [8, 8],
                [15, 15]
            ] as const) {
                expect(topSolid(farBlended, x, z)).toBe(topSolid(farPlain, x, z));
            }
        },
        TIMEOUT
    );

    it(
        'blends a terrain tile built on a terrain worker',
        async () => {
            const { reader } = storedWith([[0, 0]], 150);
            const blended = await generate(1, 0, reader, true);
            expect(Math.abs(topSolid(blended, 0, 8) - 150)).toBeLessThanOrEqual(2);
        },
        TIMEOUT
    );
});
