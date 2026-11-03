import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
    DataDrivenGenerator,
    defaultChunkPipeline,
    defaultTerrainPipeline
} from '@jsprismarine/prismarine/world/generators/datadriven/DataDrivenGenerator';
import { SharedTerrainTileStore } from '@jsprismarine/prismarine/world/generators/datadriven/SharedTerrainTileStore';
import { chunkWorkerCount } from '@jsprismarine/prismarine/world/generators/chunkConcurrency';
import { beforeAll, describe, expect, it } from 'vitest';

import { checkAllowList } from './allowlist.ts';
import { FAMILIES } from './families.ts';
import type { GenerationEnvironment } from './generation/capture.ts';
import { captureChunk, openGeneration } from './generation/capture.ts';
import type { CorpusChunk } from './generation/plan.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';
import { parityCase, reportParityCases } from './trackerCases.ts';

/**
 * Three properties the chunk generation rewrite needs, measured on the generator it replaces.
 *
 * The rewrite runs the chunk status ladder across worker threads, which means a chunk may be
 * generated in any order, in a batch of any size, beside any set of neighbors. That is only
 * safe if a chunk is a function of the seed and its coordinates. The three properties here say
 * whether it is:
 *
 * 1. **Repeatable.** The same chunk, generated twice from scratch, is the same chunk.
 * 2. **Order independent.** A chunk generated after its neighbors is the chunk it would have
 *    been generated first.
 * 3. **Stable once handed out.** A chunk already returned does not change when a neighbor is
 *    generated afterwards.
 *
 * All three hold. Only the first did until the chunk status ladder landed: the generator kept a
 * per-seed cache of neighbor terrain and of the feature output that spilled across chunk borders,
 * and replayed that output into terrain it built later and into chunks it had already returned.
 * Both gaps were allow-listed as defects, and the allow list fails on an entry that has stopped
 * gapping, so the row went red on the change that fixed them and the entries went with it.
 *
 * Gap ids, if either ever comes back: `order-dependent:<seed>/<x>,<z>` and
 * `mutates-after-handoff:<seed>/<x>,<z>`.
 */

/** Each subject is generated ten times over, and a decorated chunk is seconds. */
const DETERMINISM_TIMEOUT = 1_800_000;

/**
 * The chunks the properties are measured on, and why it takes two.
 *
 * Deep ocean at the world origin is the cheap one and it is a weak witness on its own. The
 * merge order only decides anything where two of a chunk's eight neighbors write the same
 * block, and an ocean chunk has almost no feature writes to collide. Measured: a merge that
 * applies the inbound patches in the order the neighbors finished rather than in position order
 * leaves this chunk's digest exactly where it was.
 *
 * The forest chunk is the one that catches it. It is the corpus's tall decorated chunk, oak and
 * birch over a surface near y 126, where trees and underground blobs reach in from every side.
 */
const SUBJECTS = [
    { seed: 1234, chunkX: 0, chunkZ: 0, why: 'deep ocean at the world origin' },
    { seed: 987_654_321, chunkX: -96, chunkZ: 48, why: 'oak and birch forest over a surface near y 126' }
] as const;

/** The four chunks whose decoration can write across a subject's border. */
const NEIGHBORS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
] as const;

/** Chunks on one ancient city's box, split across the whole-chunk pool's eight-chunk regions. */
const SHARD_POOL_SUBJECTS = [
    {
        id: '987654321/22,23/full',
        seed: 987_654_321,
        chunkX: 22,
        chunkZ: 23,
        tier: 'full',
        why: 'west side of an ancient city crossing shard regions'
    },
    {
        id: '987654321/26,23/full',
        seed: 987_654_321,
        chunkX: 26,
        chunkZ: 23,
        tier: 'full',
        why: 'middle of an ancient city crossing shard regions'
    },
    {
        id: '987654321/34,23/full',
        seed: 987_654_321,
        chunkX: 34,
        chunkZ: 23,
        tier: 'full',
        why: 'east side of an ancient city crossing shard regions'
    },
    {
        id: '1234/12,128/full',
        seed: 1234,
        chunkX: 12,
        chunkZ: 128,
        tier: 'full',
        why: 'west end of a mineshaft crossing shard regions'
    },
    {
        id: '1234/16,128/full',
        seed: 1234,
        chunkX: 16,
        chunkZ: 128,
        tier: 'full',
        why: 'a mineshaft chunk holding its cave spider spawner'
    },
    {
        id: '1234/20,128/full',
        seed: 1234,
        chunkX: 20,
        chunkZ: 128,
        tier: 'full',
        why: 'east end of the same mineshaft'
    },
    {
        id: '1234/16,124/full',
        seed: 1234,
        chunkX: 16,
        chunkZ: 124,
        tier: 'full',
        why: 'north edge of the same mineshaft'
    },
    {
        id: '1234/16,133/full',
        seed: 1234,
        chunkX: 16,
        chunkZ: 133,
        tier: 'full',
        why: 'south edge of the same mineshaft'
    }
] as const satisfies readonly CorpusChunk[];

const SHARD_POOL_WORKERS = [...new Set([1, Math.max(2, chunkWorkerCount())])];

const environment = openGeneration();

const fresh = (where: GenerationEnvironment): DataDrivenGenerator =>
    new DataDrivenGenerator({ registries: where.registries, templates: where.templates });

const WORKER_SEED = 987_654_321;
const WORKER_CHUNKS = [
    [-96, 48],
    [-95, 48],
    [-96, 49],
    [-95, 49]
] as const;

const terrainDigestForWorkers = async (workers: number, shareClimateTables: boolean): Promise<string> => {
    const options = {
        registries: environment!.registries,
        decorate: false,
        structures: false,
        terrain: {
            pipeline: defaultTerrainPipeline(),
            workers,
            onUnavailable: (reason: string) => {
                throw new Error(`Climate sharing parity needs ${workers} terrain workers: ${reason}`);
            }
        },
        ...(shareClimateTables ? {} : { shareClimateTables: false })
    };
    const generator = new DataDrivenGenerator(options);
    const order = workers % 2 === 0 ? [...WORKER_CHUNKS].reverse() : WORKER_CHUNKS;
    try {
        const digests = await Promise.all(
            order.map(async ([chunkX, chunkZ]) => {
                const chunk = await generator.generateChunk(chunkX, chunkZ, BigInt(WORKER_SEED));
                const digest = captureChunk(
                    {
                        id: `worker/${workers}/${chunkX},${chunkZ}`,
                        tier: 'terrain',
                        why: 'shared climate table parity',
                        seed: WORKER_SEED,
                        chunkX,
                        chunkZ
                    },
                    chunk
                ).digest.digests;
                return `${chunkX},${chunkZ}:${JSON.stringify(digest)}`;
            })
        );
        return digests.sort().join('|');
    } finally {
        generator.stopGenerating();
    }
};

/** What one subject's four generations produced, as digests over its block state names. */
interface Readings {
    alone: string;
    repeated: string;
    afterNeighbors: string;
    afterHandoff: string;
}

const readingsFor = async (subject: (typeof SUBJECTS)[number]): Promise<Readings> => {
    const { seed, chunkX, chunkZ } = subject;
    const worldSeed = BigInt(seed);
    const digest = (chunk: Parameters<typeof captureChunk>[1]): string =>
        captureChunk({ id: 'subject', tier: 'full', why: subject.why, seed, chunkX, chunkZ }, chunk).digest.digests
            .blocks;

    const first = fresh(environment!);
    const chunk = await first.generateChunk(chunkX, chunkZ, worldSeed);
    const alone = digest(chunk);
    const repeated = digest(await fresh(environment!).generateChunk(chunkX, chunkZ, worldSeed));

    const later = fresh(environment!);
    for (const [x, z] of NEIGHBORS) await later.generateChunk(chunkX + x, chunkZ + z, worldSeed);
    const afterNeighbors = digest(await later.generateChunk(chunkX, chunkZ, worldSeed));

    // The same object the first generator handed back, read again now that its four neighbors
    // have been generated in the same generator.
    for (const [x, z] of NEIGHBORS) await first.generateChunk(chunkX + x, chunkZ + z, worldSeed);
    return { alone, repeated, afterNeighbors, afterHandoff: digest(chunk) };
};

/** Builds the structure-bearing chunks through the whole-chunk worker pool. */
const shardPoolDigestsFor = async (
    workers: number,
    sharedTerrainTileStore?: SharedTerrainTileStore
): Promise<ReadonlyMap<string, string>> => {
    let unavailable: string | undefined;
    const generator = new DataDrivenGenerator({
        registries: environment!.registries,
        templates: environment!.templates,
        ...(sharedTerrainTileStore === undefined ? {} : { sharedTerrainTileStore }),
        chunks: {
            pipeline: defaultChunkPipeline(),
            workers,
            onUnavailable: (reason) => {
                unavailable = reason;
            }
        }
    });

    try {
        // Reverse the request order at larger pool sizes. The same chunk digest must survive
        // both a different shard count and a different order for chunks crossed by one layout.
        const subjects = workers === 1 ? SHARD_POOL_SUBJECTS : [...SHARD_POOL_SUBJECTS].reverse();
        const results = await Promise.all(
            subjects.map(async (subject) => {
                const chunk = await generator.generateChunk(subject.chunkX, subject.chunkZ, BigInt(subject.seed));
                const digest = captureChunk(subject, chunk).digest.digests;
                return [subject.id, JSON.stringify(digest)] as const;
            })
        );

        if (unavailable !== undefined) throw new Error(`Whole-chunk workers unavailable: ${unavailable}`);
        return new Map(results);
    } finally {
        generator.stopGenerating();
    }
};

describeFamily(FAMILIES.worldgenDeterminism, [REFERENCES.javaWorldgenData, REFERENCES.javaServerJar], () => {
    const readings = new Map<string, Readings>();
    const workerDigests = new Map<string, string>();

    beforeAll(async () => {
        for (const subject of SUBJECTS) {
            readings.set(`${subject.seed}/${subject.chunkX},${subject.chunkZ}`, await readingsFor(subject));
        }
        for (const workers of [1, 2, 4]) {
            workerDigests.set(`shared:${workers}`, await terrainDigestForWorkers(workers, true));
        }
        workerDigests.set('local:2', await terrainDigestForWorkers(2, false));
    }, DETERMINISM_TIMEOUT);

    it(
        'keeps terrain digests across worker counts and the local climate-table fallback',
        () => {
            const baseline = workerDigests.get('shared:1');
            if (baseline === undefined) throw new Error('Missing one-worker climate-sharing digest');

            const cases = [
                ...[1, 2, 4].map((workers) => {
                    const digest = workerDigests.get(`shared:${workers}`);
                    return parityCase(
                        `climate-workers:${workers}`,
                        `${WORKER_SEED}/-96,48..-95,49`,
                        `climate table sharing with ${workers} worker${workers === 1 ? '' : 's'}`,
                        digest === baseline
                    );
                }),
                parityCase(
                    'climate-local-fallback',
                    `${WORKER_SEED}/-96,48..-95,49`,
                    'local climate table construction with two workers',
                    workerDigests.get('local:2') === baseline
                )
            ];
            reportParityCases(FAMILIES.worldgenDeterminism, import.meta.filename, cases);

            expect(workerDigests.get('shared:2')).toBe(baseline);
            expect(workerDigests.get('shared:4')).toBe(baseline);
            expect(workerDigests.get('local:2')).toBe(baseline);
        },
        DETERMINISM_TIMEOUT
    );

    describe.each(SUBJECTS)('$seed/$chunkX,$chunkZ, $why', (subject) => {
        const at = `${subject.seed}/${subject.chunkX},${subject.chunkZ}`;

        it('gives the same chunk twice for the same seed and coordinates', () => {
            const found = readings.get(at)!;
            reportParityCases(FAMILIES.worldgenDeterminism, import.meta.filename, [
                parityCase(
                    `repeat:${at}`,
                    at,
                    `Java worldgen chunk repeated with seed ${subject.seed}`,
                    found.repeated === found.alone
                )
            ]);
            expect(found.repeated).toBe(found.alone);
        });

        it('reports every order and batching dependence the allow list knows about', () => {
            const found = readings.get(at)!;
            const gaps: string[] = [];
            if (found.afterNeighbors !== found.alone) gaps.push(`order-dependent:${at}`);
            if (found.afterHandoff !== found.alone) gaps.push(`mutates-after-handoff:${at}`);

            const verdict = checkAllowList(FAMILIES.worldgenDeterminism, gaps);
            const unexpected = new Set(verdict.unexpected);
            reportParityCases(FAMILIES.worldgenDeterminism, import.meta.filename, [
                parityCase(
                    `order:${at}`,
                    at,
                    `Java worldgen chunk generated after neighboring chunks · seed ${subject.seed}`,
                    !unexpected.has(`order-dependent:${at}`)
                ),
                parityCase(
                    `handoff:${at}`,
                    at,
                    `Java worldgen chunk read after neighboring chunks · seed ${subject.seed}`,
                    !unexpected.has(`mutates-after-handoff:${at}`)
                )
            ]);
            expect(
                verdict.unexpected,
                `generated alone ${found.alone}, after its neighbors ${found.afterNeighbors}, ` +
                    `read again after its neighbors ${found.afterHandoff}`
            ).toEqual([]);
            expect(verdict.stale).toEqual([]);
        });
    });

    describe('whole-chunk shard pools', () => {
        const digests = new Map<number, ReadonlyMap<string, string>>();
        const sharedDigests = new Map<
            number,
            { readonly cold: ReadonlyMap<string, string>; readonly warm: ReadonlyMap<string, string> }
        >();
        const sharedWarmHits = new Map<number, number>();

        beforeAll(async () => {
            for (const workers of SHARD_POOL_WORKERS) {
                digests.set(workers, await shardPoolDigestsFor(workers));
            }
            for (const workers of SHARD_POOL_WORKERS) {
                const sharedTerrainTileStore = new SharedTerrainTileStore({
                    maxBytes: 64 * 1024 * 1024,
                    maxTileBytes: 512 * 1024
                });
                const cold = await shardPoolDigestsFor(workers, sharedTerrainTileStore);
                const hitsAfterColdRun = sharedTerrainTileStore.getStats().hits;
                const warm = await shardPoolDigestsFor(workers, sharedTerrainTileStore);
                sharedDigests.set(workers, { cold, warm });
                sharedWarmHits.set(workers, sharedTerrainTileStore.getStats().hits - hitsAfterColdRun);
            }
        }, DETERMINISM_TIMEOUT);

        it('keeps structure output digests stable across pool sizes and request order', () => {
            const baseline = digests.get(SHARD_POOL_WORKERS[0]!);
            if (baseline === undefined) throw new Error('The one-worker shard-pool digest was not captured');

            const found = digests.get(SHARD_POOL_WORKERS.at(-1)!);
            if (found === undefined) throw new Error('The multi-worker shard-pool digest was not captured');

            reportParityCases(
                FAMILIES.worldgenDeterminism,
                import.meta.filename,
                SHARD_POOL_SUBJECTS.map((subject) =>
                    parityCase(
                        `shard-pool:${subject.id}`,
                        subject.id,
                        `Ancient city chunk digest across ${SHARD_POOL_WORKERS[0]} and ${SHARD_POOL_WORKERS.at(-1)} workers`,
                        baseline.get(subject.id) === found.get(subject.id)
                    )
                )
            );

            for (const subject of SHARD_POOL_SUBJECTS) {
                expect(found.get(subject.id), subject.id).toBe(baseline.get(subject.id));
            }
        });

        it(
            'keeps cold and warm shared-terrain digests equal to worker-local generation',
            () => {
                const cases = SHARD_POOL_WORKERS.flatMap((workers) => {
                    const shared = sharedDigests.get(workers);
                    return SHARD_POOL_SUBJECTS.flatMap((subject) =>
                        (['cold', 'warm'] as const).map((state) =>
                            parityCase(
                                `shared-terrain:${state}:${workers}:${subject.id}`,
                                subject.id,
                                `${state} shared terrain tiles with ${workers} worker${workers === 1 ? '' : 's'}`,
                                shared?.[state].get(subject.id) === digests.get(workers)?.get(subject.id)
                            )
                        )
                    );
                });
                reportParityCases(FAMILIES.worldgenDeterminism, import.meta.filename, cases);

                for (const workers of SHARD_POOL_WORKERS) {
                    for (const subject of SHARD_POOL_SUBJECTS) {
                        const shared = sharedDigests.get(workers);
                        const localDigest = digests.get(workers)?.get(subject.id);
                        expect(shared?.cold.get(subject.id), `cold · ${workers} workers · ${subject.id}`).toBe(
                            localDigest
                        );
                        expect(shared?.warm.get(subject.id), `warm · ${workers} workers · ${subject.id}`).toBe(
                            localDigest
                        );
                    }
                    expect(sharedWarmHits.get(workers), `${workers} workers warm shared-cache hits`).toBeGreaterThan(0);
                }
            },
            DETERMINISM_TIMEOUT
        );
    });

    it(
        'preserves the chunk digest across cache miss, restart, corruption, and seed invalidation',
        async () => {
            const subject = SUBJECTS[0];
            if (subject === undefined || environment === undefined) throw new Error('Worldgen parity data is missing');

            const directory = mkdtempSync(join(tmpdir(), 'jsp-terrain-proto-parity-'));
            const events: string[] = [];
            const generatorWithCache = (): DataDrivenGenerator =>
                new DataDrivenGenerator({
                    registries: environment.registries,
                    templates: environment.templates,
                    persistentProtoCache: {
                        directory,
                        maxBytes: 64 * 1024 * 1024,
                        onEvent: ({ type }) => events.push(type)
                    }
                });
            const digest = (chunk: Parameters<typeof captureChunk>[1], seed: number): string =>
                captureChunk(
                    {
                        id: 'persistent terrain cache',
                        tier: 'full',
                        why: 'cache reload preserves the generated chunk',
                        seed,
                        chunkX: subject.chunkX,
                        chunkZ: subject.chunkZ
                    },
                    chunk
                ).digest.digests.blocks;

            try {
                const baseline = fresh(environment);
                let expected: string;
                try {
                    expected = digest(
                        await baseline.generateChunk(subject.chunkX, subject.chunkZ, BigInt(subject.seed)),
                        subject.seed
                    );
                } finally {
                    baseline.stopGenerating();
                }

                const first = generatorWithCache();
                try {
                    const missed = digest(
                        await first.generateChunk(subject.chunkX, subject.chunkZ, BigInt(subject.seed)),
                        subject.seed
                    );
                    expect(missed).toBe(expected);
                    expect(events).toContain('write');
                } finally {
                    first.stopGenerating();
                }

                const records = readdirSync(directory).filter((name) => name.endsWith('.bin'));
                expect(records.length).toBeGreaterThan(0);
                const corruptPath = join(directory, records[0]!);
                const corruptRecord = readFileSync(corruptPath);
                const finalByte = corruptRecord.at(-1);
                if (finalByte === undefined) throw new Error('Terrain cache record is empty');
                corruptRecord[corruptRecord.length - 1] = finalByte ^ 1;
                writeFileSync(corruptPath, corruptRecord);

                events.length = 0;
                const restarted = generatorWithCache();
                try {
                    const restored = digest(
                        await restarted.generateChunk(subject.chunkX, subject.chunkZ, BigInt(subject.seed)),
                        subject.seed
                    );
                    expect(restored).toBe(expected);
                    expect(events).toContain('hit');
                    expect(events).toContain('corrupt');
                    expect(events).toContain('write');
                } finally {
                    restarted.stopGenerating();
                }

                const nextSeed = subject.seed + 1;
                events.length = 0;
                const changedWorld = generatorWithCache();
                try {
                    const changed = digest(
                        await changedWorld.generateChunk(subject.chunkX, subject.chunkZ, BigInt(nextSeed)),
                        nextSeed
                    );
                    expect(events).toContain('miss');

                    const changedBaseline = fresh(environment);
                    try {
                        expect(changed).toBe(
                            digest(
                                await changedBaseline.generateChunk(subject.chunkX, subject.chunkZ, BigInt(nextSeed)),
                                nextSeed
                            )
                        );
                    } finally {
                        changedBaseline.stopGenerating();
                    }

                    reportParityCases(FAMILIES.worldgenDeterminism, import.meta.filename, [
                        parityCase(
                            'proto-cache:miss',
                            '0/0,0',
                            'Fresh cache records keep the fresh chunk digest',
                            true
                        ),
                        parityCase('proto-cache:restart', '0/0,0', 'Restart cache hits keep the chunk digest', true),
                        parityCase(
                            'proto-cache:corruption',
                            '0/0,0',
                            'Corrupt records regenerate with the same digest',
                            true
                        ),
                        parityCase(
                            'proto-cache:seed',
                            '0/0,0',
                            'A changed seed misses and keeps its fresh digest',
                            true
                        )
                    ]);
                } finally {
                    changedWorld.stopGenerating();
                }
            } finally {
                rmSync(directory, { recursive: true, force: true });
            }
        },
        DETERMINISM_TIMEOUT
    );
});
