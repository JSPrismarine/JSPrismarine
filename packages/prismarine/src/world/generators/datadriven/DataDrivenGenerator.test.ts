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
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseWorldPreset } from '@jsprismarine/worldgen';
import { MultiNoiseBiomeSource } from '@jsprismarine/worldgen/biome/BiomeSource';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { BlockRuntimeIds } from '../../../block/state/BlockRuntimeIds';
import type Chunk from '../../chunk/Chunk';
import { PLAINS_BIOME } from '../../chunk/ChunkBiomes';
import { dimensionByName, Dimensions } from '../../DimensionType';
import { GenerationStopped } from '../../Generator';
import { DataDrivenGenerator } from './DataDrivenGenerator';
import { bedrockBiomeIdOf } from './javaTranslation';
import { findJavaWorldgenSources } from './javaWorldgenSources';
import { loadJavaWorldgenRegistries } from './javaWorldgenData';
import type { JavaWorldgenRegistries } from './javaWorldgenData';
import { ChunkCompletionQueue } from '../../ChunkCompletionQueue';

const sources = findJavaWorldgenSources();
const enabled = sources !== undefined;

const SEED = 1234n;

/** How long one chunk may take. Terrain alone is about 0.6 seconds, decoration adds to it. */
const CHUNK_TIMEOUT = 180_000;

describe.skipIf(!enabled)('the data-driven overworld', { tags: ['real-data'] }, () => {
    let terrainOnly: DataDrivenGenerator;
    let registries: JavaWorldgenRegistries;

    beforeAll(() => {
        registries = loadJavaWorldgenRegistries(sources!);
        terrainOnly = new DataDrivenGenerator({ registries, decorate: false, carve: false });
    }, CHUNK_TIMEOUT);

    const columnOf = (chunk: Chunk, x: number, z: number): string[] => {
        const column: string[] = [];
        for (let y = chunk.getMinY(); y <= chunk.getMaxY(); y++) column.push(chunk.getBlock(x, y, z).name);
        return column;
    };

    describe('terrain tile cache', () => {
        const root = mkdtempSync(join(tmpdir(), 'jsp-terrain-cache-'));
        afterAll(() => rmSync(root, { recursive: true, force: true }));

        /** Generates one chunk and reports what the cache did, then stops the generator. */
        const generateWith = async (
            codeVersion: string
        ): Promise<{ events: string[]; first: number; chunk: Chunk }> => {
            const events: string[] = [];
            const generator = new DataDrivenGenerator({
                registries,
                decorate: false,
                carve: false,
                persistentProtoCache: {
                    directory: root,
                    maxBytes: 64 * 1024 * 1024,
                    codeVersion,
                    onEvent: ({ type }) => events.push(type)
                }
            });
            const chunk = await generator.generateChunk(3, -2, SEED);
            generator.stopGenerating();
            return { events, first: chunk.getBlockRuntimeId(1, 0, 1), chunk };
        };

        it(
            'rebuilds a tile for a different code version and reuses it for the same one',
            async () => {
                const written = await generateWith('1.0.0');
                expect(written.events).toContain('miss');
                expect(written.events).toContain('write');

                const reused = await generateWith('1.0.0');
                expect(reused.events).toContain('hit');
                expect(reused.events).not.toContain('write');
                expect(reused.first).toBe(written.first);

                const upgraded = await generateWith('2.0.0');
                expect(upgraded.events).not.toContain('hit');
                expect(upgraded.events).toContain('write');
            },
            CHUNK_TIMEOUT
        );

        it("caches a tile in every dimension of Java's normal preset", async () => {
            // The cache key hashes each dimension's settings, so a settings field the hash
            // refuses fails that dimension's chunks while the Overworld's still load.
            const preset = parseWorldPreset(registries.worldPresets.get('minecraft:normal'));
            const events: string[] = [];
            const generator = new DataDrivenGenerator({
                registries,
                decorate: false,
                carve: false,
                persistentProtoCache: {
                    directory: mkdtempSync(join(root, 'dimensions-')),
                    maxBytes: 64 * 1024 * 1024,
                    onEvent: ({ type }) => events.push(type)
                }
            });

            try {
                for (const [id, stem] of preset.dimensions) {
                    const dimension = dimensionByName(stem.type);
                    const { generator: definition } = stem;
                    expect(dimension, id).toBeDefined();
                    expect(definition.type, id).toBe('minecraft:noise');
                    if (dimension === undefined || !('biomeSource' in definition)) continue;
                    expect(typeof definition.settings, id).toBe('string');
                    if (typeof definition.settings !== 'string') continue;

                    events.length = 0;
                    const chunk = await generator
                        .forStem({
                            noiseSettings: definition.settings,
                            biomeSource: definition.biomeSource,
                            dimension
                        })
                        .generateChunk(0, 0, SEED);
                    expect(chunk.getDimension(), id).toBe(dimension);
                    expect(events, id).toContain('write');
                }
            } finally {
                generator.stopGenerating();
            }
        });
    });

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
            expect(second).toBe(first);
            expect(second.networkSerialize().equals(first.networkSerialize())).toBe(true);

            const position = { x: 0, y: first.getMinY(), z: 0 };
            const original = first.getBlockRuntimeId(position.x, position.y, position.z);
            const air = BlockRuntimeIds.getByName('minecraft:air');
            first.setBlockRuntimeId(position.x, position.y, position.z, air);
            try {
                const repeated = await terrainOnly.generateChunk(1, -2, SEED);

                expect(repeated).toBe(first);
                expect(repeated.getBlockRuntimeId(position.x, position.y, position.z)).toBe(air);
            } finally {
                first.setBlockRuntimeId(position.x, position.y, position.z, original);
            }
        },
        CHUNK_TIMEOUT
    );

    it('gives each seed its own chunk while the same position waits for completion under both', async () => {
        const otherSeed = SEED + 1n;
        const expected = await terrainOnly.generateChunk(6, -3, otherSeed);
        const completionQueue = new ChunkCompletionQueue();
        completionQueue.activate();
        const queued = new DataDrivenGenerator({ registries, decorate: false, carve: false, completionQueue });
        const requested = [SEED, otherSeed].map((seed) =>
            queued.generateChunk(6, -3, seed, undefined, { urgency: 'idle' }).then(
                (chunk) => ({ chunk }),
                (error: unknown) => ({ error })
            )
        );

        try {
            for (let turn = 0; completionQueue.pending < requested.length && turn < 2000; turn++) {
                await new Promise<void>((resolve) => setImmediate(resolve));
            }
            // Both completions wait at once; before, the second seed shared the first's.
            expect(completionQueue.pending).toBe(requested.length);
            completionQueue.drain(Number.POSITIVE_INFINITY);
            const [first, second] = await Promise.all(requested);
            if (first === undefined || 'error' in first) throw first?.error;
            if (second === undefined || 'error' in second) throw second?.error;
            expect(second.chunk).not.toBe(first.chunk);
            expect(second.chunk.networkSerialize().equals(expected.networkSerialize())).toBe(true);
        } finally {
            completionQueue.deactivate();
            queued.stopGenerating();
        }
    });

    it('starts the next chunk while a finished one waits for its tick slice', async () => {
        const completionQueue = new ChunkCompletionQueue();
        completionQueue.activate();
        // One admission slot: before, a chunk held it until its completion ran, so the next chunk's
        // generation could not start while the server thread had not got to the first.
        const queued = new DataDrivenGenerator({
            registries,
            decorate: false,
            carve: false,
            concurrency: 1,
            completionQueue
        });
        const requested = [
            [4, -3],
            [5, -3]
        ].map(([x, z]) =>
            queued.generateChunk(x!, z!, SEED, undefined, { urgency: 'idle' }).then(
                (chunk) => ({ chunk }),
                (error: unknown) => ({ error })
            )
        );

        try {
            for (let turn = 0; completionQueue.pending < requested.length && turn < 2000; turn++) {
                await new Promise<void>((resolve) => setImmediate(resolve));
            }
            // Both chunks finished generating with neither completed.
            expect(completionQueue.pending).toBe(requested.length);
            expect(completionQueue.drain(Number.POSITIVE_INFINITY)).toBe(requested.length);
            for (const result of await Promise.all(requested)) {
                if ('error' in result) throw result.error;
            }
        } finally {
            completionQueue.deactivate();
            queued.stopGenerating();
        }
    });

    it(
        'keeps the generated bytes unchanged when a background result waits for its tick slice',
        async () => {
            const expected = await terrainOnly.generateChunk(2, -3, SEED);
            const completionQueue = new ChunkCompletionQueue();
            completionQueue.activate();
            const queued = new DataDrivenGenerator({
                registries,
                decorate: false,
                carve: false,
                completionQueue
            });
            const generated = queued.generateChunk(2, -3, SEED, undefined, { urgency: 'idle' }).then(
                (chunk) => ({ chunk }),
                (error: unknown) => ({ error })
            );

            try {
                for (let turn = 0; completionQueue.pending === 0 && turn < 1000; turn++) {
                    await new Promise<void>((resolve) => setImmediate(resolve));
                }
                expect(completionQueue.pending).toBe(1);
                expect(completionQueue.drain(2)).toBe(1);

                const result = await generated;
                if ('error' in result) throw result.error;
                expect(result.chunk.networkSerialize().equals(expected.networkSerialize())).toBe(true);
                expect(completionQueue.snapshot().byLabel['worker-result']?.completed).toBe(1);
            } finally {
                completionQueue.deactivate();
                queued.stopGenerating();
            }
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

    it("answers an explorer map's biome and structure lookups through forStem as itself", () => {
        // A world holds the per-stem view rather than the generator, so a lookup the view does not
        // forward is one the world never has: maps came out blank before it forwarded these.
        const overworld = terrainOnly.forStem({
            noiseSettings: 'minecraft:overworld',
            biomeSource: { type: 'minecraft:multi_noise', preset: 'minecraft:overworld' },
            dimension: Dimensions.Overworld
        });

        for (const [x, z] of [
            [0, 0],
            [-448, -192],
            [1000, 37]
        ] as const) {
            expect(overworld.biomeAt?.(x, 63, z, SEED)).toBe(terrainOnly.biomeAt(x, 63, z, SEED));
        }
        expect(overworld.structureStartsContaining?.({ x: 0, y: 64, z: 0 }, SEED)).toEqual(
            terrainOnly.structureStartsContaining({ x: 0, y: 64, z: 0 }, SEED)
        );
    });

    it(
        'reuses terrain scratch across seeds and chunks without changing fresh-generator results',
        async () => {
            const registries = loadJavaWorldgenRegistries(sources!);
            const fresh = new DataDrivenGenerator({ registries, decorate: false, carve: false });

            const mine = await terrainOnly.generateChunk(1, -2, SEED);
            const reused = await terrainOnly.generateChunk(-6, 7, SEED + 1n);
            const freshResult = await fresh.generateChunk(-6, 7, SEED + 1n);

            expect(columnOf(reused, 7, 9)).not.toEqual(columnOf(mine, 7, 9));
            expect(reused.networkSerialize().equals(freshResult.networkSerialize())).toBe(true);
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
        'hands a chunk the fluid Java ticks after generating it, all of it on fluid in that chunk',
        async () => {
            // Aquifer water the caves cut through: the fill and the carvers mark some of it.
            const carved = new DataDrivenGenerator({ registries, decorate: false });
            const seed = 2934897987023934859n;

            let ticks = 0;
            for (const [cx, cz] of [
                [100, -60],
                [101, -60],
                [100, -59],
                [101, -59]
            ] as const) {
                const chunk = await carved.generateChunk(cx, cz, seed);
                for (const tick of chunk.getPendingFluidTicks()) {
                    expect([tick.x >> 4, tick.z >> 4]).toEqual([cx, cz]);
                    expect(tick.delay).toBe(0);
                    expect(chunk.getBlock(tick.x & 15, tick.y, tick.z & 15).name).toMatch(/water|lava/);
                    ticks++;
                }
                // With no features, every tick is a fill or carver mark for post-processing, which
                // also asks for the block's shape update.
                expect(chunk.getPendingShapeUpdates()).toEqual(
                    chunk.getPendingFluidTicks().map(({ x, y, z }) => ({ x, y, z }))
                );
            }
            expect(ticks).toBeGreaterThan(0);
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

            // Asked for in one turn, the way the start region asks for a batch: at `idle`, because
            // `immediate` requests may use a reserve past the depth.
            const inFlight = stopping.generateChunk(0, 0, SEED, undefined, { urgency: 'idle' });
            // Settled up front, because a shutdown refuses the queue the moment it is called
            // and a rejection nobody is waiting on yet is an unhandled one.
            const queued = Promise.allSettled([
                stopping.generateChunk(1, 0, SEED, undefined, { urgency: 'idle' }),
                stopping.generateChunk(2, 0, SEED, undefined, { urgency: 'idle' })
            ]);

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
                Array.from({ length: 32 }, (_entry, index) =>
                    stopping.generateChunk(index, 7, SEED, undefined, { urgency: 'idle' })
                )
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
                    await stopping.generateChunk(x, z, SEED, undefined, { urgency: 'idle' });
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
        'fills each terrain tile of a view once when the view is requested nearest first',
        async () => {
            // The order a player session drains its view in: nearest first, which jumps between
            // the four sides of each ring, so the tiles one chunk reads were built many requests ago.
            const radius = 5;
            const view: [number, number][] = [];
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dz = -radius; dz <= radius; dz++)
                    if (dx * dx + dz * dz <= radius * radius) view.push([dx, dz]);
            }
            view.sort(([ax, az], [bx, bz]) => ax * ax + az * az - (bx * bx + bz * bz));

            const fills = new Map<string, number>();
            const generator = new DataDrivenGenerator({
                registries,
                carve: false,
                structures: false,
                onTerrainTileBuild: (_dimension, _seed, cx, cz) =>
                    fills.set(`${cx},${cz}`, (fills.get(`${cx},${cz}`) ?? 0) + 1)
            });
            for (const [x, z] of view) await generator.generateChunk(x, z, SEED);
            generator.stopGenerating();

            expect([...fills].filter(([, count]) => count > 1)).toEqual([]);
        },
        CHUNK_TIMEOUT * 4
    );

    it('reads the biomes of a feature pass from the cells its terrain tiles carry', async () => {
        const center = { x: 10, z: 4 };
        const builder = new DataDrivenGenerator({ registries });
        const tiles = [];
        for (const dx of [-1, 0, 1]) {
            for (const dz of [-1, 0, 1]) {
                tiles.push((await builder.buildTerrainTile(center.x + dx, center.z + dz, SEED, [])).payload);
            }
        }

        // A tile far from the nine builds the generator's pipeline, which binds the biome source,
        // so the climate lookups its memo does not answer can be counted from then on.
        const generator = new DataDrivenGenerator({ registries });
        const bound = vi.spyOn(MultiNoiseBiomeSource.prototype, 'resolver');
        await generator.buildTerrainTile(center.x + 64, center.z, SEED, []);
        const source = bound.mock.contexts[0];
        bound.mockRestore();
        if (!(source instanceof MultiNoiseBiomeSource)) throw new Error('the overworld bound no climate source');
        const searches = vi.spyOn(source.parameters, 'find');

        generator.buildFeatureTile(center.x, center.z, SEED, tiles);

        // The nine tiles carry every cell of their chunks. Read cell by cell, the biome palette
        // of the nine missed the memo for over a thousand of them; what is left is the jittered biome
        // lookups that reach past the tiles.
        const cellsPerChunk = (Dimensions.Overworld.height / 4) * 16;
        expect(searches.mock.calls.length).toBeLessThan(cellsPerChunk / 8);
    });

    describe('the biomes of a chunk generated on this thread', () => {
        const side = 3;
        let ownCellSearches = 0;

        // Generating the block is the slow part and the only thing the assertion waits on.
        beforeAll(
            async () => {
                const generator = new DataDrivenGenerator({ registries });
                // A tile far from the chunks under test binds the biome source and its climate
                // sampler, so every climate search from then on can be counted with its cell.
                const bound = vi.spyOn(MultiNoiseBiomeSource.prototype, 'resolver');
                await generator.buildTerrainTile(200, 0, SEED, []);
                const sampler = bound.mock.calls[0]?.[0];
                bound.mockRestore();
                if (sampler === undefined) throw new Error('the overworld bound no climate source');
                const samples = vi.spyOn(sampler, 'sample');

                for (let x = 0; x < side; x++) {
                    for (let z = 0; z < side; z++) await generator.generateChunk(x, z, SEED);
                }
                generator.stopGenerating();
                ownCellSearches = samples.mock.calls.filter(
                    ([quartX, , quartZ]) =>
                        quartX >> 2 >= 0 && quartX >> 2 < side && quartZ >> 2 >= 0 && quartZ >> 2 < side
                ).length;
                samples.mockRestore();
            },
            CHUNK_TIMEOUT * side * side
        );

        it('are packed from the cells the terrain pass sampled, without searching the climate again', () => {
            // Each cell of a chunk is searched once by its terrain pass. What else reaches a chunk's
            // own cells is the jittered lookups of carvers, the surface and the decoration of the
            // chunks around it, where the memo has evicted the cell. Translation also repacked every
            // cell from the biome source, which took this to 21,211 for 13,824 cells; packing from
            // the tile's cells leaves about 15,400. The surface pass also reads the eight cells
            // around each block it folds a biome condition over, which holds more cells in the memo
            // and evicts more: 15,700 to 16,800 here. Which cells collide depends on the order the
            // terrain passes interleave in, which their wall-clock yields decide, so the count moves
            // between runs and the bound leaves room for that while still failing at 21,211.
            const cells = side * side * (Dimensions.Overworld.height / 4) * 16;
            expect(ownCellSearches).toBeGreaterThanOrEqual(cells);
            expect(ownCellSearches).toBeLessThan(cells * 1.3);
        });
    });

    describe('the holders kept around a generated block', () => {
        const side = 7;
        const builds = new Map<string, number>();
        let retained = 0;

        // Generating the block is the slow part and the only thing the assertions wait on.
        beforeAll(
            async () => {
                const generator = new DataDrivenGenerator({
                    registries,
                    carve: false,
                    structures: false,
                    onTerrainTileBuild: (_dimension, _seed, cx, cz) =>
                        builds.set(`${cx},${cz}`, (builds.get(`${cx},${cz}`) ?? 0) + 1)
                });
                for (let x = 0; x < side; x++) {
                    for (let z = 0; z < side; z++) await generator.generateChunk(x, z, SEED);
                }
                // The pipeline is private; its retained set is the count this test is about.
                const pipelines: unknown = Reflect.get(generator, 'pipelines');
                if (!(pipelines instanceof Map)) throw new Error('the generator keeps no pipelines');
                for (const pipeline of pipelines.values()) {
                    const held: unknown = Reflect.get(pipeline, 'retained');
                    if (held instanceof Map) retained += held.size;
                }
                generator.stopGenerating();
            },
            CHUNK_TIMEOUT * side * side
        );

        it('lets go of every holder whose readers have all finished, and builds no tile twice', () => {
            // A chunk reads the terrain of the chunks within two of it, so the block keeps holders
            // over an 11 by 11 square. Only the inner 3 by 3 have every reader inside the block.
            const acquired = (side + 4) * (side + 4);
            const settled = (side - 4) * (side - 4);
            expect(retained).toBe(acquired - settled);
            expect([...builds.values()].filter((count) => count > 1)).toEqual([]);
        });
    });

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
