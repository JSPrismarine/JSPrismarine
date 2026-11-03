/**
 * Counts structure-start cache misses under the sharded pool's real routing rule.
 *
 * Run `pnpm --filter @jsprismarine/prismarine run bench:structure-starts`. The six shard runners
 * keep independent generators and caches, like six workers. Their task bodies run in-process,
 * which isolates duplicate layout work from worker startup while reporting aggregate process CPU.
 */
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import type { GenerationResult, GenerationTask, TaskRunnerFactory } from '@jsprismarine/chunkgen';
import { ShardedGenerationPool } from '@jsprismarine/chunkgen';

import { DataDrivenGenerator } from '../src/world/generators/datadriven/DataDrivenGenerator';
import { findJavaTemplateSource } from '../src/world/generators/datadriven/javaStructureTemplates';
import {
    cacheRoot,
    findJavaWorldgenSources,
    loadJavaWorldgenRegistries
} from '../src/world/generators/datadriven/javaWorldgenData';

const SEED = 1234n;
const REGION_CHUNKS = 8;
const STEAL_AFTER = 2;
const REQUESTED_SIDE = 8;
const WORKER_COUNTS = [1, 6] as const;

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

interface ShardMetrics {
    readonly builds: Array<{ key: string; elapsedMs: number }>;
}

interface CaseResult {
    readonly workers: number;
    readonly elapsedMs: number;
    readonly processCpuMs: number;
    readonly totalBuildStarts: number;
    readonly uniqueBuildStarts: number;
    readonly duplicateBuildStarts: number;
    readonly totalLayoutMs: number;
    readonly uniqueLayoutMs: number;
    readonly duplicateLayoutMs: number;
    readonly digest: string;
}

const runCase = async (workers: number): Promise<CaseResult> => {
    const shards: ShardMetrics[] = [];
    const runnerFactory: TaskRunnerFactory = () => {
        const metrics: ShardMetrics = { builds: [] };
        shards.push(metrics);
        const generator = new DataDrivenGenerator({
            registries,
            templates,
            onStructureStartBuild: (set, chunkX, chunkZ, elapsedMs) => {
                metrics.builds.push({ key: JSON.stringify([set, chunkX, chunkZ]), elapsedMs });
            }
        });

        return {
            threads: [generator],
            async run(task: GenerationTask): Promise<GenerationResult> {
                const chunk = await generator.generateChunk(task.chunkX, task.chunkZ, SEED);
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
    const cpuBefore = process.cpuUsage();
    const started = performance.now();
    let results: Array<{ x: number; z: number; digest: string }>;
    try {
        results = await Promise.all(
            Array.from({ length: REQUESTED_SIDE * REQUESTED_SIDE }, async (_unused, index) => {
                const x = index % REQUESTED_SIDE;
                const z = Math.trunc(index / REQUESTED_SIDE);
                const result = await pool.run({ status: 'full', chunkX: x, chunkZ: z, dimension: 0 });
                if (typeof result.payload !== 'string')
                    throw new TypeError('The structure benchmark returned no layout digest');
                return { x, z, digest: result.payload };
            })
        );
    } finally {
        await pool.destroy();
    }
    const cpu = process.cpuUsage(cpuBefore);

    const firstBuildMs = new Map<string, number>();
    let totalLayoutMs = 0;
    for (const build of shards.flatMap((shard) => shard.builds)) {
        totalLayoutMs += build.elapsedMs;
        if (!firstBuildMs.has(build.key)) firstBuildMs.set(build.key, build.elapsedMs);
    }
    const totalBuildStarts = shards.reduce((total, shard) => total + shard.builds.length, 0);
    const uniqueLayoutMs = Array.from(firstBuildMs.values()).reduce((total, elapsedMs) => total + elapsedMs, 0);
    const digest = createHash('sha256');
    for (const result of results) digest.update(`${result.x},${result.z}\0${result.digest}\0`);

    return {
        workers,
        elapsedMs: performance.now() - started,
        processCpuMs: (cpu.user + cpu.system) / 1000,
        totalBuildStarts,
        uniqueBuildStarts: firstBuildMs.size,
        duplicateBuildStarts: totalBuildStarts - firstBuildMs.size,
        totalLayoutMs,
        uniqueLayoutMs,
        duplicateLayoutMs: totalLayoutMs - uniqueLayoutMs,
        digest: digest.digest('hex')
    };
};

const cases = await Promise.all(WORKER_COUNTS.map(runCase));
if (cases[0]?.digest !== cases[1]?.digest) throw new Error('Structure layouts changed across shard counts');

process.stdout.write(
    `${JSON.stringify({
        benchmark: 'structure-start-duplication',
        seed: SEED.toString(),
        requestedChunks: REQUESTED_SIDE * REQUESTED_SIDE,
        regionChunks: REGION_CHUNKS,
        stealAfter: STEAL_AFTER,
        execution: 'in-process sharded generation with independent worker-local generators',
        cases,
        matchingLayoutDigest: cases[0]?.digest
    })}\n`
);
