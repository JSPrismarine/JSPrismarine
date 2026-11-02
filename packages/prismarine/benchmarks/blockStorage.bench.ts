/**
 * Benchmarks persistent block storage encoding and decoding for sparse and dense columns.
 *
 * Run with `pnpm --filter @jsprismarine/prismarine run bench:storage [iterations]`.
 * Each sample measures repeated encode/decode pairs after warm-up and reports the output digest,
 * sample distribution, and peak `heapUsed` and `arrayBuffers` growth during an allocation pass.
 */
import { createHash } from 'node:crypto';
import os from 'node:os';

import BinaryStream from '@jsprismarine/binaryutils';

import { BlockRuntimeIds } from '../src/block/state/BlockRuntimeIds';
import BlockStorage from '../src/world/chunk/BlockStorage';
import {
    decodePersistentStorage,
    encodePersistentStorage
} from '../src/world/providers/leveldb/PersistentBlockStorage';

const argumentsAfterScript = process.argv.slice(2).filter((argument) => argument !== '--');
const ITERATIONS = Number.parseInt(argumentsAfterScript[0] ?? '50', 10);
if (!Number.isSafeInteger(ITERATIONS) || ITERATIONS < 1) throw new RangeError('Iterations must be a positive integer');
const SAMPLES = 7;
const PALETTE = [
    'minecraft:stone',
    'minecraft:dirt',
    'minecraft:sand',
    'minecraft:gravel',
    'minecraft:granite',
    'minecraft:diorite',
    'minecraft:andesite',
    'minecraft:cobblestone',
    'minecraft:bedrock'
].map((name) => BlockRuntimeIds.getByName(name));

const storageOf = (dense: boolean): BlockStorage => {
    const storage = new BlockStorage({});
    if (dense) {
        for (let x = 0; x < 16; x++) {
            for (let y = 0; y < 16; y++) {
                for (let z = 0; z < 16; z++) {
                    storage.setBlock(x, y, z, PALETTE[(x + y * 3 + z * 7) % PALETTE.length]!);
                }
            }
        }
    } else {
        storage.setBlock(0, 0, 0, PALETTE[0]!);
        storage.setBlock(15, 15, 15, PALETTE[1]!);
        storage.setBlock(7, 8, 9, PALETTE[4]!);
    }
    return storage;
};

const percentile = (sorted: readonly number[], fraction: number): number =>
    sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)] ?? 0;

const sample = (storage: BlockStorage): { readonly ms: number; readonly digest: string } => {
    const started = performance.now();
    let digest = '';
    for (let index = 0; index < ITERATIONS; index++) {
        const stream = new BinaryStream();
        encodePersistentStorage(storage, stream);
        const bytes = stream.getBuffer();
        if (index === 0) digest = createHash('sha256').update(bytes).digest('hex');
        decodePersistentStorage(new BinaryStream(bytes));
    }
    return { ms: performance.now() - started, digest };
};

const allocationSample = (
    storage: BlockStorage
): {
    readonly peakHeapDeltaBytes: number;
    readonly peakArrayBufferDeltaBytes: number;
} => {
    const held: BlockStorage[] = [];
    const before = process.memoryUsage();
    let peakHeap = before.heapUsed;
    let peakArrayBuffers = before.arrayBuffers;
    for (let index = 0; index < ITERATIONS; index++) {
        const stream = new BinaryStream();
        encodePersistentStorage(storage, stream);
        held.push(decodePersistentStorage(new BinaryStream(stream.getBuffer())));
        const memory = process.memoryUsage();
        peakHeap = Math.max(peakHeap, memory.heapUsed);
        peakArrayBuffers = Math.max(peakArrayBuffers, memory.arrayBuffers);
    }
    held.length = 0;
    return {
        peakHeapDeltaBytes: peakHeap - before.heapUsed,
        peakArrayBufferDeltaBytes: peakArrayBuffers - before.arrayBuffers
    };
};

for (const dense of [false, true]) {
    const storage = storageOf(dense);
    for (let warmup = 0; warmup < 3; warmup++) sample(storage);

    const runs = Array.from({ length: SAMPLES }, () => sample(storage));
    const sorted = runs.map(({ ms }) => ms).sort((left, right) => left - right);
    const allocations = allocationSample(storage);
    const digests = new Set(runs.map(({ digest }) => digest));

    console.log(
        JSON.stringify({
            benchmark: dense ? 'persistent-block-storage-dense' : 'persistent-block-storage-sparse',
            seed: 0,
            node: process.version,
            platform: `${os.platform()}-${os.arch()}`,
            cpu: os.cpus()[0]?.model ?? 'unknown',
            workerCount: 0,
            iterations: ITERATIONS,
            distributionMs: {
                min: sorted[0] ?? 0,
                p50: percentile(sorted, 0.5),
                p95: percentile(sorted, 0.95),
                max: sorted.at(-1) ?? 0
            },
            allocations,
            outputDigest: digests.size === 1 ? runs[0]?.digest : 'unstable'
        })
    );
}
