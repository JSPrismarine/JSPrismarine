/**
 * The data-driven generator against Mojang's real data.
 *
 * Gated, because it reads the Java vanilla datapack and the data generator reports, neither of
 * which is published with this server:
 *
 * ```sh
 * pnpm --filter @jsprismarine/bedrock-data run fetch:sources
 * pnpm --filter @jsprismarine/bedrock-data run datagen:java
 * JSP_WORLDGEN_VANILLA=1 pnpm --filter @jsprismarine/prismarine exec vitest run src/world/generators
 * ```
 */
import { beforeAll, describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../../../block/state/BlockRuntimeIds';
import type Chunk from '../../chunk/Chunk';
import { PLAINS_BIOME } from '../../chunk/ChunkBiomes';
import { DataDrivenGenerator } from './DataDrivenGenerator';
import { findJavaWorldgenSources, loadJavaWorldgenRegistries } from './javaWorldgenData';

const sources = findJavaWorldgenSources();
const enabled = process.env.JSP_WORLDGEN_VANILLA === '1' && sources !== undefined;

const SEED = 1234;

/** How long one chunk may take. Terrain alone is about 0.6 seconds, decoration adds to it. */
const CHUNK_TIMEOUT = 180_000;

describe.skipIf(!enabled)('the data-driven overworld', () => {
    let terrainOnly: DataDrivenGenerator;

    beforeAll(() => {
        const registries = loadJavaWorldgenRegistries(sources!);
        terrainOnly = new DataDrivenGenerator({ registries, decorate: false, carve: false });
    }, CHUNK_TIMEOUT);

    const columnOf = (chunk: Chunk, x: number, z: number): string[] => {
        const column: string[] = [];
        for (let y = chunk.getMinY(); y <= chunk.getMaxY(); y++) column.push(chunk.getBlock(x, y, z).name);
        return column;
    };

    it(
        'builds terrain with a stone floor, a surface and air above it',
        async () => {
            const chunk = await terrainOnly.generateChunk(0, 0, SEED);
            const column = columnOf(chunk, 0, 0);

            expect(chunk.getBlockRuntimeId(0, -64, 0)).toBe(BlockRuntimeIds.getByName('minecraft:bedrock'));
            expect(column.filter((name) => name !== 'minecraft:air').length).toBeGreaterThan(60);
            expect(chunk.getHighestBlockAt(0, 0)).not.toBeNull();
        },
        CHUNK_TIMEOUT
    );

    it(
        'gives the same chunk for the same seed',
        async () => {
            const first = await terrainOnly.generateChunk(1, -2, SEED);
            const second = await terrainOnly.generateChunk(1, -2, SEED);

            expect(columnOf(second, 7, 9)).toEqual(columnOf(first, 7, 9));
            expect(second.networkSerialize().equals(first.networkSerialize())).toBe(true);
        },
        CHUNK_TIMEOUT
    );

    it(
        'gives a different chunk for a different seed',
        async () => {
            const registries = loadJavaWorldgenRegistries(sources!);
            const other = new DataDrivenGenerator({ registries, decorate: false, carve: false });

            const mine = await terrainOnly.generateChunk(1, -2, SEED);
            const theirs = await other.generateChunk(1, -2, SEED + 1);

            expect(columnOf(theirs, 7, 9)).not.toEqual(columnOf(mine, 7, 9));
        },
        CHUNK_TIMEOUT
    );

    it(
        'names a real biome in every section rather than the plains constant',
        async () => {
            const chunk = await terrainOnly.generateChunk(0, 0, SEED);
            const ids = new Set<number>();
            for (let y = chunk.getMinY(); y <= chunk.getMaxY(); y += 4) ids.add(chunk.getBiome(0, y, 0));

            expect(ids.size).toBeGreaterThan(0);
            expect([...ids].every((id) => Number.isInteger(id) && id >= 0)).toBe(true);
            // A chunk whose every biome is plains would mean the source was never consulted.
            expect([...ids]).not.toEqual([PLAINS_BIOME]);
        },
        CHUNK_TIMEOUT
    );

    it(
        'places every Java state the terrain produced',
        async () => {
            await terrainOnly.generateChunk(0, 0, SEED);

            expect(terrainOnly.unmappedStates(SEED)).toEqual([]);
        },
        CHUNK_TIMEOUT
    );

    it(
        'carves caves into the terrain',
        async () => {
            const registries = loadJavaWorldgenRegistries(sources!);
            const carved = new DataDrivenGenerator({ registries, decorate: false });

            const plain = await terrainOnly.generateChunk(4, 4, SEED);
            const withCaves = await carved.generateChunk(4, 4, SEED);

            let opened = 0;
            for (let x = 0; x < 16; x++) {
                for (let z = 0; z < 16; z++) {
                    for (let y = -60; y < 60; y++) {
                        if (
                            plain.getBlock(x, y, z).name !== 'minecraft:air' &&
                            withCaves.getBlock(x, y, z).name === 'minecraft:air'
                        ) {
                            opened++;
                        }
                    }
                }
            }

            expect(opened).toBeGreaterThan(0);
        },
        CHUNK_TIMEOUT
    );

    it(
        'decorates a chunk',
        async () => {
            const registries = loadJavaWorldgenRegistries(sources!);
            const decorated = new DataDrivenGenerator({ registries, carve: false });

            const plain = await terrainOnly.generateChunk(8, -8, SEED);
            const full = await decorated.generateChunk(8, -8, SEED);

            let changed = 0;
            for (let x = 0; x < 16; x++) {
                for (let z = 0; z < 16; z++) {
                    for (let y = -64; y < 200; y++) {
                        if (plain.getBlock(x, y, z).name !== full.getBlock(x, y, z).name) changed++;
                    }
                }
            }

            expect(changed).toBeGreaterThan(0);
        },
        CHUNK_TIMEOUT
    );
});
