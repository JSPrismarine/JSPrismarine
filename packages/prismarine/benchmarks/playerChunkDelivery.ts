/**
 * Measures one player's forward-view chunk delivery through the scheduler and shared stage pool.
 *
 * Run with `node --import tsx packages/prismarine/benchmarks/playerChunkDelivery.ts [workers] [chunks] [depth]`.
 * Use `--cached [chunks]` to compare cached delivery at depths 2 and 12 without world generation.
 * The default depth stages two requested chunks per worker; the seed and queue order stay fixed
 * so runs at different depths cover the same positions.
 */
import { availableParallelism } from 'node:os';
import { performance } from 'node:perf_hooks';

import { BlockRuntimeIds } from '../src/block/state/BlockRuntimeIds';
import ChunkSender from '../src/network/ChunkSender';
import ChunkScheduler from '../src/world/ChunkScheduler';
import { Dimensions } from '../src/world/Dimension';
import Chunk from '../src/world/chunk/Chunk';
import { DataDrivenGenerator, defaultChunkPipeline } from '../src/world/generators/datadriven/DataDrivenGenerator';
import { findJavaTemplateSource } from '../src/world/generators/datadriven/javaStructureTemplates';
import {
    cacheRoot,
    findJavaWorldgenSources,
    loadJavaWorldgenRegistries
} from '../src/world/generators/datadriven/javaWorldgenData';

const args = process.argv.slice(2).filter((value) => value !== '--');

const runCachedDelivery = async (count: number, depth: number): Promise<void> => {
    const coordinates = Array.from({ length: 21 * 21 }, (_unused, index): [number, number] => [
        (index % 21) - 10,
        Math.floor(index / 21) - 10
    ])
        .sort(([leftX, leftZ], [rightX, rightZ]) => leftX ** 2 + leftZ ** 2 - (rightX ** 2 + rightZ ** 2))
        .slice(0, count);
    const stone = BlockRuntimeIds.getByName('minecraft:stone');
    const dirt = BlockRuntimeIds.getByName('minecraft:dirt');
    const cached = new Map<number, { chunk: Chunk; bytes: number }>();

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

if (args[0] === '--cached') {
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
