/**
 * Counts structure-start cache misses with and without shared owner-shard plans.
 *
 * Run `pnpm --filter @jsprismarine/prismarine run bench:structure-starts`. The in-process shard
 * runners retain independent generators like real workers. The shared cases use the same
 * coordinator broker and owner-affinity tasks as whole-chunk generation, while the baseline
 * sends whole chunks directly and lets each worker build its own starts.
 */
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import type { GenerationResult, GenerationTask, TaskRunnerFactory } from '@jsprismarine/chunkgen';
import { ShardedGenerationPool } from '@jsprismarine/chunkgen';

import { Dimensions } from '../src/world/DimensionType';
import {
    DataDrivenGenerator,
    isPipelineKey,
    pipelineDimensionOf
} from '../src/world/generators/datadriven/DataDrivenGenerator';
import type { PipelineKey } from '../src/world/generators/datadriven/DataDrivenGenerator';
import type {
    StructureStartCandidate,
    StructureStartPlanEntry
} from '../src/world/generators/datadriven/javaStructureStarts';
import {
    StructureStartPlanBroker,
    structureStartOwnerOf
} from '../src/world/generators/datadriven/javaStructurePlanBroker';
import { findJavaTemplateSource } from '../src/world/generators/datadriven/javaStructureTemplates';
import { cacheRoot, findJavaWorldgenSources } from '../src/world/generators/datadriven/javaWorldgenSources';
import { loadJavaWorldgenRegistries } from '../src/world/generators/datadriven/javaWorldgenData';

const SEED = 1234n;
const REGION_CHUNKS = 8;
const STEAL_AFTER = 2;
const REQUESTED_SIDE = 8;
const WORKERS = 6;

const sources = findJavaWorldgenSources();
if (sources === undefined) {
    process.stderr.write(
        'No Java world generation data. Run `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` ' +
            'and `pnpm --filter @jsprismarine/bedrock-data run datagen:java` first.\n'
    );
    process.exit(1);
}

const registries = loadJavaWorldgenRegistries(sources);
const templates = findJavaTemplateSource(cacheRoot(), registries.processorLists);
const key: PipelineKey = {
    noiseSettings: 'minecraft:overworld',
    biomeSource: { type: 'minecraft:multi_noise', preset: 'minecraft:overworld' },
    dimension: pipelineDimensionOf(Dimensions.Overworld)
};

interface ShardMetrics {
    readonly builds: Array<{ key: string; elapsedMs: number }>;
    readonly terrainTiles: string[];
}

interface CaseResult {
    readonly workers: number;
    readonly sharedPlans: boolean;
    readonly elapsedMs: number;
    readonly processCpuMs: number;
    readonly totalBuildStarts: number;
    readonly uniqueBuildStarts: number;
    readonly duplicateBuildStarts: number;
    readonly totalTerrainTiles: number;
    readonly uniqueTerrainTiles: number;
    readonly duplicateTerrainTiles: number;
    readonly totalLayoutMs: number;
    readonly duplicateLayoutMs: number;
    readonly digest: string;
    readonly chunkDigests: readonly { readonly x: number; readonly z: number; readonly digest: string }[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isCandidate = (value: unknown): value is StructureStartCandidate =>
    isRecord(value) &&
    typeof value.set === 'string' &&
    typeof value.chunkX === 'number' &&
    typeof value.chunkZ === 'number';

const isPlanEntry = (value: unknown): value is StructureStartPlanEntry =>
    isRecord(value) &&
    typeof value.set === 'string' &&
    typeof value.chunkX === 'number' &&
    typeof value.chunkZ === 'number' &&
    'start' in value &&
    (value.start === null || isRecord(value.start));

const planEntriesFromWorker = (payload: unknown): readonly StructureStartPlanEntry[] => {
    if (!Array.isArray(payload) || !payload.every(isPlanEntry)) {
        throw new TypeError('The structure benchmark received an invalid owner plan list.');
    }
    // This is the runner's worker-message boundary. The guard checks the envelope; piece data is
    // validated by its registered codec when the destination generator installs the plan.
    return structuredClone(payload);
};

const inputFor = (value: unknown): PipelineKey & { readonly seed: string } => {
    if (!isPipelineKey(value) || !isRecord(value) || typeof value.seed !== 'string') {
        throw new TypeError('The structure benchmark task has no seed and pipeline key.');
    }
    return { ...value, seed: value.seed };
};

const runCase = async (workers: number, sharedPlans: boolean): Promise<CaseResult> => {
    const shards: ShardMetrics[] = [];
    const runnerFactory: TaskRunnerFactory = () => {
        const metrics: ShardMetrics = { builds: [], terrainTiles: [] };
        shards.push(metrics);
        const generator = new DataDrivenGenerator({
            registries,
            templates,
            onStructureStartBuild: (set, chunkX, chunkZ, elapsedMs) => {
                metrics.builds.push({ key: JSON.stringify([set, chunkX, chunkZ]), elapsedMs });
            },
            onTerrainTileBuild: (dimension, seed, chunkX, chunkZ) => {
                metrics.terrainTiles.push(JSON.stringify([dimension, seed.toString(), chunkX, chunkZ]));
            }
        });

        return {
            threads: [generator],
            async run(task: GenerationTask): Promise<GenerationResult> {
                const received = structuredClone(task);
                const input = inputFor(received.input);
                if (received.status === 'structure_starts') {
                    if (
                        !isRecord(received.input) ||
                        !Array.isArray(received.input.candidates) ||
                        !received.input.candidates.every(isCandidate)
                    ) {
                        throw new TypeError('The structure benchmark owner task has no candidate list.');
                    }
                    return {
                        payload: structuredClone(
                            generator.structureStartPlansFor(received.input.candidates, BigInt(input.seed), input)
                        ),
                        transferList: []
                    };
                }

                if (received.status !== 'full') {
                    throw new TypeError(`Unexpected benchmark task status ${received.status}.`);
                }
                const structureStartPlans =
                    isRecord(received.input) && 'structureStartPlans' in received.input
                        ? planEntriesFromWorker(received.input.structureStartPlans)
                        : [];
                generator.installStructureStartPlans(structureStartPlans, BigInt(input.seed), input);
                const chunk = await generator.generateChunk(received.chunkX, received.chunkZ, BigInt(input.seed));
                const payload = createHash('sha256').update(chunk.networkSerialize()).digest('hex');
                return { payload, transferList: [] };
            },
            async destroy(): Promise<void> {
                generator.stopGenerating();
            }
        };
    };

    const pool = new ShardedGenerationPool(
        {
            pipeline: 'structure-start-duplication-benchmark',
            workers,
            regionChunks: REGION_CHUNKS,
            stealAfter: STEAL_AFTER
        },
        runnerFactory
    );
    const coordinator = sharedPlans && workers > 1 ? new DataDrivenGenerator({ registries, templates }) : undefined;
    const broker = sharedPlans && workers > 1 ? new StructureStartPlanBroker() : undefined;
    const taskInput = { ...key, seed: SEED.toString() };
    const coordinates = Array.from({ length: REQUESTED_SIDE * REQUESTED_SIDE }, (_unused, index) => ({
        x: index % REQUESTED_SIDE,
        z: Math.trunc(index / REQUESTED_SIDE)
    }));
    // Exercise the same reversed multi-worker ordering as the whole-chunk parity corpus.
    const order = workers === 1 ? coordinates : [...coordinates].reverse();
    const cpuBefore = process.cpuUsage();
    const started = performance.now();
    let results: Array<{ x: number; z: number; digest: string }>;

    try {
        results = await Promise.all(
            order.map(async ({ x, z }) => {
                const structureStartPlans =
                    coordinator === undefined || broker === undefined
                        ? []
                        : await broker.plansFor(
                              coordinator.structureStartCandidatesForRegion(x - 2, z - 2, x + 2, z + 2, SEED),
                              (candidate) => structureStartOwnerOf(candidate, workers),
                              async (owner, candidates) => {
                                  const planned = await pool.runOnShard(owner, {
                                      status: 'structure_starts',
                                      chunkX: x,
                                      chunkZ: z,
                                      dimension: key.dimension.bedrockId,
                                      input: { ...taskInput, candidates }
                                  });
                                  return planEntriesFromWorker(planned.payload);
                              }
                          );
                const result = await pool.run({
                    status: 'full',
                    chunkX: x,
                    chunkZ: z,
                    dimension: key.dimension.bedrockId,
                    input: { ...taskInput, structureStartPlans }
                });
                if (typeof result.payload !== 'string') {
                    throw new TypeError('The structure benchmark returned no chunk digest.');
                }
                return { x, z, digest: result.payload };
            })
        );
    } finally {
        coordinator?.stopGenerating();
        await pool.destroy();
    }
    const cpu = process.cpuUsage(cpuBefore);

    const firstBuildMs = new Map<string, number>();
    let totalLayoutMs = 0;
    for (const build of shards.flatMap((shard) => shard.builds)) {
        totalLayoutMs += build.elapsedMs;
        if (!firstBuildMs.has(build.key)) firstBuildMs.set(build.key, build.elapsedMs);
    }
    const terrainTiles = shards.flatMap((shard) => shard.terrainTiles);
    const uniqueTerrainTiles = new Set(terrainTiles).size;
    const totalBuildStarts = shards.reduce((total, shard) => total + shard.builds.length, 0);
    const digest = createHash('sha256');
    const orderedResults = [...results].sort((left, right) => left.x - right.x || left.z - right.z);
    for (const result of orderedResults) digest.update(`${result.x},${result.z}\0${result.digest}\0`);

    return {
        workers,
        sharedPlans,
        elapsedMs: performance.now() - started,
        processCpuMs: (cpu.user + cpu.system) / 1000,
        totalBuildStarts,
        uniqueBuildStarts: firstBuildMs.size,
        duplicateBuildStarts: totalBuildStarts - firstBuildMs.size,
        totalTerrainTiles: terrainTiles.length,
        uniqueTerrainTiles,
        duplicateTerrainTiles: terrainTiles.length - uniqueTerrainTiles,
        totalLayoutMs,
        duplicateLayoutMs:
            totalLayoutMs - Array.from(firstBuildMs.values()).reduce((total, elapsedMs) => total + elapsedMs, 0),
        digest: digest.digest('hex'),
        chunkDigests: results
    };
};

const baselineSix = await runCase(WORKERS, false);
process.stdout.write(
    `${JSON.stringify({
        benchmarkCase: 'worker-local',
        workers: baselineSix.workers,
        totalBuildStarts: baselineSix.totalBuildStarts,
        uniqueBuildStarts: baselineSix.uniqueBuildStarts,
        duplicateBuildStarts: baselineSix.duplicateBuildStarts,
        digest: baselineSix.digest
    })}\n`
);
const sharedSix = await runCase(WORKERS, true);
process.stdout.write(
    `${JSON.stringify({
        benchmarkCase: 'owner-planned',
        workers: sharedSix.workers,
        totalBuildStarts: sharedSix.totalBuildStarts,
        uniqueBuildStarts: sharedSix.uniqueBuildStarts,
        duplicateBuildStarts: sharedSix.duplicateBuildStarts,
        digest: sharedSix.digest
    })}\n`
);
if (baselineSix.digest !== sharedSix.digest) {
    const plannedByChunk = new Map(sharedSix.chunkDigests.map(({ x, z, digest }) => [`${x},${z}`, digest]));
    const mismatches = baselineSix.chunkDigests
        .filter(({ x, z, digest }) => plannedByChunk.get(`${x},${z}`) !== digest)
        .slice(0, 10)
        .map(({ x, z, digest }) => ({ x, z, workerLocal: digest, ownerPlanned: plannedByChunk.get(`${x},${z}`) }));
    throw new Error(
        `Structure chunk digests changed with shared plans: ${JSON.stringify({ workerLocal: baselineSix.digest, ownerPlanned: sharedSix.digest, mismatches })}`
    );
}
if (sharedSix.totalBuildStarts >= baselineSix.totalBuildStarts) {
    throw new Error('Shared structure plans did not reduce six-worker structure-start builds');
}

process.stdout.write(
    `${JSON.stringify({
        benchmark: 'structure-start-duplication',
        seed: SEED.toString(),
        requestedChunks: REQUESTED_SIDE * REQUESTED_SIDE,
        regionChunks: REGION_CHUNKS,
        stealAfter: STEAL_AFTER,
        execution: 'in-process shard runners with independent worker-local generators',
        cases: [baselineSix, sharedSix].map(({ chunkDigests: _chunkDigests, ...result }) => result),
        matchingChunkDigest: baselineSix.digest,
        sixWorkerBuildsRemoved: baselineSix.totalBuildStarts - sharedSix.totalBuildStarts
    })}\n`
);
