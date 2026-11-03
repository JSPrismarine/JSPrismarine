/**
 * Compares indexed generation with the finalized packed block storage on synthetic sections and
 * fresh Java-generated chunks. The benchmark also verifies identical client and persistent bytes.
 *
 * Run with `pnpm --filter @jsprismarine/prismarine run bench:storage-packing`.
 */
import { createHash } from 'node:crypto';
import os from 'node:os';

import BinaryStream from '@jsprismarine/binaryutils';

import { BlockRuntimeIds } from '../src/block/state/BlockRuntimeIds';
import BlockStorage from '../src/world/chunk/BlockStorage';
import Chunk from '../src/world/chunk/Chunk';
import { DataDrivenGenerator } from '../src/world/generators/datadriven/DataDrivenGenerator';
import { findJavaTemplateSource } from '../src/world/generators/datadriven/javaStructureTemplates';
import {
    cacheRoot,
    findJavaWorldgenSources,
    loadJavaWorldgenRegistries
} from '../src/world/generators/datadriven/javaWorldgenData';
import { encodeSubChunk } from '../src/world/providers/leveldb/SubChunkCodec';
import { encodePersistentStorage } from '../src/world/providers/leveldb/PersistentBlockStorage';

const BLOCK_COUNT = 4096;
const SAMPLES = 7;
const MUTATIONS = 2048;
const AIR = BlockRuntimeIds.getByName('minecraft:air');
const BLOCKS = [
    'minecraft:stone',
    'minecraft:dirt',
    'minecraft:sand',
    'minecraft:gravel',
    'minecraft:granite',
    'minecraft:diorite',
    'minecraft:andesite',
    'minecraft:cobblestone',
    'minecraft:bedrock',
    'minecraft:clay',
    'minecraft:netherrack',
    'minecraft:obsidian',
    'minecraft:oak_planks',
    'minecraft:spruce_planks',
    'minecraft:glass',
    'minecraft:water',
    'minecraft:gold_block'
].map((name) => BlockRuntimeIds.getByName(name));

const storageOf = (uniform: boolean, paletteWidth = 9): BlockStorage => {
    const storage = new BlockStorage({});
    for (let index = 0; index < BLOCK_COUNT; index++) {
        const x = index >> 8;
        const z = (index >> 4) & 0xf;
        const y = index & 0xf;
        const runtimeId = uniform ? BLOCKS[0]! : BLOCKS[(x + y * 3 + z * 7) % paletteWidth]!;
        storage.setBlock(x, y, z, runtimeId);
    }
    return storage;
};

const p50 = (values: readonly number[]): number => {
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.floor(sorted.length / 2)]!;
};

const measure = (operation: () => void): number => {
    for (let warmup = 0; warmup < 2; warmup++) operation();
    return p50(
        Array.from({ length: SAMPLES }, () => {
            const started = performance.now();
            operation();
            return performance.now() - started;
        })
    );
};

type MutationTarget = readonly [x: number, y: number, z: number, runtimeId: number];

const mutationTargetsFor = (chunk: Chunk): MutationTarget[] => {
    const targets: MutationTarget[] = [];
    const subChunks = Array.from(chunk.getSubChunkEntries());
    const targetsPerSubChunk = Math.ceil(MUTATIONS / subChunks.length);
    for (const [subChunkY, subChunk] of subChunks) {
        const storage = subChunk.getStorages()[0];
        if (storage === undefined) continue;

        for (let index = 0; index < targetsPerSubChunk && targets.length < MUTATIONS; index++) {
            const x = index >> 8;
            const z = (index >> 4) & 0xf;
            const y = index & 0xf;
            targets.push([x, (subChunkY << 4) + y, z, storage.getRuntimeId(x, y, z)]);
        }
        if (targets.length === MUTATIONS) break;
    }
    if (targets.length === 0) throw new Error('Generated chunk has no block storage to mutate');
    return targets;
};

const measureChunkMutations = (chunk: Chunk, targets: readonly MutationTarget[]): number =>
    measure(() => {
        for (const [x, y, z, runtimeId] of targets) chunk.setBlockRuntimeId(x, y, z, runtimeId);
    });

const currentIndexBytes = (storage: BlockStorage): number => storage.getIndexStorageByteLength();
const retainedBytesForStorage = (storage: BlockStorage): number => storage.getRetainedIndexStorageByteLength();
const retainedBytesForStorages = (storages: readonly BlockStorage[]): number => {
    const buffers = new Set<ArrayBufferLike>();
    for (const storage of storages) {
        const blocks: unknown = Reflect.get(storage, 'blocks');
        if (blocks instanceof Uint8Array || blocks instanceof Uint16Array) buffers.add(blocks.buffer);

        const packedWords: unknown = Reflect.get(storage, 'packedWords');
        if (packedWords instanceof Uint32Array) buffers.add(packedWords.buffer);

        const packedNetworkStorage: unknown = Reflect.get(storage, 'packedNetworkStorage');
        if (
            typeof packedNetworkStorage === 'object' &&
            packedNetworkStorage !== null &&
            'words' in packedNetworkStorage
        ) {
            const networkWords: unknown = packedNetworkStorage.words;
            if (networkWords instanceof Uint32Array) buffers.add(networkWords.buffer);
        }
    }

    return [...buffers].reduce((total, buffer) => total + buffer.byteLength, 0);
};
const storagesOf = (chunk: Chunk): BlockStorage[] =>
    Array.from(chunk.getSubChunkEntries()).flatMap(([, subChunk]) => subChunk.getStorages());

const measureStorageEncoder = (
    uniform: boolean,
    packedIndices: boolean,
    encode: (storage: BlockStorage) => void
): number => {
    const samples: number[] = [];
    for (let sample = 0; sample < SAMPLES + 2; sample++) {
        const storage = storageOf(uniform);
        if (packedIndices) storage.pack();
        const started = performance.now();
        encode(storage);
        if (sample >= 2) samples.push(performance.now() - started);
    }
    return p50(samples);
};

const mutationPositions = Array.from({ length: MUTATIONS }, (_unused, index) => (index * 37) & 0xfff);
const mutationIds = Array.from({ length: MUTATIONS }, (_unused, index) => BLOCKS[index % 9]!);

const scenarios = ['uniform', 'generated'] as const;
const sectionResults = scenarios.map((scenario) => {
    const uniform = scenario === 'uniform';
    const current = storageOf(uniform);
    const packed = storageOf(uniform);
    packed.pack();

    const currentNetwork = new BinaryStream();
    current.networkSerialize(currentNetwork);
    const packedNetwork = new BinaryStream();
    packed.networkSerialize(packedNetwork);
    if (!currentNetwork.getBuffer().equals(packedNetwork.getBuffer())) {
        throw new Error(`${scenario} packed network bytes differ from indexed storage`);
    }

    const currentPersistent = new BinaryStream();
    encodePersistentStorage(current, currentPersistent);
    const packedPersistent = new BinaryStream();
    encodePersistentStorage(packed, packedPersistent);
    if (!currentPersistent.getBuffer().equals(packedPersistent.getBuffer())) {
        throw new Error(`${scenario} packed persistent bytes differ from indexed storage`);
    }

    const currentGenerationTime = measure(() => storageOf(uniform));
    const hybridGenerationTime = measure(() => storageOf(uniform).pack());
    const currentNetworkTime = measureStorageEncoder(uniform, false, (storage) =>
        storage.networkSerialize(new BinaryStream())
    );
    const packedNetworkTime = measureStorageEncoder(uniform, true, (storage) =>
        storage.networkSerialize(new BinaryStream())
    );
    const currentPersistentTime = measureStorageEncoder(uniform, false, (storage) =>
        encodePersistentStorage(storage, new BinaryStream())
    );
    const packedPersistentTime = measureStorageEncoder(uniform, true, (storage) =>
        encodePersistentStorage(storage, new BinaryStream())
    );
    const mutationTime = (packedIndices: boolean): number =>
        p50(
            Array.from({ length: SAMPLES }, () => {
                const storage = storageOf(uniform);
                if (packedIndices) storage.pack();
                const started = performance.now();
                for (let index = 0; index < MUTATIONS; index++) {
                    const position = mutationPositions[index]!;
                    storage.setBlock(position >> 8, position & 0xf, (position >> 4) & 0xf, mutationIds[index]!);
                }
                return performance.now() - started;
            })
        );

    return {
        scenario,
        currentIndexBytes: currentIndexBytes(current),
        packedIndexBytes: currentIndexBytes(packed),
        packedRetainedIndexBytes: retainedBytesForStorage(packed),
        conversionPeakIndexBytes: currentIndexBytes(current) + currentIndexBytes(packed),
        generationP50Milliseconds: Number(currentGenerationTime.toFixed(3)),
        hybridGenerationAndPackP50Milliseconds: Number(hybridGenerationTime.toFixed(3)),
        currentMutationP50Milliseconds: Number(mutationTime(false).toFixed(3)),
        packedMutationP50Milliseconds: Number(mutationTime(true).toFixed(3)),
        currentNetworkEncodeP50Microseconds: Math.round(currentNetworkTime * 1000),
        packedNetworkEncodeP50Microseconds: Math.round(packedNetworkTime * 1000),
        currentPersistentEncodeP50Microseconds: Math.round(currentPersistentTime * 1000),
        packedPersistentEncodeP50Microseconds: Math.round(packedPersistentTime * 1000),
        networkBytes: currentNetwork.getBuffer().byteLength,
        persistentBytes: currentPersistent.getBuffer().byteLength
    };
});

const chunk = new Chunk(0, 0);
for (let x = 0; x < 16; x++) {
    for (let y = -64; y < -48; y++) {
        for (let z = 0; z < 16; z++) chunk.setBlockRuntimeId(x, y, z, BLOCKS[0]!);
    }
}
for (let x = 0; x < 16; x++) {
    for (let y = 0; y < 16; y++) {
        for (let z = 0; z < 16; z++) chunk.setBlockRuntimeId(x, y, z, BLOCKS[(x + y * 3 + z * 7) % 9]!);
    }
}
const chunkBytes = chunk.networkSerialize();
const chunkPersistent = Array.from(chunk.getSubChunkEntries(), ([index, subChunk]) => encodeSubChunk(subChunk, index));
const chunkIndexBytesBefore = Array.from(chunk.getSubChunkEntries()).reduce(
    (total, [, subChunk]) =>
        total + subChunk.getStorages().reduce((section, storage) => section + currentIndexBytes(storage), 0),
    0
);
chunk.packBlockStorage();
const packedChunkBytes = chunk.networkSerialize();
if (!chunkBytes.equals(packedChunkBytes)) throw new Error('Packing changed full LevelChunk bytes');
const packedChunkPersistent = Array.from(chunk.getSubChunkEntries(), ([index, subChunk]) =>
    encodeSubChunk(subChunk, index)
);
if (
    chunkPersistent.length !== packedChunkPersistent.length ||
    chunkPersistent.some((bytes, index) => !bytes.equals(packedChunkPersistent[index]!))
) {
    throw new Error('Packing changed persistent sub chunk bytes');
}
const chunkPackedIndexBytes = Array.from(chunk.getSubChunkEntries()).reduce(
    (total, [, subChunk]) =>
        total + subChunk.getStorages().reduce((section, storage) => section + currentIndexBytes(storage), 0),
    0
);
const chunkRetainedIndexBytes = retainedBytesForStorages(storagesOf(chunk));

const worldgenSources = findJavaWorldgenSources();
if (worldgenSources === undefined) {
    throw new Error(
        'Packed storage benchmark requires Java worldgen data; run `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` and `pnpm --filter @jsprismarine/bedrock-data run datagen:java` first'
    );
}
const registries = loadJavaWorldgenRegistries(worldgenSources);
const templates = findJavaTemplateSource(cacheRoot(), registries.processorLists);
const generator = new DataDrivenGenerator({ registries, templates, decorate: false, structures: false });
const generatedTimes: number[] = [];
const generatedAndPackedTimes: number[] = [];
const generatedCurrentMutationTimes: number[] = [];
const generatedPackedMutationTimes: number[] = [];
const generatedCurrentNetworkTimes: number[] = [];
const generatedPackedNetworkTimes: number[] = [];
const generatedCurrentPersistentTimes: number[] = [];
const generatedPackedPersistentTimes: number[] = [];
let generatedChunkSummary: Record<string, number | string | boolean> | undefined;
for (let sampleIndex = 0; sampleIndex < SAMPLES + 2; sampleIndex++) {
    const generationStarted = performance.now();
    const generated = await generator.generateChunk(sampleIndex, 0, 1234n);
    const generationMilliseconds = performance.now() - generationStarted;
    const mutationTargets = mutationTargetsFor(generated);
    const currentMutationMilliseconds = measureChunkMutations(generated, mutationTargets);
    const currentNetworkStarted = performance.now();
    const currentPayload = generated.networkSerialize();
    const currentNetworkMilliseconds = performance.now() - currentNetworkStarted;
    const currentPersistentStarted = performance.now();
    const persistent = Array.from(generated.getSubChunkEntries(), ([index, subChunk]) =>
        encodeSubChunk(subChunk, index)
    );
    const currentPersistentMilliseconds = performance.now() - currentPersistentStarted;
    const before = Array.from(generated.getSubChunkEntries()).reduce(
        (total, [, subChunk]) =>
            total + subChunk.getStorages().reduce((section, storage) => section + currentIndexBytes(storage), 0),
        0
    );

    const packingStarted = performance.now();
    generated.packBlockStorage();
    const packingMilliseconds = performance.now() - packingStarted;
    const packedNetworkStarted = performance.now();
    const packedPayload = generated.networkSerialize();
    const packedNetworkMilliseconds = performance.now() - packedNetworkStarted;
    if (!currentPayload.equals(packedPayload)) throw new Error('Packing changed generated LevelChunk bytes');
    const packedPersistentStarted = performance.now();
    const packedPersistent = Array.from(generated.getSubChunkEntries(), ([index, subChunk]) =>
        encodeSubChunk(subChunk, index)
    );
    const packedPersistentMilliseconds = performance.now() - packedPersistentStarted;
    if (
        persistent.length !== packedPersistent.length ||
        persistent.some((bytes, index) => !bytes.equals(packedPersistent[index]!))
    ) {
        throw new Error('Packing changed generated persistent sub chunk bytes');
    }

    const packedMutationMilliseconds = measureChunkMutations(generated, mutationTargets);
    if (!generated.networkSerialize().equals(packedPayload)) {
        throw new Error('Mutation benchmark changed generated LevelChunk bytes');
    }

    if (sampleIndex >= 2) {
        generatedTimes.push(generationMilliseconds);
        generatedAndPackedTimes.push(generationMilliseconds + packingMilliseconds);
        generatedCurrentMutationTimes.push(currentMutationMilliseconds);
        generatedPackedMutationTimes.push(packedMutationMilliseconds);
        generatedCurrentNetworkTimes.push(currentNetworkMilliseconds);
        generatedPackedNetworkTimes.push(packedNetworkMilliseconds);
        generatedCurrentPersistentTimes.push(currentPersistentMilliseconds);
        generatedPackedPersistentTimes.push(packedPersistentMilliseconds);
    }
    if (sampleIndex === 2) {
        const packedIndexBytes = Array.from(generated.getSubChunkEntries()).reduce(
            (total, [, subChunk]) =>
                total + subChunk.getStorages().reduce((section, storage) => section + currentIndexBytes(storage), 0),
            0
        );
        const retainedIndexBytes = retainedBytesForStorages(storagesOf(generated));
        generatedChunkSummary = {
            sections: persistent.length,
            mutationWritesPerSample: MUTATIONS,
            indexBytesBefore: before,
            packedIndexBytes,
            retainedIndexBytes,
            indexBytesSavedAfterNetworkEncode: before - retainedIndexBytes,
            conversionPeakIndexBytes: before + packedIndexBytes,
            levelChunkBytes: currentPayload.byteLength,
            levelChunkDigest: createHash('sha256').update(currentPayload).digest('hex'),
            allWireBytesIdentical: true
        };
    }
}

console.log(
    JSON.stringify(
        {
            benchmark: 'packed-block-storage-hybrid',
            node: process.version,
            platform: `${os.platform()}-${os.arch()}`,
            cpu: os.cpus()[0]?.model ?? 'unknown',
            syntheticSections: sectionResults,
            manualChunk: {
                sections: chunkPersistent.length,
                indexBytesBefore: chunkIndexBytesBefore,
                packedIndexBytes: chunkPackedIndexBytes,
                retainedIndexBytes: chunkRetainedIndexBytes,
                indexBytesSavedAfterNetworkEncode: chunkIndexBytesBefore - chunkRetainedIndexBytes,
                conversionPeakIndexBytes: chunkIndexBytesBefore + chunkPackedIndexBytes,
                levelChunkBytes: chunkBytes.byteLength,
                levelChunkDigest: createHash('sha256').update(chunkBytes).digest('hex'),
                allWireBytesIdentical: true
            },
            generatedChunk: {
                generationP50Milliseconds: Number(p50(generatedTimes).toFixed(3)),
                hybridGenerationAndPackP50Milliseconds: Number(p50(generatedAndPackedTimes).toFixed(3)),
                currentMutationP50Milliseconds: Number(p50(generatedCurrentMutationTimes).toFixed(3)),
                packedMutationP50Milliseconds: Number(p50(generatedPackedMutationTimes).toFixed(3)),
                currentNetworkEncodeP50Milliseconds: Number(p50(generatedCurrentNetworkTimes).toFixed(3)),
                packedNetworkEncodeP50Milliseconds: Number(p50(generatedPackedNetworkTimes).toFixed(3)),
                currentPersistentEncodeP50Milliseconds: Number(p50(generatedCurrentPersistentTimes).toFixed(3)),
                packedPersistentEncodeP50Milliseconds: Number(p50(generatedPackedPersistentTimes).toFixed(3)),
                ...generatedChunkSummary
            }
        },
        null,
        2
    )
);
