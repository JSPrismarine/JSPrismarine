/**
 * Reads a reference world out of the database a Bedrock Dedicated Server saved, and reduces it
 * to the golden `packages/parity/` compares a generator against.
 *
 * The world itself is hundreds of megabytes of Mojang's content and is never committed. What is
 * committed is a digest per chunk, a handful of whole chunks to diagnose a failing digest from,
 * and one block histogram for the region. Section 4 of
 * [the extraction note](../../../../docs/research/extraction-and-parity-verification.md) sizes
 * this at roughly 200 KB for a thousand chunks.
 *
 * The four rows Phase 4 of the plan exits on each have a field here:
 *
 * - biome rows compare `biomes`, the digest of the chunk's 3D biome arrays;
 * - heightmap rows compare `heightmap`, the digest of the 256 stored column heights;
 * - terrain-class rows compare `surface`, the digest of the topmost non-air block name per
 *   column, which is scanned rather than read off the heightmap so that it does not inherit the
 *   heightmap's definition of a surface;
 * - ore and feature counts compare `blockCounts`, the region-wide histogram, against a run of
 *   the generator over the same region.
 *
 * The decoding repeats what `packages/prismarine/src/world/providers/leveldb/` does, because
 * that package depends on this one and the dependency cannot run the other way. The formats are
 * documented there; the duplication is one directory of capture tooling that ships with no
 * package.
 */
import { createHash } from 'node:crypto';

import type { Database as DatabaseType } from '@jsprismarine/leveldb';

import { Database } from './codecs.ts';
import { SaveCursor } from './reader.ts';
import type { ReferenceRegion } from './region.ts';
import {
    chunksOf,
    contains,
    OVERWORLD_BOTTOM_SUB_CHUNK,
    OVERWORLD_FLOOR,
    OVERWORLD_SUB_CHUNKS,
    REFERENCE_REGION,
    SAMPLE_REGION
} from './region.ts';

const BLOCKS_PER_SUB_CHUNK = 4096;
const COLUMNS = 256;
const AIR = 'minecraft:air';

/** The record tags this reader looks for. The full list lives in the provider's `LevelDBKeys`. */
const Tag = { Data3D: 0x2b, Version: 0x2c, SubChunkPrefix: 0x2f, BlockEntity: 0x31, FinalizedState: 0x36 } as const;

/** Widths the packed-array header may declare. */
const VALID_BITS = new Set([0, 1, 2, 3, 4, 5, 6, 8, 16]);

/** Header byte of a biome palette that repeats the sub chunk below it. */
const INHERIT_HEADER = 0xff;

const sha256 = (...parts: readonly (Buffer | string)[]): string => {
    const hash = createHash('sha256');
    for (const part of parts) hash.update(part);
    return hash.digest('hex');
};

/** The key of one chunk record. The Overworld leaves its dimension out of the key entirely. */
const chunkKey = (x: number, z: number, tag: number, subChunk?: number): Buffer => {
    const key = Buffer.allocUnsafe(subChunk === undefined ? 9 : 10);
    key.writeInt32LE(x, 0);
    key.writeInt32LE(z, 4);
    key.writeUInt8(tag, 8);
    if (subChunk !== undefined) key.writeInt8(subChunk, 9);
    return key;
};

/** Reads a bit-packed array of palette indices, 4096 of them in x-major, y-minor order. */
const readPackedIndices = (cursor: SaveCursor, bitsPerBlock: number): Uint16Array => {
    const indices = new Uint16Array(BLOCKS_PER_SUB_CHUNK);
    if (bitsPerBlock === 0) return indices;

    const perWord = Math.floor(32 / bitsPerBlock);
    const words = Math.ceil(BLOCKS_PER_SUB_CHUNK / perWord);
    const mask = (1 << bitsPerBlock) - 1;

    let at = 0;
    for (let word = 0; word < words; word++) {
        const packed = cursor.int();
        for (let slot = 0; slot < perWord && at < BLOCKS_PER_SUB_CHUNK; slot++) {
            indices[at++] = (packed >>> (bitsPerBlock * slot)) & mask;
        }
    }
    return indices;
};

/** A block as the save names it: the identifier, and the state values in name order. */
export interface SavedBlock {
    /** The block identifier, such as `minecraft:stone`. */
    name: string;
    /** `name[property=value,...]`, properties sorted, which is the terrain comparison's key. */
    key: string;
}

const readPaletteEntry = (cursor: SaveCursor): SavedBlock => {
    const compound = cursor.compound();
    const name = compound['name'];
    if (typeof name !== 'string' || name.length === 0) throw new Error('A saved palette entry has no name');

    const states = compound['states'];
    const pairs: string[] = [];
    if (states !== undefined && typeof states === 'object' && !Array.isArray(states) && !Buffer.isBuffer(states)) {
        for (const [property, value] of Object.entries(states)) pairs.push(`${property}=${String(value)}`);
        pairs.sort();
    }

    return { name, key: pairs.length === 0 ? name : `${name}[${pairs.join(',')}]` };
};

/** One sub chunk's blocks, layer by layer. Layer 0 is the block, layer 1 the liquid around it. */
export interface SavedSubChunk {
    /** Signed slice index. -4 is the bottom of the Overworld. */
    index: number;
    /** Palette indices per layer, 4096 each. */
    layers: Uint16Array[];
    /** Palette per layer, in the order the indices refer to. */
    palettes: SavedBlock[][];
}

/**
 * Decodes a `SubChunkPrefix` record.
 *
 * @param keyIndex - Slice index from the key, used when the record is a version that omits it.
 * @throws Error when the record declares a version or a packing width this reader does not know.
 */
export const decodeSavedSubChunk = (value: Buffer, keyIndex: number): SavedSubChunk => {
    const cursor = new SaveCursor(value);
    const version = cursor.byte();
    if (version !== 1 && version !== 8 && version !== 9) {
        throw new Error(`Sub chunk record declares version ${version}`);
    }

    const storageCount = version === 1 ? 1 : cursor.byte();
    const index = version === 9 ? cursor.signedByte() : keyIndex;

    const layers: Uint16Array[] = [];
    const palettes: SavedBlock[][] = [];
    for (let layer = 0; layer < storageCount; layer++) {
        const header = cursor.byte();
        if ((header & 1) !== 0) throw new Error('A saved sub chunk claims to hold runtime ids');
        const bitsPerBlock = header >> 1;
        if (!VALID_BITS.has(bitsPerBlock)) throw new Error(`Sub chunk storage declares ${bitsPerBlock} bits`);

        const indices = readPackedIndices(cursor, bitsPerBlock);
        const size = cursor.int();
        if (size <= 0) throw new Error(`Sub chunk storage declares a palette of ${size} entries`);

        palettes.push(Array.from({ length: size }, () => readPaletteEntry(cursor)));
        layers.push(indices);
    }

    return { index, layers, palettes };
};

/** The `Data3D` record: the column heights, then one biome array per sub chunk. */
export interface SavedBiomes {
    /** Column heights above the dimension floor, indexed `x * 16 + z`. */
    heightmap: Uint16Array;
    /** Biome id per block per sub chunk, bottom sub chunk first. A missing slice is null. */
    biomes: (Int32Array | null)[];
}

/** Decodes a `Data3D` record into its heightmap and its per-sub-chunk biome arrays. */
export const decodeSavedBiomes = (value: Buffer, subChunks = OVERWORLD_SUB_CHUNKS): SavedBiomes => {
    const cursor = new SaveCursor(value);
    const heightmap = new Uint16Array(COLUMNS);
    for (let i = 0; i < COLUMNS; i++) heightmap[i] = cursor.unsignedShort();

    const biomes: (Int32Array | null)[] = [];
    let below: Int32Array | null = null;
    for (let slice = 0; slice < subChunks; slice++) {
        if (cursor.done) {
            biomes.push(null);
            continue;
        }
        const header = cursor.byte();
        if (header === INHERIT_HEADER) {
            below = below === null ? null : Int32Array.from(below);
            biomes.push(below);
            continue;
        }
        const bitsPerBlock = header >> 1;
        if (!VALID_BITS.has(bitsPerBlock)) throw new Error(`A biome palette declares ${bitsPerBlock} bits`);

        const indices = readPackedIndices(cursor, bitsPerBlock);
        const size = cursor.int();
        const palette = new Int32Array(size);
        for (let i = 0; i < size; i++) palette[i] = cursor.int();

        const slice3d = new Int32Array(BLOCKS_PER_SUB_CHUNK);
        for (let i = 0; i < BLOCKS_PER_SUB_CHUNK; i++) slice3d[i] = palette[indices[i]!] ?? 0;
        biomes.push(slice3d);
        below = slice3d;
    }
    return { heightmap, biomes };
};

/** Position of a block inside a sub chunk's 4096 slots: x major, y minor. */
const slotOf = (x: number, y: number, z: number): number => (x << 8) | (z << 4) | y;

/** A chunk reduced to the digests a parity row compares. */
export interface ReferenceChunk {
    /** Chunk x. */
    x: number;
    /** Chunk z. */
    z: number;
    /** 0 needs instaticking, 1 needs population, 2 generated. Null when the record is absent. */
    finalizedState: number | null;
    /** sha256 of the 256 stored column heights as unsigned 16 bit little endian values. */
    heightmap: string;
    /** sha256 of the 3D biome arrays, bottom sub chunk first, each id a 32 bit little endian int. */
    biomes: string;
    /** sha256 of the topmost non-air block name per column, newline separated in `x * 16 + z` order. */
    surface: string;
    /** sha256 of the chunk's layer 0 block states, keyed through {@link ReferenceChunk.palette}. */
    blocks: string;
    /** Distinct block identifiers in the chunk, every layer, sorted. */
    palette: string[];
    /** Block entity compounds the chunk stores. */
    blockEntities: number;
}

/** A chunk kept whole, so that a failing digest has somewhere to be read from. */
export interface ReferenceChunkSample {
    /** Chunk x. */
    x: number;
    /** Chunk z. */
    z: number;
    /** Column heights above y={@link OVERWORLD_FLOOR}, in `x * 16 + z` order. */
    heightmap: number[];
    /** Topmost non-air block per column, in the same order. */
    surface: string[];
    /** Biome id at each column's topmost non-air block, in the same order. */
    biomes: number[];
}

/** The committed reference world golden. */
export interface ReferenceWorld {
    /** Why the file exists and what a reader may assume of it. */
    $comment: string[];
    /** Shape of this file, bumped when a field changes meaning. */
    formatVersion: number;
    /** Bedrock Dedicated Server version the world was generated by. */
    minecraftVersion: string;
    /** `level-seed` the world was generated with. */
    seed: string;
    /** Dimension the region covers. */
    dimension: string;
    /** Lowest block y, which {@link ReferenceChunkSample.heightmap} is measured from. */
    floor: number;
    /** The captured square of chunks. */
    region: ReferenceRegion;
    /** One entry per chunk of the region, in row-major order with x fastest. */
    chunks: ReferenceChunk[];
    /** Whole chunks for the sub-square of the region the golden keeps in full. */
    samples: ReferenceChunkSample[];
    /** Blocks of each identifier across the region, layer 0 only, sorted by identifier. */
    blockCounts: Record<string, number>;
}

/** Everything {@link readReferenceWorld} needs besides the database. */
export interface ReadReferenceWorldOptions {
    /** Bedrock Dedicated Server version, recorded in the golden. */
    minecraftVersion: string;
    /** The seed the world was generated with. */
    seed: string;
    /** The square of chunks to reduce. Defaults to {@link REFERENCE_REGION}. */
    region?: ReferenceRegion;
    /** The sub-square kept whole. Defaults to {@link SAMPLE_REGION}. */
    sample?: ReferenceRegion;
    /** Dimension name recorded in the golden. Only the Overworld is read today. */
    dimension?: string;
}

interface LoadedChunk {
    subChunks: SavedSubChunk[];
    biomes: SavedBiomes | undefined;
    finalizedState: number | null;
    blockEntities: number;
}

const loadChunk = (database: DatabaseType, x: number, z: number): LoadedChunk => {
    const subChunks: SavedSubChunk[] = [];
    for (let i = 0; i < OVERWORLD_SUB_CHUNKS; i++) {
        const index = OVERWORLD_BOTTOM_SUB_CHUNK + i;
        const value = database.get(chunkKey(x, z, Tag.SubChunkPrefix, index));
        if (value === null) continue;
        subChunks.push(decodeSavedSubChunk(value, index));
    }

    const data3d = database.get(chunkKey(x, z, Tag.Data3D));
    const finalized = database.get(chunkKey(x, z, Tag.FinalizedState));
    const blockEntities = database.get(chunkKey(x, z, Tag.BlockEntity));

    let entities = 0;
    if (blockEntities !== null && blockEntities.byteLength > 0) {
        const cursor = new SaveCursor(blockEntities);
        while (!cursor.done) {
            cursor.compound();
            entities++;
        }
    }

    return {
        subChunks,
        biomes: data3d === null ? undefined : decodeSavedBiomes(data3d),
        finalizedState: finalized === null ? null : finalized.readInt32LE(0),
        blockEntities: entities
    };
};

/** The topmost non-air block of every column, scanned downwards from the highest sub chunk. */
const surfaceOf = (chunk: LoadedChunk): { names: string[]; levels: number[] } => {
    const names = new Array<string>(COLUMNS).fill(AIR);
    const levels = new Array<number>(COLUMNS).fill(0);
    const descending = [...chunk.subChunks].sort((a, b) => b.index - a.index);

    let found = 0;
    for (const subChunk of descending) {
        const indices = subChunk.layers[0];
        const palette = subChunk.palettes[0];
        if (indices === undefined || palette === undefined) continue;
        for (let x = 0; x < 16 && found < COLUMNS; x++) {
            for (let z = 0; z < 16; z++) {
                const column = x * 16 + z;
                if (names[column] !== AIR) continue;
                for (let y = 15; y >= 0; y--) {
                    const block = palette[indices[slotOf(x, y, z)]!];
                    if (block === undefined || block.name === AIR) continue;
                    names[column] = block.name;
                    levels[column] = (subChunk.index - OVERWORLD_BOTTOM_SUB_CHUNK) * 16 + y;
                    found++;
                    break;
                }
            }
        }
    }
    return { names, levels };
};

const digestChunk = (
    x: number,
    z: number,
    chunk: LoadedChunk,
    surface: { names: string[]; levels: number[] },
    counts: Map<string, number>
): ReferenceChunk => {
    const names = new Set<string>();
    const keys = new Set<string>();
    for (const subChunk of chunk.subChunks) {
        for (const palette of subChunk.palettes) {
            for (const block of palette) {
                names.add(block.name);
                keys.add(block.key);
            }
        }
    }
    // Sorting makes the local ids a property of the chunk's content rather than of the order the
    // engine happened to write its palettes in, which is what makes the digest reproducible.
    const sortedKeys = [...keys].sort();
    const localId = new Map(sortedKeys.map((key, index) => [key, index]));

    const blocks = createHash('sha256');
    blocks.update(sortedKeys.join('\n'));
    for (const subChunk of [...chunk.subChunks].sort((a, b) => a.index - b.index)) {
        const indices = subChunk.layers[0];
        const palette = subChunk.palettes[0];
        if (indices === undefined || palette === undefined) continue;
        const slice = Buffer.allocUnsafe(1 + BLOCKS_PER_SUB_CHUNK * 2);
        slice.writeInt8(subChunk.index, 0);
        for (let slot = 0; slot < BLOCKS_PER_SUB_CHUNK; slot++) {
            const block = palette[indices[slot]!]!;
            slice.writeUInt16LE(localId.get(block.key)!, 1 + slot * 2);
            counts.set(block.name, (counts.get(block.name) ?? 0) + 1);
        }
        blocks.update(slice);
    }

    const heightmap = Buffer.allocUnsafe(COLUMNS * 2);
    for (let i = 0; i < COLUMNS; i++) heightmap.writeUInt16LE(chunk.biomes?.heightmap[i] ?? 0, i * 2);

    const biomes = createHash('sha256');
    for (const slice of chunk.biomes?.biomes ?? []) {
        if (slice === null) {
            biomes.update(Buffer.of(0));
            continue;
        }
        biomes.update(Buffer.of(1));
        biomes.update(Buffer.from(slice.buffer, slice.byteOffset, slice.byteLength));
    }

    return {
        x,
        z,
        finalizedState: chunk.finalizedState,
        heightmap: sha256(heightmap),
        biomes: biomes.digest('hex'),
        surface: sha256(surface.names.join('\n')),
        blocks: blocks.digest('hex'),
        palette: [...names].sort(),
        blockEntities: chunk.blockEntities
    };
};

/**
 * Opens a saved world read-only and reduces its reference region to the committed golden.
 *
 * Read-only matters twice: the database may still be locked by a server that has not finished
 * exiting, and a reader that writes would change the very bytes it is meant to record.
 *
 * @throws Error when a chunk of the region is missing, which means the generator never ran there.
 */
export const readReferenceWorld = async (
    databasePath: string,
    options: ReadReferenceWorldOptions
): Promise<ReferenceWorld> => {
    const region = options.region ?? REFERENCE_REGION;
    const sampleRegion = options.sample ?? SAMPLE_REGION;
    const database = await Database.open(databasePath, { readOnly: true, createIfMissing: false });

    try {
        const chunks: ReferenceChunk[] = [];
        const samples: ReferenceChunkSample[] = [];
        const counts = new Map<string, number>();

        for (const { x, z } of chunksOf(region)) {
            const chunk = loadChunk(database, x, z);
            if (chunk.subChunks.length === 0) {
                throw new Error(
                    `Chunk ${x},${z} of the reference region has no sub chunks saved. The ticking ` +
                        'area never reached it, or the server was killed before it wrote the world.'
                );
            }
            const surface = surfaceOf(chunk);
            chunks.push(digestChunk(x, z, chunk, surface, counts));

            if (!contains(sampleRegion, x, z)) continue;
            const biomes = chunk.biomes?.biomes ?? [];
            samples.push({
                x,
                z,
                heightmap: Array.from(chunk.biomes?.heightmap ?? new Uint16Array(COLUMNS)),
                surface: surface.names,
                biomes: surface.levels.map((level, column) => {
                    const slice = biomes[Math.floor(level / 16)];
                    if (slice === undefined || slice === null) return -1;
                    return slice[slotOf(Math.floor(column / 16), level % 16, column % 16)] ?? -1;
                })
            });
        }

        return {
            $comment: [
                'The reference world: what the pinned Bedrock Dedicated Server generates for the',
                'seed and region in utils/bedrock-dump/region.ts. Written by',
                '`pnpm --filter @jsprismarine/bedrock-data run dump:bedrock`, which boots the server,',
                'loads the region through ticking areas, stops it cleanly and reduces the save.',
                '',
                'Each chunk is a digest rather than its blocks: `heightmap` over the 256 stored column',
                'heights, `biomes` over the 3D biome arrays, `surface` over the topmost non-air block',
                'name per column, and `blocks` over the layer 0 block states keyed through the sorted',
                '`palette`. `samples` keeps whole arrays for a small sub-square so a failing digest can',
                'be read rather than guessed at, and `blockCounts` is the region-wide block histogram',
                'the ore and feature count rows compare against.',
                '',
                'A generator producing the same world reproduces every digest exactly. Regenerate with',
                'the capture job after a version bump; never edit by hand.'
            ],
            formatVersion: 1,
            minecraftVersion: options.minecraftVersion,
            seed: options.seed,
            dimension: options.dimension ?? 'overworld',
            floor: OVERWORLD_FLOOR,
            region,
            chunks,
            samples,
            blockCounts: Object.fromEntries([...counts].sort(([a], [b]) => (a < b ? -1 : 1)))
        };
    } finally {
        await database.close();
    }
};
