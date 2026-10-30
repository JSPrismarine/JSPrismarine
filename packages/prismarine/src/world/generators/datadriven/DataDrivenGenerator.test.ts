/**
 * The data-driven generator against Mojang's real data.
 *
 * Gated, because it reads the Java vanilla datapack and the data generator reports, neither of
 * which is published with this server:
 *
 * ```sh
 * pnpm --filter @jsprismarine/bedrock-data run fetch:sources
 * pnpm --filter @jsprismarine/bedrock-data run datagen:java
 * pnpm --filter @jsprismarine/prismarine exec vitest run src/world/generators
 * ```
 */
import { beforeAll, describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../../../block/state/BlockRuntimeIds';
import type Chunk from '../../chunk/Chunk';
import { PLAINS_BIOME } from '../../chunk/ChunkBiomes';
import { Dimensions } from '../../Dimension';
import { GenerationStopped } from '../../Generator';
import { DataDrivenGenerator } from './DataDrivenGenerator';
import { bedrockBiomeIdOf } from './javaTranslation';
import { findJavaWorldgenSources, loadJavaWorldgenRegistries } from './javaWorldgenData';

const sources = findJavaWorldgenSources();
const enabled = sources !== undefined;

const SEED = 1234n;

/** How long one chunk may take. Terrain alone is about 0.6 seconds, decoration adds to it. */
const CHUNK_TIMEOUT = 180_000;

describe.skipIf(!enabled)('the data-driven overworld', { tags: ['real-data'] }, () => {
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
        'serves another dimension through forStem without touching its own',
        async () => {
            const end = terrainOnly.forStem({
                noiseSettings: 'minecraft:end',
                biomeSource: { type: 'minecraft:the_end' },
                dimension: Dimensions.TheEnd
            });

            const [endChunk, overworld] = await Promise.all([
                end.generateChunk(0, 0, SEED),
                terrainOnly.generateChunk(0, 0, SEED)
            ]);

            expect(endChunk.getDimension()).toBe(Dimensions.TheEnd);
            expect(endChunk.getMinY()).toBe(0);
            expect(endChunk.getBiome(8, 64, 8)).toBe(bedrockBiomeIdOf('minecraft:the_end'));
            expect(columnOf(endChunk, 8, 8)).toContain('minecraft:end_stone');
            expect(columnOf(endChunk, 8, 8)).not.toContain('minecraft:bedrock');

            expect(overworld.getDimension()).toBe(Dimensions.Overworld);
            expect(overworld.getBlockRuntimeId(0, -64, 0)).toBe(BlockRuntimeIds.getByName('minecraft:bedrock'));
            expect(columnOf(overworld, 8, 8)).not.toContain('minecraft:end_stone');
        },
        CHUNK_TIMEOUT
    );

    it(
        'gives a different chunk for a different seed',
        async () => {
            const registries = loadJavaWorldgenRegistries(sources!);
            const other = new DataDrivenGenerator({ registries, decorate: false, carve: false });

            const mine = await terrainOnly.generateChunk(1, -2, SEED);
            const theirs = await other.generateChunk(1, -2, SEED + 1n);

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
        'runs the surface rule again under a cave mouth that took a grass block',
        async () => {
            const registries = loadJavaWorldgenRegistries(sources!);
            const carved = new DataDrivenGenerator({ registries, decorate: false });

            // Chunk 205,200 of this seed is plains with 36 grass blocks under a cave mouth.
            const plain = await terrainOnly.generateChunk(205, 200, SEED);
            const withCaves = await carved.generateChunk(205, 200, SEED);

            const exposed: string[] = [];
            for (let x = 0; x < 16; x++) {
                for (let z = 0; z < 16; z++) {
                    for (let y = plain.getMinY() + 1; y <= plain.getMaxY(); y++) {
                        if (plain.getBlock(x, y, z).name !== 'minecraft:grass_block') continue;
                        if (withCaves.getBlock(x, y, z).name === 'minecraft:grass_block') continue;
                        if (plain.getBlock(x, y - 1, z).name !== 'minecraft:dirt') continue;

                        // The carve may have taken the block below as well, which leaves the
                        // opening and nothing to re-surface.
                        const below = withCaves.getBlock(x, y - 1, z).name;
                        if (below === 'minecraft:air' || below === 'minecraft:water') continue;
                        exposed.push(below);
                    }
                }
            }

            expect(exposed.length).toBeGreaterThan(0);
            expect([...new Set(exposed)]).toEqual(['minecraft:grass_block']);
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

    /** Every block of the chunk whose name contains a fragment, counted by name. */
    const census = (chunk: Chunk, fragment: string): Map<string, number> => {
        const counts = new Map<string, number>();
        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                for (let y = chunk.getMinY(); y <= chunk.getMaxY(); y++) {
                    const name = chunk.getBlock(x, y, z).name;
                    if (name.includes(fragment)) counts.set(name, (counts.get(name) ?? 0) + 1);
                }
            }
        }
        return counts;
    };

    // These two chunks sit far enough inside their biome that all nine chunks of the decoration
    // neighborhood are the same biome, so nothing a neighbor lists can reach them either.
    const ICE_SPIKES_CHUNK = [-228, 64] as const;
    const TAIGA_CHUNK = [-516, -434] as const;

    it(
        'grows no tree on an ice spikes chunk',
        async () => {
            const registries = loadJavaWorldgenRegistries(sources!);
            const decorated = new DataDrivenGenerator({ registries, structures: false });
            const chunk = await decorated.generateChunk(...ICE_SPIKES_CHUNK, SEED);

            expect(chunk.getBiome(8, 70, 8)).toBe(bedrockBiomeIdOf('minecraft:ice_spikes'));
            expect([...census(chunk, '_log').keys()]).toEqual([]);
            expect([...census(chunk, 'leaves').keys()]).toEqual([]);
        },
        CHUNK_TIMEOUT
    );

    it(
        'grows one species of tree on a taiga chunk',
        async () => {
            const registries = loadJavaWorldgenRegistries(sources!);
            const decorated = new DataDrivenGenerator({ registries, structures: false });
            const chunk = await decorated.generateChunk(...TAIGA_CHUNK, SEED);
            const logs = census(chunk, '_log');

            expect(chunk.getBiome(8, 70, 8)).toBe(bedrockBiomeIdOf('minecraft:taiga'));
            // A vanilla chunk holds one or two species. Seven is what running every biome's
            // features in every chunk looked like.
            expect(logs.size).toBeGreaterThan(0);
            expect(logs.size).toBeLessThanOrEqual(2);
            expect([...logs.keys()]).toContain('minecraft:spruce_log');
        },
        CHUNK_TIMEOUT
    );

    it(
        'finishes the chunk it had started and refuses the ones queued behind it',
        async () => {
            const registries = loadJavaWorldgenRegistries(sources!);
            const stopping = new DataDrivenGenerator({
                registries,
                decorate: false,
                carve: false,
                concurrency: 1
            });

            // Asked for in one turn, the way the start region asks for a batch.
            const inFlight = stopping.generateChunk(0, 0, SEED);
            // Settled up front, because a shutdown refuses the queue the moment it is called
            // and a rejection nobody is waiting on yet is an unhandled one.
            const queued = Promise.allSettled([stopping.generateChunk(1, 0, SEED), stopping.generateChunk(2, 0, SEED)]);

            // One turn of the event loop, so the first request is past the front of the queue
            // and generating. That is the state a shutdown finds, and the one a half-built
            // chunk could come out of.
            await new Promise((resolve) => setImmediate(resolve));
            stopping.stopGenerating();

            expect((await inFlight).getHighestBlockAt(0, 0)).not.toBeNull();
            for (const result of await queued) {
                expect(result.status === 'rejected' && result.reason).toBeInstanceOf(GenerationStopped);
            }
        },
        CHUNK_TIMEOUT
    );

    it(
        'refuses everything past the depth it is building at, however large the batch',
        async () => {
            const registries = loadJavaWorldgenRegistries(sources!);
            const depth = 3;
            const stopping = new DataDrivenGenerator({
                registries,
                decorate: false,
                carve: false,
                concurrency: depth
            });

            // Thirty-two in one turn, which is what the start region asks for.
            const batch = Promise.allSettled(
                Array.from({ length: 32 }, (_entry, index) => stopping.generateChunk(index, 7, SEED))
            );
            await new Promise((resolve) => setImmediate(resolve));
            stopping.stopGenerating();

            const settled = await batch;
            const refused = settled.filter(
                (result) => result.status === 'rejected' && result.reason instanceof GenerationStopped
            );

            // Everything past the depth is dropped, which is what takes a cold preload's
            // shutdown from twenty-two seconds to under one.
            expect(refused).toHaveLength(settled.length - depth);
            expect(settled.filter((result) => result.status === 'fulfilled')).toHaveLength(depth);
        },
        CHUNK_TIMEOUT
    );

    it(
        'leaves no refusal for nobody to catch, the way the start region asks for a batch',
        async () => {
            // `World.preloadSpawnRegion` asks for thirty-two in one turn through `Promise.all`
            // over an async function that catches `GenerationStopped` itself. The server runs
            // with `--unhandled-rejections=strict`, so a refusal nothing is awaiting kills the
            // process, and refusing the whole queue the instant the stop arrives is exactly the
            // shape that produces one. This mirrors the real caller and fails the run if one
            // escapes, because Vitest reports an unhandled rejection as a run error.
            const registries = loadJavaWorldgenRegistries(sources!);
            const stopping = new DataDrivenGenerator({ registries, decorate: false, carve: false });

            const preloadChunk = async (x: number, z: number): Promise<boolean> => {
                try {
                    await stopping.generateChunk(x, z, SEED);
                    return true;
                } catch (error: unknown) {
                    if (error instanceof GenerationStopped) return false;
                    throw error;
                }
            };

            const batch = Promise.all(Array.from({ length: 32 }, (_entry, index) => preloadChunk(index, -11)));
            await new Promise((resolve) => setImmediate(resolve));
            stopping.stopGenerating();

            const loaded = await batch;
            expect(loaded.filter((generated) => generated).length).toBeLessThan(loaded.length);

            // A few turns for anything still floating to be reported before the test ends.
            for (let turn = 0; turn < 4; turn++) await new Promise((resolve) => setImmediate(resolve));
        },
        CHUNK_TIMEOUT
    );

    it(
        'refuses a request made after the shutdown, for a world it had never been asked about',
        async () => {
            const registries = loadJavaWorldgenRegistries(sources!);
            const stopping = new DataDrivenGenerator({ registries, decorate: false, carve: false });
            stopping.stopGenerating();

            await expect(stopping.generateChunk(0, 0, SEED + 1n)).rejects.toBeInstanceOf(GenerationStopped);
        },
        CHUNK_TIMEOUT
    );
});
