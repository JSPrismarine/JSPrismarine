/**
 * Measures retained section backing estimates before and after uniform section interning.
 *
 * The flat workloads use the default preset and a deeper custom profile with full uniform stone
 * sections. The normal workload uses the checked-in Java worldgen fixture when present.
 * Run with `pnpm --filter @jsprismarine/prismarine run bench:section-interning`.
 */
import { createHash } from 'node:crypto';
import os from 'node:os';

import type { FlatGeneratorSettings } from '@jsprismarine/worldgen';

import { BlockRuntimeIds } from '../src/block/state/BlockRuntimeIds';
import BlockStorage from '../src/world/chunk/BlockStorage';
import Chunk from '../src/world/chunk/Chunk';
import { DataDrivenGenerator } from '../src/world/generators/datadriven/DataDrivenGenerator';
import { findJavaTemplateSource } from '../src/world/generators/datadriven/javaStructureTemplates';
import { DEFAULT_FLAT_SETTINGS } from '../src/world/generators/factories/flat';
import {
    cacheRoot,
    findJavaWorldgenSources,
    loadJavaWorldgenRegistries
} from '../src/world/generators/datadriven/javaWorldgenData';
import { encodeSubChunk } from '../src/world/providers/leveldb/SubChunkCodec';

const WORLD_CHUNKS = 64;
const NORMAL_CHUNKS = 8;
const BLOCKS_PER_SECTION = 4096;
const BYTES_PER_NUMBER_SLOT = 8;
const VALID_BITS_PER_BLOCK = [0, 1, 2, 3, 4, 5, 6, 8, 16];

const blockRuntimeId = (name: string): number => BlockRuntimeIds.getByName(name);
const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

const packedIndexBytesForPaletteSize = (paletteSize: number): number => {
    if (paletteSize <= 1) return 0;
    const needed = Math.ceil(Math.log2(paletteSize));
    const bits = VALID_BITS_PER_BLOCK.find((width) => width >= needed) ?? 16;
    const blocksPerWord = Math.floor(32 / bits);
    return Math.ceil(BLOCKS_PER_SECTION / blocksPerWord) * Uint32Array.BYTES_PER_ELEMENT;
};

const storagesOf = (chunks: readonly Chunk[]): BlockStorage[] =>
    chunks.flatMap((chunk) => Array.from(chunk.getSubChunkEntries()).flatMap(([, subChunk]) => subChunk.getStorages()));

const isUniform = (storage: BlockStorage): number | null => {
    const firstIndex = storage.getPaletteIndexAtIndex(0);
    for (let index = 1; index < BLOCKS_PER_SECTION; index++) {
        if (storage.getPaletteIndexAtIndex(index) !== firstIndex) return null;
    }
    return storage.getPalette()[firstIndex] ?? null;
};

const persistentBytesOf = (chunk: Chunk): Buffer =>
    Buffer.concat(Array.from(chunk.getSubChunkEntries(), ([index, subChunk]) => encodeSubChunk(subChunk, index)));

const buildVoidWorld = (): Chunk[] => Array.from({ length: WORLD_CHUNKS }, (_unused, index) => new Chunk(index, 0));

const buildFlatWorld = (settings: FlatGeneratorSettings): Chunk[] => {
    const layers = settings.layers.map((layer) => ({
        height: layer.height,
        runtimeId: blockRuntimeId(layer.block)
    }));
    return Array.from({ length: WORLD_CHUNKS }, (_unused, chunkIndex) => {
        const chunk = new Chunk(chunkIndex, 0);
        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                let y = chunk.getMinY();
                for (const layer of layers) {
                    if (layer.height > 0) chunk.fillColumn(x, z, y, y + layer.height - 1, layer.runtimeId);
                    y += layer.height;
                }
            }
        }
        return chunk;
    });
};

const measureWorld = (name: string, chunks: readonly Chunk[]) => {
    const storages = storagesOf(chunks);
    const uniformRuntimeIds = new Set<number>();
    let uniformSections = 0;
    let baselinePackedIndexBytes = 0;
    let baselinePaletteEntries = 0;

    for (const storage of storages) {
        const uniformRuntimeId = isUniform(storage);
        if (uniformRuntimeId !== null) {
            uniformSections++;
            uniformRuntimeIds.add(uniformRuntimeId);
        }
        baselinePackedIndexBytes += packedIndexBytesForPaletteSize(storage.getPalette().length);
        baselinePaletteEntries += storage.getPalette().length;
    }

    const before = chunks.map((chunk) => ({
        network: digest(chunk.networkSerialize()),
        persistent: digest(persistentBytesOf(chunk))
    }));

    for (const chunk of chunks) chunk.packBlockStorage();

    const indexBuffers = new Set<ArrayBuffer>();
    const palettes = new Set<readonly number[]>();
    const paletteMaps = new Set<object>();
    for (const storage of storages) {
        const blocks: unknown = Reflect.get(storage, 'blocks');
        if (blocks instanceof Uint8Array || blocks instanceof Uint16Array) indexBuffers.add(blocks.buffer);
        else throw new Error('BlockStorage has an unsupported block index buffer');

        const packedWords: unknown = Reflect.get(storage, 'packedWords');
        if (packedWords instanceof Uint32Array) indexBuffers.add(packedWords.buffer);

        palettes.add(storage.getPalette());
        const paletteIndex: unknown = Reflect.get(storage, 'paletteIndex');
        if (paletteIndex instanceof Map) paletteMaps.add(paletteIndex);
        else throw new Error('BlockStorage has an unsupported palette index');
    }

    const sharedIndexBytes = [...indexBuffers].reduce((total, buffer) => total + buffer.byteLength, 0);
    const sharedPaletteEntries = [...palettes].reduce((total, palette) => total + palette.length, 0);
    const after = chunks.map((chunk) => ({
        network: digest(chunk.networkSerialize()),
        persistent: digest(persistentBytesOf(chunk))
    }));
    if (
        before.length !== after.length ||
        before.some((digestBefore, index) => {
            const digestAfter = after[index];
            return digestBefore.network !== digestAfter?.network || digestBefore.persistent !== digestAfter.persistent;
        })
    ) {
        throw new Error(`${name} section interning changed network or persistent output`);
    }

    const baselinePaletteBytes = baselinePaletteEntries * BYTES_PER_NUMBER_SLOT;
    const sharedPaletteBytes = sharedPaletteEntries * BYTES_PER_NUMBER_SLOT;
    const baselineEstimate = baselinePackedIndexBytes + baselinePaletteBytes;
    const sharedEstimate = sharedIndexBytes + sharedPaletteBytes;

    return {
        name,
        chunks: chunks.length,
        sections: storages.length,
        uniformSections,
        distinctUniformStates: uniformRuntimeIds.size,
        sharedUniformSectionBackings: uniformSections - uniformRuntimeIds.size,
        sharedPaletteMaps: paletteMaps.size,
        estimatedBaselineIndexBytes: baselinePackedIndexBytes,
        sharedIndexBytes,
        indexBytesSaved: baselinePackedIndexBytes - sharedIndexBytes,
        estimatedBaselinePaletteBytes: baselinePaletteBytes,
        sharedPaletteBytes,
        estimatedPaletteBytesSaved: baselinePaletteBytes - sharedPaletteBytes,
        estimatedSectionBackingBytesSaved: baselineEstimate - sharedEstimate,
        networkAndPersistentDigestsUnchanged: true
    };
};

const voidResult = measureWorld('void', buildVoidWorld());
const flatDefaultResult = measureWorld('flat-default-preset', buildFlatWorld(DEFAULT_FLAT_SETTINGS));
const flatDeepResult = measureWorld(
    'flat-64-stone-layer',
    buildFlatWorld({
        ...DEFAULT_FLAT_SETTINGS,
        layers: [
            { block: 'minecraft:bedrock', height: 1 },
            { block: 'minecraft:stone', height: 64 },
            { block: 'minecraft:dirt', height: 2 },
            { block: 'minecraft:grass_block', height: 1 }
        ]
    })
);

const sources = findJavaWorldgenSources();
let normalResult: ReturnType<typeof measureWorld> | { readonly available: false; readonly reason: string };
if (sources === undefined) {
    normalResult = { available: false, reason: 'Java worldgen source fixtures are unavailable' };
} else {
    const registries = loadJavaWorldgenRegistries(sources);
    const templates = findJavaTemplateSource(cacheRoot(), registries.processorLists);
    const generator = new DataDrivenGenerator({ registries, templates, decorate: false, structures: false });
    const normalChunks: Chunk[] = [];
    for (let index = 0; index < NORMAL_CHUNKS; index++) {
        normalChunks.push(await generator.generateChunk(index, 0, 1234n));
    }
    normalResult = measureWorld('normal-seed-1234', normalChunks);
}

console.log(
    JSON.stringify(
        {
            benchmark: 'block-section-interning-memory',
            node: process.version,
            platform: `${os.platform()}-${os.arch()}`,
            cpu: os.cpus()[0]?.model ?? 'unknown',
            estimate:
                'section index buffers are exact; JavaScript palette arrays use 8 bytes per slot; cached network words, Map, object, and allocator overhead are excluded',
            worlds: [voidResult, flatDefaultResult, flatDeepResult, normalResult]
        },
        null,
        2
    )
);
