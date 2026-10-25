import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import BinaryStream from '@jsprismarine/binaryutils';
import { Database } from '@jsprismarine/leveldb';
import { ByteOrder, NBTTagCompound, NBTWriter, Types } from '@jsprismarine/nbt';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ReferenceRegion } from './region.ts';
import { decodeSavedBiomes, decodeSavedSubChunk, readReferenceWorld } from './world.ts';

const BLOCKS_PER_SUB_CHUNK = 4096;
const COLUMNS = 256;

/** x major, y minor, the order a saved sub chunk packs its 4096 slots in. */
const slotOf = (x: number, y: number, z: number): number => (x << 8) | (z << 4) | y;

const writePacked = (stream: BinaryStream, indices: Uint16Array, bitsPerBlock: number): void => {
    stream.writeByte(bitsPerBlock << 1);
    if (bitsPerBlock === 0) return;
    const perWord = Math.floor(32 / bitsPerBlock);
    const words = Math.ceil(BLOCKS_PER_SUB_CHUNK / perWord);
    let at = 0;
    for (let word = 0; word < words; word++) {
        let packed = 0;
        for (let slot = 0; slot < perWord && at < BLOCKS_PER_SUB_CHUNK; slot++) {
            packed |= indices[at++]! << (bitsPerBlock * slot);
        }
        stream.writeIntLE(packed | 0);
    }
};

/** A `SubChunkPrefix` record of the version a modern server writes. */
const encodeSubChunk = (index: number, indices: Uint16Array, palette: readonly string[]): Buffer => {
    const stream = new BinaryStream();
    stream.writeByte(9);
    stream.writeByte(1);
    stream.writeByte(index & 0xff);
    writePacked(stream, indices, palette.length <= 1 ? 0 : 4);
    stream.writeIntLE(palette.length);

    const writer = new NBTWriter(stream, ByteOrder.LITTLE_ENDIAN);
    writer.setUseVarint(false);
    for (const name of palette) {
        const compound = new NBTTagCompound();
        compound.addValue('name', new Types.StringVal(name));
        const states = new NBTTagCompound('states');
        if (name.endsWith('_log')) states.addValue('pillar_axis', new Types.StringVal('y'));
        compound.addValue('states', states);
        compound.addValue('version', new Types.NumberVal(18163713));
        writer.writeCompound(compound);
    }
    return stream.getBuffer();
};

/** A `Data3D` record: the heightmap, then one biome palette per sub chunk. */
const encodeData3D = (heightmap: Uint16Array, biomes: readonly number[]): Buffer => {
    const stream = new BinaryStream();
    for (let i = 0; i < COLUMNS; i++) stream.writeUnsignedShortLE(heightmap[i]!);
    for (const biome of biomes) {
        writePacked(stream, new Uint16Array(BLOCKS_PER_SUB_CHUNK), 0);
        stream.writeIntLE(1);
        stream.writeIntLE(biome);
    }
    return stream.getBuffer();
};

const chunkKey = (x: number, z: number, tag: number, subChunk?: number): Buffer => {
    const key = Buffer.allocUnsafe(subChunk === undefined ? 9 : 10);
    key.writeInt32LE(x, 0);
    key.writeInt32LE(z, 4);
    key.writeUInt8(tag, 8);
    if (subChunk !== undefined) key.writeInt8(subChunk, 9);
    return key;
};

const REGION: ReferenceRegion = { chunkX: 0, chunkZ: 0, chunksX: 2, chunksZ: 1 };
const SAMPLE: ReferenceRegion = { chunkX: 0, chunkZ: 0, chunksX: 1, chunksZ: 1 };

/**
 * A world of two chunks, each one sub chunk of stone with a grass layer on top and a single
 * block of diamond ore, so that every field of the golden has something to say.
 */
const writeWorld = async (directory: string, options: { secondChunkSurface: string }): Promise<void> => {
    const database = await Database.open(directory);
    for (const x of [0, 1]) {
        const indices = new Uint16Array(BLOCKS_PER_SUB_CHUNK);
        const palette = ['minecraft:air', 'minecraft:stone', x === 0 ? 'minecraft:grass_block' : 'minecraft:oak_log'];
        if (x === 1) palette[2] = options.secondChunkSurface;
        palette.push('minecraft:diamond_ore');
        for (let bx = 0; bx < 16; bx++) {
            for (let bz = 0; bz < 16; bz++) {
                for (let by = 0; by < 5; by++) indices[slotOf(bx, by, bz)] = 1;
                indices[slotOf(bx, 5, bz)] = 2;
            }
        }
        indices[slotOf(3, 2, 4)] = 3;

        database.put(chunkKey(x, 0, 0x2f, -4), encodeSubChunk(-4, indices, palette));
        const heightmap = new Uint16Array(COLUMNS).fill(6);
        database.put(chunkKey(x, 0, 0x2b), encodeData3D(heightmap, [1, 1]));
        database.put(chunkKey(x, 0, 0x36), Buffer.from(Uint32Array.of(2).buffer));
    }
    await database.close();
};

let workspace: string;

beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'jsp-refworld-'));
});

afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
});

describe('decodeSavedSubChunk', () => {
    it('reads the slice index, the palette and the state key of a version 9 record', () => {
        const indices = new Uint16Array(BLOCKS_PER_SUB_CHUNK);
        indices[slotOf(1, 2, 3)] = 1;
        const decoded = decodeSavedSubChunk(encodeSubChunk(-4, indices, ['minecraft:air', 'minecraft:oak_log']), 0);

        expect(decoded.index).toBe(-4);
        expect(decoded.palettes[0]).toEqual([
            { name: 'minecraft:air', key: 'minecraft:air' },
            { name: 'minecraft:oak_log', key: 'minecraft:oak_log[pillar_axis=y]' }
        ]);
        expect(decoded.layers[0]![slotOf(1, 2, 3)]).toBe(1);
    });

    it('reads a uniform sub chunk, which packs no words at all', () => {
        const decoded = decodeSavedSubChunk(
            encodeSubChunk(0, new Uint16Array(BLOCKS_PER_SUB_CHUNK), ['minecraft:stone']),
            0
        );
        expect(decoded.palettes[0]).toHaveLength(1);
        expect(decoded.layers[0]!.every((index) => index === 0)).toBe(true);
    });
});

describe('decodeSavedBiomes', () => {
    it('reads the heightmap and one biome array per sub chunk', () => {
        const heightmap = new Uint16Array(COLUMNS).fill(71);
        const decoded = decodeSavedBiomes(encodeData3D(heightmap, [5, 9]), 2);

        expect(decoded.heightmap[0]).toBe(71);
        expect(decoded.biomes).toHaveLength(2);
        expect(decoded.biomes[0]!.every((id) => id === 5)).toBe(true);
        expect(decoded.biomes[1]![0]).toBe(9);
    });

    it('fills in a missing slice rather than reading past the record', () => {
        const decoded = decodeSavedBiomes(encodeData3D(new Uint16Array(COLUMNS), [3]), 4);
        expect(decoded.biomes.map((slice) => slice?.[0] ?? null)).toEqual([3, null, null, null]);
    });
});

describe('readReferenceWorld', () => {
    const read = (directory: string) =>
        readReferenceWorld(join(directory, 'db'), {
            minecraftVersion: '1.26.51.1',
            seed: '2026102500',
            region: REGION,
            sample: SAMPLE
        });

    it('digests every chunk of the region and samples the sub-square', async () => {
        await writeWorld(join(workspace, 'db'), { secondChunkSurface: 'minecraft:oak_log' });
        const golden = await read(workspace);

        expect(golden.chunks.map((chunk) => [chunk.x, chunk.z])).toEqual([
            [0, 0],
            [1, 0]
        ]);
        expect(golden.chunks[0]!.finalizedState).toBe(2);
        expect(golden.chunks[0]!.palette).toEqual([
            'minecraft:air',
            'minecraft:diamond_ore',
            'minecraft:grass_block',
            'minecraft:stone'
        ]);
        expect(golden.samples.map((sample) => [sample.x, sample.z])).toEqual([[0, 0]]);
        expect(golden.samples[0]!.heightmap).toHaveLength(COLUMNS);
        expect(new Set(golden.samples[0]!.surface)).toEqual(new Set(['minecraft:grass_block']));
        expect(new Set(golden.samples[0]!.biomes)).toEqual(new Set([1]));
    });

    it('counts every block of the region, which is what the ore rows compare', async () => {
        await writeWorld(join(workspace, 'db'), { secondChunkSurface: 'minecraft:oak_log' });
        const golden = await read(workspace);

        // Two chunks of 16 by 16: five layers of stone less the one slot the ore took, one
        // surface layer, and the rest of the slice air.
        expect(golden.blockCounts['minecraft:diamond_ore']).toBe(2);
        expect(golden.blockCounts['minecraft:stone']).toBe(2 * (5 * 256 - 1));
        expect(golden.blockCounts['minecraft:grass_block']).toBe(256);
        expect(golden.blockCounts['minecraft:oak_log']).toBe(256);
    });

    it('reproduces every digest for the same world', async () => {
        await writeWorld(join(workspace, 'a', 'db'), { secondChunkSurface: 'minecraft:oak_log' });
        await writeWorld(join(workspace, 'b', 'db'), { secondChunkSurface: 'minecraft:oak_log' });

        expect((await read(join(workspace, 'a'))).chunks).toEqual((await read(join(workspace, 'b'))).chunks);
    });

    it('moves the surface and block digests when one block changes', async () => {
        await writeWorld(join(workspace, 'a', 'db'), { secondChunkSurface: 'minecraft:oak_log' });
        await writeWorld(join(workspace, 'b', 'db'), { secondChunkSurface: 'minecraft:sand' });

        const [before, after] = [
            (await read(join(workspace, 'a'))).chunks[1]!,
            (await read(join(workspace, 'b'))).chunks[1]!
        ];
        expect(after.surface).not.toBe(before.surface);
        expect(after.blocks).not.toBe(before.blocks);
        // The terrain moved, not the biomes or the stored heights.
        expect(after.biomes).toBe(before.biomes);
        expect(after.heightmap).toBe(before.heightmap);
    });

    it('refuses a region the generator never reached', async () => {
        await writeWorld(join(workspace, 'db'), { secondChunkSurface: 'minecraft:oak_log' });
        await expect(
            readReferenceWorld(join(workspace, 'db'), {
                minecraftVersion: '1.26.51.1',
                seed: '2026102500',
                region: { chunkX: 0, chunkZ: 0, chunksX: 3, chunksZ: 1 },
                sample: SAMPLE
            })
        ).rejects.toThrow(/Chunk 2,0 of the reference region has no sub chunks/);
    });
});
