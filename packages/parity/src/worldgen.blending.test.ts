import Chunk from '@jsprismarine/prismarine/world/chunk/Chunk';
import { CURRENT_GENERATION } from '@jsprismarine/prismarine/world/chunk/ChunkGeneration';
import type { ChunkGeneration } from '@jsprismarine/prismarine/world/chunk/ChunkGeneration';
import { Dimensions } from '@jsprismarine/prismarine/world/DimensionType';
import { BlockRuntimeIds } from '@jsprismarine/prismarine/block/state/BlockRuntimeIds';
import { DataDrivenGenerator } from '@jsprismarine/prismarine/world/generators/datadriven/DataDrivenGenerator';
import type { StoredChunkReader } from '@jsprismarine/prismarine/world/providers/Provider';
import { beforeAll, expect, it } from 'vitest';

import { checkAllowList } from './allowlist.ts';
import { FAMILIES } from './families.ts';
import { openGeneration } from './generation/capture.ts';
import { describeFamily } from './measure.ts';
import { reportParityProgress } from './progress.ts';
import { REFERENCES } from './references.ts';

/**
 * The world blender on real terrain.
 *
 * Java's blender itself is compared value for value in `@jsprismarine/worldgen`'s
 * `blending.test.ts`, against `vectors/blending.json`. This family measures what that buys the
 * server: a save holding an old chunk, new chunks generated around it, and whether they meet it.
 *
 * The old chunk is a flat stone plateau far above the natural surface, so a seam that did not
 * blend would be a cliff tens of blocks tall. Java fixes the surface height of the cells on an
 * old chunk's edge, so the new column touching the edge must reach the plateau's top.
 *
 * Gap ids: `seam:<old height>/<side>` when the touching column misses the plateau by more than
 * {@link SEAM_TOLERANCE} blocks, and `far:<x>,<z>` when a chunk out of the blender's reach changes.
 */

const SEED = 1234n;
/** The plateau heights, one above and one below the seed's natural surface around the origin. */
const OLD_HEIGHTS = [150, 20] as const;
/** The new chunks touching the old one at the origin, and the column of each that touches it. */
const SIDES = [
    { side: 'east', chunkX: 1, chunkZ: 0, x: 0, z: 8 },
    { side: 'west', chunkX: -1, chunkZ: 0, x: 15, z: 8 },
    { side: 'south', chunkX: 0, chunkZ: 1, x: 8, z: 0 },
    { side: 'north', chunkX: 0, chunkZ: -1, x: 8, z: 15 }
] as const;
/** A chunk well outside the blender's seven-chunk reach. */
const FAR = { chunkX: 12, chunkZ: -3 } as const;
/**
 * How far the touching column may sit from the plateau's top. The fixed height pins the density
 * cell, and interpolation inside a cell of eight blocks moves the surface by a block or two.
 */
const SEAM_TOLERANCE = 2;
/** Terrain-only chunks are under a second each; the budget covers loading the registries. */
const TIMEOUT = 600_000;

const environment = openGeneration();

const plateau = (height: number): Chunk => {
    const chunk = new Chunk(0, 0, new Map(), Dimensions.Overworld);
    const stone = BlockRuntimeIds.getByName('minecraft:stone');
    const grass = BlockRuntimeIds.getByName('minecraft:grass_block');
    for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
            chunk.fillColumn(x, z, -64, height - 1, stone);
            chunk.setBlockRuntimeId(x, height, z, grass);
        }
    }
    return chunk;
};

/** A save whose only old chunk is a plateau at the origin. */
const saveWith = (height: number): StoredChunkReader => {
    const old = plateau(height);
    const oldGeneration: ChunkGeneration = { dataVersion: 0, blending: { minSection: -4, maxSection: 20 } };
    return {
        generationAt: (x, z) => (x === 0 && z === 0 ? oldGeneration : CURRENT_GENERATION),
        terrainAt: (x, z) => (x === 0 && z === 0 ? old : undefined)
    };
};

const topSolid = (chunk: Chunk, x: number, z: number): number => {
    for (let y = chunk.getMaxY(); y >= chunk.getMinY(); y--) {
        const name = chunk.getBlock(x, y, z).name;
        if (name !== 'minecraft:air' && name !== 'minecraft:water') return y;
    }
    return chunk.getMinY();
};

describeFamily(FAMILIES.worldgenBlending, [REFERENCES.javaWorldgenData], () => {
    const gaps: string[] = [];
    const counts = { seams: 0, farColumns: 0 };

    const generate = async (chunkX: number, chunkZ: number, stored?: StoredChunkReader): Promise<Chunk> => {
        const generator = new DataDrivenGenerator({
            registries: environment!.registries,
            decorate: false,
            carve: false
        });
        if (stored !== undefined) generator.useStoredChunks(stored);
        try {
            return await generator.generateChunk(chunkX, chunkZ, SEED);
        } finally {
            generator.stopGenerating();
        }
    };

    beforeAll(async () => {
        for (const height of OLD_HEIGHTS) {
            const stored = saveWith(height);
            for (const { side, chunkX, chunkZ, x, z } of SIDES) {
                const top = topSolid(await generate(chunkX, chunkZ, stored), x, z);
                counts.seams++;
                if (Math.abs(top - height) > SEAM_TOLERANCE) gaps.push(`seam:${height}/${side}`);
            }
        }

        const plain = await generate(FAR.chunkX, FAR.chunkZ);
        const blended = await generate(FAR.chunkX, FAR.chunkZ, saveWith(OLD_HEIGHTS[0]));
        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                counts.farColumns++;
                if (topSolid(plain, x, z) !== topSolid(blended, x, z)) {
                    gaps.push(`far:${FAR.chunkX},${FAR.chunkZ}`);
                    return;
                }
            }
        }
    }, TIMEOUT);

    it('meets every old edge at the old surface and leaves chunks out of reach alone', () => {
        const verdict = checkAllowList(FAMILIES.worldgenBlending, gaps);
        expect(verdict.unexpected).toEqual([]);
        expect(verdict.stale).toEqual([]);
        reportParityProgress(FAMILIES.worldgenBlending, counts);
    });
});
