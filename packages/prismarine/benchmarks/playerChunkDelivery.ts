/**
 * Measures one player's forward-view chunk delivery through the scheduler and chunk worker pool.
 *
 * Run with `node --import tsx packages/prismarine/benchmarks/playerChunkDelivery.ts [workers] [chunks] [depth]`.
 * The seed and queue order are fixed so runs at different depths cover the same chunks.
 */
import { availableParallelism } from 'node:os';

import ChunkSender from '../src/network/ChunkSender';
import ChunkScheduler from '../src/world/ChunkScheduler';
import { DataDrivenGenerator, defaultChunkPipeline } from '../src/world/generators/datadriven/DataDrivenGenerator';
import { findJavaTemplateSource } from '../src/world/generators/datadriven/javaStructureTemplates';
import {
    cacheRoot,
    findJavaWorldgenSources,
    loadJavaWorldgenRegistries
} from '../src/world/generators/datadriven/javaWorldgenData';

const workers = Number.parseInt(process.argv[2] ?? '4', 10);
const chunks = Number.parseInt(process.argv[3] ?? '64', 10);
const depth = Number.parseInt(process.argv[4] ?? '4', 10);
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
    chunks: { pipeline: defaultChunkPipeline(), workers }
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

while (!sender.isEmpty()) await scheduler.tick(() => performance.now());
const elapsed = performance.now() - started;
generator.stopGenerating();
process.stdout.write(
    `${workers} workers, ${chunks} chunks, depth ${depth}: first generated ` +
        `${firstGeneratedMs?.toFixed(0) ?? 'n/a'} ms, first flush ` +
        `${firstFlushMs?.toFixed(0) ?? 'n/a'} ms, ` +
        `${elapsed.toFixed(0)} ms total, ${((delivered / elapsed) * 1000).toFixed(1)} chunks/s ` +
        `(${availableParallelism()} cores)\n`
);
