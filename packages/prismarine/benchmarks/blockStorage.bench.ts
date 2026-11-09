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
import { percentile } from './percentile';

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

const editedUniformStorageOf = (): BlockStorage => {
    const storage = storageOf(true);
    const air = BlockRuntimeIds.getByName('minecraft:air');
    for (let x = 0; x < 16; x++) {
        for (let y = 0; y < 16; y++) {
            for (let z = 0; z < 16; z++) storage.setBlock(x, y, z, air);
        }
    }
    return storage;
};

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

const networkEncodingSizes = (storage: BlockStorage): { readonly bytes: number; readonly savedBytes: number } => {
    const current = new BinaryStream();
    storage.networkSerialize(current);

    // Reproduce the previous wire layout to report the bytes removed by palette compaction.
    const previous = new BinaryStream();
    const palette = storage.getPalette();
    let bitsPerBlock = Math.ceil(Math.log2(palette.length));
    if (bitsPerBlock === 0) bitsPerBlock = 1;
    else if (bitsPerBlock === 7 || bitsPerBlock === 8) bitsPerBlock = 8;
    else if (bitsPerBlock > 8) bitsPerBlock = 16;

    previous.writeByte((bitsPerBlock << 1) | 1);
    const blocksPerWord = Math.floor(32 / bitsPerBlock);
    const wordsPerChunk = Math.ceil(4096 / blocksPerWord);
    let position = 0;
    for (let wordIndex = 0; wordIndex < wordsPerChunk; wordIndex++) {
        let word = 0;
        for (let block = 0; block < blocksPerWord; block++) {
            word |= storage.getPaletteIndexAtIndex(position++) << (bitsPerBlock * block);
        }
        previous.writeIntLE(word);
    }

    previous.writeVarInt(palette.length);
    for (const runtimeId of palette) previous.writeVarInt(runtimeId);

    return {
        bytes: current.getBuffer().byteLength,
        savedBytes: previous.getBuffer().byteLength - current.getBuffer().byteLength
    };
};

const indexMemoryBytes = (storage: BlockStorage): number => {
    const indices = Reflect.get(storage, 'blocks');
    if (!(indices instanceof Uint8Array || indices instanceof Uint16Array)) {
        throw new Error('BlockStorage has an unsupported index buffer');
    }
    return indices.byteLength;
};

const scenarios: Array<[string, () => BlockStorage]> = [
    ['sparse', () => storageOf(false)],
    ['dense', () => storageOf(true)],
    ['edited-uniform', editedUniformStorageOf]
];

for (const [scenario, createStorage] of scenarios) {
    const storage = createStorage();
    for (let warmup = 0; warmup < 3; warmup++) sample(storage);

    const runs = Array.from({ length: SAMPLES }, () => sample(storage));
    const sorted = runs.map(({ ms }) => ms).sort((left, right) => left - right);
    const allocations = allocationSample(storage);
    const digests = new Set(runs.map(({ digest }) => digest));
    const network = networkEncodingSizes(storage);

    console.log(
        JSON.stringify({
            benchmark: `persistent-block-storage-${scenario}`,
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
            blockIndexBytes: indexMemoryBytes(storage),
            blockIndexBytesSaved: 8192 - indexMemoryBytes(storage),
            networkBytes: network.bytes,
            networkBytesSaved: network.savedBytes,
            outputDigest: digests.size === 1 ? runs[0]?.digest : 'unstable'
        })
    );
}
