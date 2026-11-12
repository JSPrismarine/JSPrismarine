/**
 * Measures one player's forward-view chunk delivery through the scheduler and shared stage pool.
 *
 * Run with `node --import tsx packages/prismarine/benchmarks/playerChunkDelivery.ts [workers] [chunks] [depth]`.
 * Use `--cached [chunks]` to compare cached delivery at depths 2 and 12 without world generation.
 * Run `pnpm --filter @jsprismarine/prismarine run bench:chunk-completions -- [workers] [join-chunks] [steady-steps] [depth] [--bounded-first]`
 * to compare the bounded completion queue with the inline parent path on real Java terrain.
 * The default depth stages two requested chunks per worker; the seed and queue order stay fixed
 * so runs at different depths cover the same positions.
 */
import { createHash } from 'node:crypto';
import os, { availableParallelism } from 'node:os';
import { performance } from 'node:perf_hooks';

import type { GenerationPriority } from '@jsprismarine/chunkgen';
import { BlockRuntimeIds } from '../src/block/state/BlockRuntimeIds';
import ChunkSender from '../src/network/ChunkSender';
import ChunkScheduler from '../src/world/ChunkScheduler';
import { Dimensions } from '../src/world/DimensionType';
import Chunk from '../src/world/chunk/Chunk';
import { ChunkCompletionQueue, DEFAULT_CHUNK_COMPLETION_BUDGET_MS } from '../src/world/ChunkCompletionQueue';
import type { ChunkCompletionScheduler } from '../src/world/ChunkCompletionQueue';
import { DataDrivenGenerator, defaultChunkPipeline } from '../src/world/generators/datadriven/DataDrivenGenerator';
import { findJavaTemplateSource } from '../src/world/generators/datadriven/javaStructureTemplates';
import { cacheRoot, findJavaWorldgenSources } from '../src/world/generators/datadriven/javaWorldgenSources';
import { loadJavaWorldgenRegistries } from '../src/world/generators/datadriven/javaWorldgenData';

const args = process.argv.slice(2).filter((value) => value !== '--');

interface CompletionRequest {
    readonly x: number;
    readonly z: number;
    readonly urgency: GenerationPriority;
}

const coordinateKey = (x: number, z: number): string => `${x},${z}`;

/** Builds the nearest-first spawn square used for a player's initial view. */
const joinRequests = (count: number): CompletionRequest[] => {
    const radius = Math.max(1, Math.ceil(Math.sqrt(count) / 2));
    const candidates = Array.from({ length: (radius * 2 + 1) ** 2 }, (_unused, index) => ({
        x: (index % (radius * 2 + 1)) - radius,
        z: Math.floor(index / (radius * 2 + 1)) - radius
    })).sort(
        (left, right) =>
            left.x ** 2 + left.z ** 2 - (right.x ** 2 + right.z ** 2) || left.z - right.z || left.x - right.x
    );

    // The spawn's inner 3 by 3 is urgent; farther chunks can wait while the player gets moving.
    return candidates.slice(0, count).map(({ x, z }, index) => ({
        x,
        z,
        urgency: index < 9 ? 'immediate' : index < Math.ceil(count * 0.7) ? 'soon' : 'idle'
    }));
};

/** Each wave adds the next terrain column as a player walks east, retaining join-generated neighbors. */
const steadyRequests = (steps: number, radius: number): CompletionRequest[][] =>
    Array.from({ length: steps }, (_unused, step) =>
        Array.from({ length: radius * 2 + 1 }, (_unused, index) => index - radius)
            .sort((left, right) => Math.abs(left) - Math.abs(right) || left - right)
            .map((z) => ({
                x: radius + step + 1,
                z,
                urgency: z === 0 ? 'immediate' : Math.abs(z) <= 2 ? 'soon' : 'idle'
            }))
    );

type CompletionArm = 'inline-parent' | 'bounded-queue';

interface CompletionPhaseResult {
    readonly phase: 'join-burst' | 'steady-play';
    readonly requests: number;
    readonly generatedChunkCompletions: number;
    readonly wallMs: number;
    readonly processCpuMs: number;
    readonly mainThreadCpuMs: number;
    readonly workerThreadCpuMs: number;
    readonly ticks: number;
    readonly maxSchedulerTickMs: number;
    readonly outputDigest: string;
    readonly queue: {
        readonly queuedWorkerResultContinuations: number;
        readonly workerResultCpuMs: number;
        readonly pending: number;
        readonly peakDepth: number;
        readonly maxQueueAgeMs: number;
    } | null;
}

const runCompletionPhase = async (
    phase: CompletionPhaseResult['phase'],
    waves: readonly (readonly CompletionRequest[])[],
    generator: DataDrivenGenerator,
    depth: number,
    queue: ChunkCompletionQueue | undefined,
    ticksBetweenWaves: number
): Promise<CompletionPhaseResult> => {
    const requests = waves.flat();
    const priorities = new Map(requests.map(({ x, z, urgency }) => [coordinateKey(x, z), urgency]));
    const pending: Array<{ x: number; z: number }> = [];
    const generated = new Map<string, Chunk>();
    const failures: unknown[] = [];
    let completed = 0;
    let ticks = 0;
    let maxSchedulerTickMs = 0;
    const sender = {
        isEmpty: () => pending.length === 0,
        next: () => pending.shift() ?? null,
        enqueue: (x: number, z: number) => pending.unshift({ x, z })
    };
    const scheduler = new ChunkScheduler(5, (error) => failures.push(error), depth);
    scheduler.add({
        sender,
        isConnected: () => true,
        deliver: async (x, z) => {
            const chunk = await generator.generateChunk(x, z, 1234n, undefined, {
                urgency: priorities.get(coordinateKey(x, z)) ?? 'soon'
            });
            // Count chunk result continuations once; neighboring chunks may share terrain worker tasks.
            generated.set(coordinateKey(x, z), chunk);
            completed++;
        },
        flush: async () => {}
    });

    const processCpuStarted = process.cpuUsage();
    const mainThreadCpuStarted = process.threadCpuUsage();
    const started = performance.now();
    const tick = async (): Promise<void> => {
        const tickStarted = performance.now();
        queue?.drain(DEFAULT_CHUNK_COMPLETION_BUDGET_MS);
        await scheduler.tick(() => performance.now());
        maxSchedulerTickMs = Math.max(maxSchedulerTickMs, performance.now() - tickStarted);
        ticks++;
        if (failures.length > 0) throw new Error(`Chunk delivery failed: ${String(failures[0])}`);
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
    };

    try {
        for (const [waveIndex, wave] of waves.entries()) {
            pending.push(...wave.map(({ x, z }) => ({ x, z })));
            const isLastWave = waveIndex === waves.length - 1;
            const ticksBeforeNextWave = isLastWave ? 1 : ticksBetweenWaves;
            for (let index = 0; index < ticksBeforeNextWave; index++) await tick();
        }
        while (completed < requests.length) await tick();
    } finally {
        // A failed delivery must not strand other results behind the queue while close waits for them.
        queue?.deactivate();
        await scheduler.close();
    }

    const output = createHash('sha256');
    for (const { x, z } of requests) {
        const chunk = generated.get(coordinateKey(x, z));
        if (chunk === undefined) throw new Error(`Chunk ${x}, ${z} did not complete`);
        output.update(`${x},${z}\0`);
        output.update(chunk.networkSerialize());
    }

    const queueSnapshot = queue?.snapshot();
    if (queueSnapshot !== undefined && queueSnapshot.pending !== 0) {
        throw new Error(`The completion queue still has ${queueSnapshot.pending} pending item(s)`);
    }
    const processCpu = process.cpuUsage(processCpuStarted);
    const mainThreadCpu = process.threadCpuUsage(mainThreadCpuStarted);
    const processCpuMs = (processCpu.user + processCpu.system) / 1000;
    const mainThreadCpuMs = (mainThreadCpu.user + mainThreadCpu.system) / 1000;
    const workerResults = queueSnapshot?.byLabel['worker-result'];

    return {
        phase,
        requests: requests.length,
        generatedChunkCompletions: completed,
        wallMs: performance.now() - started,
        processCpuMs,
        mainThreadCpuMs,
        workerThreadCpuMs: Math.max(0, processCpuMs - mainThreadCpuMs),
        ticks,
        maxSchedulerTickMs,
        outputDigest: output.digest('hex'),
        queue:
            queueSnapshot === undefined
                ? null
                : {
                      queuedWorkerResultContinuations: workerResults?.completed ?? 0,
                      workerResultCpuMs: workerResults?.cpuMs ?? 0,
                      pending: queueSnapshot.pending,
                      peakDepth: queueSnapshot.peakPending,
                      maxQueueAgeMs: queueSnapshot.maxQueueAgeMs
                  }
    };
};

const runCompletionArm = async (
    arm: CompletionArm,
    registries: ReturnType<typeof loadJavaWorldgenRegistries>,
    templates: ReturnType<typeof findJavaTemplateSource>,
    workers: number,
    depth: number,
    joinChunks: number,
    steadySteps: number
): Promise<{
    readonly arm: CompletionArm;
    readonly actualWorkerCount: number;
    readonly firstTaskCpuMs: readonly number[];
    readonly phases: readonly CompletionPhaseResult[];
}> => {
    const workerStartupStats = new SharedArrayBuffer(BigInt64Array.BYTES_PER_ELEMENT * (workers * 3 + 1));
    const queueEnabled = arm === 'bounded-queue';
    let activeQueue: ChunkCompletionQueue | undefined;
    const queueBridge: ChunkCompletionScheduler = {
        defer: <T>(work: () => T, options?: { priority?: GenerationPriority; label?: string; key?: string }) => {
            if (activeQueue === undefined) throw new Error('A worker result arrived outside an active benchmark phase');
            return activeQueue.defer(work, options);
        },
        promote: (key, priority) => activeQueue?.promote(key, priority) ?? false
    };
    let workerPoolUnavailable: string | undefined;
    const generator = new DataDrivenGenerator({
        registries,
        templates,
        stages: {
            pipeline: defaultChunkPipeline(),
            workers,
            javaTemplates: true,
            workerStartupStats,
            onUnavailable: (reason) => {
                workerPoolUnavailable = reason;
            }
        },
        // An omitted scheduler takes the same direct chunk-promotion path as the pre-#2846 implementation.
        ...(queueEnabled ? { completionQueue: queueBridge } : {})
    });

    try {
        const radius = Math.max(1, Math.ceil(Math.sqrt(joinChunks) / 2));
        const phases: CompletionPhaseResult[] = [];
        const phaseWorkloads = [
            { phase: 'join-burst', waves: [joinRequests(joinChunks)], ticksBetweenWaves: 1 },
            { phase: 'steady-play', waves: steadyRequests(steadySteps, radius), ticksBetweenWaves: 40 }
        ] as const;
        for (const { phase, waves, ticksBetweenWaves } of phaseWorkloads) {
            // Keep one generator and its terrain cache across phases, but start fresh counters for each phase.
            activeQueue = queueEnabled ? new ChunkCompletionQueue() : undefined;
            activeQueue?.activate();
            const result = await runCompletionPhase(phase, waves, generator, depth, activeQueue, ticksBetweenWaves);
            phases.push(result);
            activeQueue?.deactivate();
            activeQueue = undefined;
            if (workerPoolUnavailable !== undefined) {
                throw new Error(`The Java generation worker pool was unavailable: ${workerPoolUnavailable}`);
            }
        }

        const startupStats = new BigInt64Array(workerStartupStats);
        const actualWorkerCount = Number(Atomics.load(startupStats, 0));
        if (actualWorkerCount === 0) throw new Error('No Java generation worker completed a first task');
        const firstTaskCpuMs = Array.from(
            { length: actualWorkerCount },
            (_unused, index) => Number(Atomics.load(startupStats, index * 3 + 2)) / 1000
        );

        return { arm, actualWorkerCount, firstTaskCpuMs, phases };
    } finally {
        activeQueue?.deactivate();
        generator.stopGenerating();
    }
};

const runCompletionComparison = async (values: readonly string[]): Promise<void> => {
    const boundedFirst = values.includes('--bounded-first');
    const positionalValues = values.filter((value) => value !== '--bounded-first');
    const workers = Number.parseInt(positionalValues[0] ?? '4', 10);
    const joinChunks = Number.parseInt(positionalValues[1] ?? '64', 10);
    const steadySteps = Number.parseInt(positionalValues[2] ?? '6', 10);
    const depth = Number.parseInt(positionalValues[3] ?? String(workers * 2), 10);
    if (
        ![workers, joinChunks, steadySteps, depth].every(Number.isSafeInteger) ||
        workers < 1 ||
        joinChunks < 9 ||
        steadySteps < 1 ||
        depth < 1
    ) {
        throw new RangeError('Expected positive workers, at least 9 join chunks, steady steps, and depth');
    }

    const sources = findJavaWorldgenSources();
    if (sources === undefined) {
        process.stderr.write(
            'No Java world generation data. Run `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` ' +
                'and `pnpm --filter @jsprismarine/bedrock-data run datagen:java` first.\n'
        );
        process.exitCode = 1;
        return;
    }

    const registries = loadJavaWorldgenRegistries(sources);
    const templates = findJavaTemplateSource(cacheRoot(), registries.processorLists);
    const runInline = () =>
        runCompletionArm('inline-parent', registries, templates, workers, depth, joinChunks, steadySteps);
    const runBounded = () =>
        runCompletionArm('bounded-queue', registries, templates, workers, depth, joinChunks, steadySteps);
    let inline: Awaited<ReturnType<typeof runCompletionArm>>;
    let bounded: Awaited<ReturnType<typeof runCompletionArm>>;
    if (boundedFirst) {
        bounded = await runBounded();
        inline = await runInline();
    } else {
        inline = await runInline();
        bounded = await runBounded();
    }
    const digestMatches = inline.phases.every(
        (phase, index) => phase.outputDigest === bounded.phases[index]?.outputDigest
    );
    const workerCountsMatch = inline.actualWorkerCount === bounded.actualWorkerCount;
    process.stdout.write(
        `${JSON.stringify({
            benchmark: 'chunk-completion-queue',
            seed: '1234',
            node: process.version,
            platform: `${process.platform}-${process.arch}`,
            cpu: os.cpus()[0]?.model ?? 'unknown',
            availableParallelism: availableParallelism(),
            requestedWorkers: workers,
            depth,
            tickMs: 50,
            completionBudgetMs: DEFAULT_CHUNK_COMPLETION_BUDGET_MS,
            steadyIntervalTicks: 40,
            steadyIntervalMs: 2000,
            workload: {
                joinChunks,
                steadySteps,
                chunksPerSteadyStep: Math.max(1, Math.ceil(Math.sqrt(joinChunks) / 2)) * 2 + 1
            },
            armOrder: boundedFirst ? ['bounded-queue', 'inline-parent'] : ['inline-parent', 'bounded-queue'],
            digestMatches,
            workerCountsMatch,
            arms: [inline, bounded]
        })}\n`
    );
    if (!digestMatches || !workerCountsMatch) process.exitCode = 1;
};

const runCachedDelivery = async (count: number, depth: number): Promise<void> => {
    const coordinates = Array.from({ length: 21 * 21 }, (_unused, index): [number, number] => [
        (index % 21) - 10,
        Math.floor(index / 21) - 10
    ])
        .sort(([leftX, leftZ], [rightX, rightZ]) => leftX ** 2 + leftZ ** 2 - (rightX ** 2 + rightZ ** 2))
        .slice(0, count);
    const stone = BlockRuntimeIds.getByName('minecraft:stone');
    const dirt = BlockRuntimeIds.getByName('minecraft:dirt');
    const cached = new Map<number, { chunk: Chunk }>();

    for (const [x, z] of coordinates) {
        const chunk = new Chunk(x, z, new Map(), Dimensions.Overworld);
        for (let localX = 0; localX < 16; localX++) {
            for (let localZ = 0; localZ < 16; localZ++) {
                chunk.fillColumn(localX, localZ, -64, -49, stone);
                chunk.setBlockRuntimeId(localX, -48, localZ, dirt);
            }
        }
        cached.set(Chunk.packXZ(x, z), { chunk });
    }

    const sender = new ChunkSender();
    sender.setCenter(0, 0);
    for (const [x, z] of coordinates) sender.enqueue(x, z);

    const delivered: Array<[number, number]> = [];
    let queuedBytes = 0;
    let maximumQueuedBytes = 0;
    let payloadBytes = 0;
    let firstDeliveryMs: number | undefined;
    const started = performance.now();
    const scheduler = new ChunkScheduler(5, () => {}, depth);
    scheduler.add({
        sender,
        tryDeliverLoaded: (x, z) => {
            const value = cached.get(Chunk.packXZ(x, z));
            if (value === undefined) return { kind: 'not-loaded' };
            const bytes = value.chunk.networkSerialize().byteLength;
            if (queuedBytes + bytes > 8 * 1024 * 1024) return { kind: 'backpressure' };

            queuedBytes += bytes;
            maximumQueuedBytes = Math.max(maximumQueuedBytes, queuedBytes);
            payloadBytes += bytes;
            delivered.push([x, z]);
            firstDeliveryMs ??= performance.now() - started;
            return { kind: 'queued', queuedBytes: bytes };
        },
        deliver: async () => {
            throw new Error('The cached benchmark unexpectedly requested generation');
        },
        flush: async () => {
            queuedBytes = 0;
        },
        isConnected: () => true
    });

    let ticks = 0;
    let maximumTickMs = 0;
    while (delivered.length < count) {
        const tickStarted = performance.now();
        await scheduler.tick(() => performance.now());
        maximumTickMs = Math.max(maximumTickMs, performance.now() - tickStarted);
        ticks++;
        await new Promise<void>((resolve) => setImmediate(resolve));
    }
    await scheduler.close();

    const elapsed = performance.now() - started;
    const distances = delivered.map(([x, z]) => x ** 2 + z ** 2);
    process.stdout.write(
        `${JSON.stringify({
            path: 'cached',
            depth,
            chunks: count,
            firstDeliveryMs: Number(firstDeliveryMs?.toFixed(2) ?? 0),
            elapsedMs: Number(elapsed.toFixed(2)),
            chunksPerSecond: Number(((count / elapsed) * 1000).toFixed(1)),
            ticks,
            maxSchedulerTickMs: Number(maximumTickMs.toFixed(2)),
            maxQueuedPayloadBytes: maximumQueuedBytes,
            payloadBytes,
            nearestFirst: distances.every((distance, index) => index === 0 || distances[index - 1]! <= distance),
            cores: availableParallelism()
        })}\n`
    );
};

if (args[0] === '--help') {
    process.stdout.write(
        'Usage: node --import tsx packages/prismarine/benchmarks/playerChunkDelivery.ts ' +
            '[workers] [chunks] [depth]\n' +
            '       node --import tsx packages/prismarine/benchmarks/playerChunkDelivery.ts --cached [chunks]\n' +
            '       node --import tsx packages/prismarine/benchmarks/playerChunkDelivery.ts ' +
            '--completion-queue [workers] [join-chunks] [steady-steps] [depth] [--bounded-first]\n'
    );
} else if (args[0] === '--completion-queue') {
    await runCompletionComparison(args.slice(1));
} else if (args[0] === '--cached') {
    const chunks = Number.parseInt(args[1] ?? '317', 10);
    if (!Number.isSafeInteger(chunks) || chunks < 1 || chunks > 441) {
        throw new RangeError('Cached benchmark chunk count must be between 1 and 441');
    }

    await runCachedDelivery(chunks, 2);
    await runCachedDelivery(chunks, 12);
} else {
    const workers = Number.parseInt(args[0] ?? '4', 10);
    const chunks = Number.parseInt(args[1] ?? '64', 10);
    const depth = Number.parseInt(args[2] ?? String(workers * 2), 10);
    const seed = 1234n;

    if (
        !Number.isInteger(workers) ||
        workers < 1 ||
        !Number.isInteger(chunks) ||
        chunks < 1 ||
        !Number.isInteger(depth) ||
        depth < 1
    ) {
        process.stderr.write('Expected positive integer arguments: [workers] [chunks] [depth].\n');
        process.exit(1);
    }

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
    const generator = new DataDrivenGenerator({
        registries,
        templates,
        stages: { pipeline: defaultChunkPipeline(), workers, javaTemplates: true }
    });

    // Build a forward view from the origin, adding the closest row first and alternating each row
    // outward from the center. ChunkSender applies the same nearest-first prioritization as a player.
    const sender = new ChunkSender();
    const rowWidth = Math.ceil(Math.sqrt(chunks));
    const halfWidth = Math.floor(rowWidth / 2);
    let queued = 0;
    for (let z = 0; queued < chunks; z++) {
        const row = Array.from({ length: rowWidth }, (_unused, index) => index - halfWidth).sort(
            (left, right) => Math.abs(left) - Math.abs(right)
        );
        for (const x of row) {
            if (queued >= chunks) break;
            sender.enqueue(x, z);
            queued++;
        }
    }

    let firstGeneratedMs: number | undefined;
    let firstFlushMs: number | undefined;
    let delivered = 0;
    let schedulerTicks = 0;
    let maxSchedulerTickMs = 0;
    const started = performance.now();
    const scheduler = new ChunkScheduler(
        5,
        (error) => {
            process.stderr.write(`Chunk delivery failed: ${String(error)}\n`);
        },
        depth
    );
    scheduler.add({
        sender,
        isConnected: () => true,
        deliver: async (x, z) => {
            await generator.generateChunk(x, z, seed);
            delivered++;
            firstGeneratedMs ??= performance.now() - started;
        },
        flush: async () => {
            firstFlushMs ??= performance.now() - started;
        }
    });

    while (delivered < chunks) {
        const tickStarted = performance.now();
        await scheduler.tick(() => performance.now());
        maxSchedulerTickMs = Math.max(maxSchedulerTickMs, performance.now() - tickStarted);
        schedulerTicks++;
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }
    // Let the last completed delivery queue and flush its partial batch.
    await scheduler.tick(() => performance.now());
    await new Promise<void>((resolve) => setImmediate(resolve));
    const elapsed = performance.now() - started;
    generator.stopGenerating();
    process.stdout.write(
        `${workers} workers, ${chunks} chunks, depth ${depth}: first generated ` +
            `${firstGeneratedMs?.toFixed(0) ?? 'n/a'} ms, first flush ` +
            `${firstFlushMs?.toFixed(0) ?? 'n/a'} ms, ` +
            `${elapsed.toFixed(0)} ms total, ${((delivered / elapsed) * 1000).toFixed(1)} chunks/s, ` +
            `${((schedulerTicks / elapsed) * 1000).toFixed(1)} scheduler ticks/s, ` +
            `${maxSchedulerTickMs.toFixed(1)} ms max scheduler pass ` +
            `(${availableParallelism()} cores)\n`
    );
}
