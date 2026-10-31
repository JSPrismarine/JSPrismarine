import { describe, expect, it } from 'vitest';

import type { ProtoChunkPayload } from './ProtoChunk';
import { ChunkStatusRegressionError, HEIGHTMAPS, ProtoChunk, ProtoChunkDetachedError } from './ProtoChunk';

/** An overworld-shaped chunk: 24 sections, y from -64 to 319. */
const OVERWORLD = { chunkX: 3, chunkZ: -5, minY: -64, height: 384 } as const;

const originX = OVERWORLD.chunkX * 16;
const originZ = OVERWORLD.chunkZ * 16;

/** A chunk with something in every array, so a round trip has something to lose. */
const populated = (): ProtoChunk => {
    const chunk = ProtoChunk.create(OVERWORLD);
    chunk.advanceTo('structure_starts');
    chunk.advanceTo('structure_references');
    chunk.advanceTo('biomes');
    chunk.advanceTo('terrain');

    for (let localX = 0; localX < 16; localX++) {
        for (let localZ = 0; localZ < 16; localZ++) {
            const surface = -60 + ((localX * 31 + localZ * 17) % 40);
            for (let y = OVERWORLD.minY; y <= surface; y++) {
                chunk.setBlock(
                    originX + localX,
                    y,
                    originZ + localZ,
                    y === surface ? 'minecraft:grass_block' : 'minecraft:stone'
                );
            }
            chunk.setBlock(
                originX + localX,
                surface + 1,
                originZ + localZ,
                `minecraft:oak_leaves[distance=${localZ % 7}]`
            );
            for (const map of HEIGHTMAPS) chunk.setHeight(map, originX + localX, originZ + localZ, surface + 2);
            chunk.setBiome(originX + localX, 0, originZ + localZ, localX < 8 ? 'minecraft:plains' : 'minecraft:desert');
        }
    }

    chunk.addBlockEntity({
        x: originX + 2,
        y: 40,
        z: originZ + 3,
        id: 'minecraft:chest',
        lootTable: 'minecraft:chests/village/village_plains_house'
    });
    chunk.addEntitySpawn({
        type: 'minecraft:end_crystal',
        x: originX + 8.5,
        y: 41,
        z: originZ + 8.5,
        yaw: 90,
        beamTarget: { x: 0, y: 128, z: 0 },
        showBottom: false,
        invulnerable: true
    });
    return chunk;
};

/** Every block of a chunk, read back through the public interface. */
const everyBlock = (chunk: ProtoChunk): string[] => {
    const blocks: string[] = [];
    for (let localX = 0; localX < 16; localX++) {
        for (let localZ = 0; localZ < 16; localZ++) {
            for (let y = chunk.minY; y <= chunk.maxY; y++) {
                blocks.push(chunk.blockAt(originX + localX, y, originZ + localZ));
            }
        }
    }
    return blocks;
};

describe('a fresh proto chunk', () => {
    it('starts at empty, all air, all plains, every height at the floor', () => {
        const chunk = ProtoChunk.create(OVERWORLD);
        expect(chunk.status).toBe('empty');
        expect(chunk.blockAt(originX, 0, originZ)).toBe('minecraft:air');
        expect(chunk.biomeAt(originX, 0, originZ)).toBe('minecraft:plains');
        expect(chunk.heightAt('MOTION_BLOCKING', originX, originZ)).toBe(-64);
    });

    it('is 192 KiB of blocks for a 24-section column, which is the size the transfer was measured on', () => {
        const chunk = ProtoChunk.create(OVERWORLD);
        expect(16 * 16 * OVERWORLD.height * Uint16Array.BYTES_PER_ELEMENT).toBe(192 * 1024);
        // Plus 1536 biome cells and four heightmaps, which is another 7 KiB.
        expect(chunk.byteLength).toBe(192 * 1024 + 4 * 4 * 96 * 2 + 4 * 256 * 4);
    });

    it('reports its own extent', () => {
        expect(ProtoChunk.create(OVERWORLD).maxY).toBe(319);
    });
});

describe('reads and writes', () => {
    it('keeps blocks apart by position', () => {
        const chunk = ProtoChunk.create(OVERWORLD);
        chunk.setBlock(originX + 1, 70, originZ + 2, 'minecraft:stone');
        expect(chunk.blockAt(originX + 1, 70, originZ + 2)).toBe('minecraft:stone');
        expect(chunk.blockAt(originX + 2, 70, originZ + 1)).toBe('minecraft:air');
        expect(chunk.blockAt(originX + 1, 71, originZ + 2)).toBe('minecraft:air');
    });

    it('stores one palette slot per distinct state, however many blocks use it', () => {
        const chunk = ProtoChunk.create(OVERWORLD);
        for (let y = 0; y < 100; y++) chunk.setBlock(originX, y, originZ, 'minecraft:stone');
        chunk.setBlock(originX, 100, originZ, 'minecraft:oak_log[axis=y]');
        expect(chunk.transfer().payload.blockPalette).toEqual([
            'minecraft:air',
            'minecraft:stone',
            'minecraft:oak_log[axis=y]'
        ]);
    });

    it('refuses a write outside its own column or outside build height, as Java does', () => {
        const chunk = ProtoChunk.create(OVERWORLD);
        expect(chunk.setBlock(originX - 1, 0, originZ, 'minecraft:stone')).toBe(false);
        expect(chunk.setBlock(originX + 16, 0, originZ, 'minecraft:stone')).toBe(false);
        expect(chunk.setBlock(originX, -65, originZ, 'minecraft:stone')).toBe(false);
        expect(chunk.setBlock(originX, 320, originZ, 'minecraft:stone')).toBe(false);
        expect(chunk.setBlock(originX, 319, originZ + 15, 'minecraft:stone')).toBe(true);
    });

    it('reads air outside rather than throwing, because the step table polices neighbor reads', () => {
        expect(ProtoChunk.create(OVERWORLD).blockAt(originX - 1, 0, originZ)).toBe('minecraft:air');
    });

    it('resolves a biome per 4 by 4 by 4 cell, so the sixteen blocks of a cell agree', () => {
        const chunk = ProtoChunk.create(OVERWORLD);
        chunk.setBiome(originX, 0, originZ, 'minecraft:badlands');
        expect(chunk.biomeAt(originX + 3, 3, originZ + 3)).toBe('minecraft:badlands');
        expect(chunk.biomeAt(originX + 4, 0, originZ)).toBe('minecraft:plains');
        expect(chunk.biomeAt(originX, 4, originZ)).toBe('minecraft:plains');
    });

    it('keeps the four heightmaps apart', () => {
        const chunk = ProtoChunk.create(OVERWORLD);
        chunk.setHeight('WORLD_SURFACE', originX + 5, originZ + 6, 100);
        chunk.setHeight('OCEAN_FLOOR', originX + 5, originZ + 6, 62);
        expect(chunk.heightAt('WORLD_SURFACE', originX + 5, originZ + 6)).toBe(100);
        expect(chunk.heightAt('OCEAN_FLOOR', originX + 5, originZ + 6)).toBe(62);
        expect(chunk.heightAt('MOTION_BLOCKING', originX + 5, originZ + 6)).toBe(-64);
        expect(chunk.heightAt('WORLD_SURFACE', originX + 6, originZ + 5)).toBe(-64);
    });
});

describe('the persisted status', () => {
    it('moves up the ladder', () => {
        const chunk = ProtoChunk.create(OVERWORLD);
        chunk.advanceTo('structure_starts');
        expect(chunk.status).toBe('structure_starts');
    });

    it('refuses to stand still or move down, because a body runs exactly once', () => {
        const chunk = ProtoChunk.create(OVERWORLD);
        chunk.advanceTo('terrain');
        expect(() => chunk.advanceTo('terrain')).toThrow(ChunkStatusRegressionError);
        expect(() => chunk.advanceTo('biomes')).toThrow(
            'A chunk at terrain cannot advance to biomes: a status body runs once and never runs backward.'
        );
    });
});

describe('crossing a thread boundary', () => {
    it('comes back block for block after a transfer and an adopt', () => {
        const source = populated();
        const before = everyBlock(source);

        const { payload, transferList } = source.transfer();
        const delivered: ProtoChunkPayload = structuredClone(payload, { transfer: [...transferList] });
        const rebuilt = ProtoChunk.adopt(delivered);

        expect(everyBlock(rebuilt)).toEqual(before);
    });

    it('carries the status, the biomes, the heightmaps and both request lists with it', () => {
        const source = populated();
        const { payload, transferList } = source.transfer();
        const rebuilt = ProtoChunk.adopt(structuredClone(payload, { transfer: [...transferList] }));

        expect(rebuilt.status).toBe('terrain');
        expect(rebuilt.chunkX).toBe(OVERWORLD.chunkX);
        expect(rebuilt.chunkZ).toBe(OVERWORLD.chunkZ);
        expect(rebuilt.minY).toBe(OVERWORLD.minY);
        expect(rebuilt.height).toBe(OVERWORLD.height);
        expect(rebuilt.biomeAt(originX, 0, originZ)).toBe('minecraft:plains');
        expect(rebuilt.biomeAt(originX + 12, 0, originZ)).toBe('minecraft:desert');
        expect(rebuilt.heightAt('MOTION_BLOCKING', originX + 1, originZ + 1)).toBe(-60 + ((31 + 17) % 40) + 2);
        expect(rebuilt.recordedBlockEntities).toEqual([
            {
                x: originX + 2,
                y: 40,
                z: originZ + 3,
                id: 'minecraft:chest',
                lootTable: 'minecraft:chests/village/village_plains_house'
            }
        ]);
        expect(rebuilt.recordedEntitySpawns).toHaveLength(1);
        expect(rebuilt.recordedEntitySpawns[0]).toEqual({
            type: 'minecraft:end_crystal',
            x: originX + 8.5,
            y: 41,
            z: originZ + 8.5,
            yaw: 90,
            beamTarget: { x: 0, y: 128, z: 0 },
            showBottom: false,
            invulnerable: true
        });
    });

    it('detaches the source buffers, so the bytes moved rather than being copied', () => {
        const source = populated();
        const { payload, transferList } = source.transfer();
        expect(payload.blocks.byteLength).toBe(192 * 1024);

        structuredClone(payload, { transfer: [...transferList] });

        for (const buffer of transferList) expect(buffer.byteLength).toBe(0);
    });

    it('refuses to be read after transfer rather than reading the zeros a detached buffer holds', () => {
        const source = populated();
        source.transfer();

        expect(() => source.blockAt(originX, 0, originZ)).toThrow(ProtoChunkDetachedError);
        expect(() => source.setBlock(originX, 0, originZ, 'minecraft:stone')).toThrow(ProtoChunkDetachedError);
        expect(() => source.transfer()).toThrow(/was transferred/);
    });

    it('adopts without copying, so writing the rebuilt chunk writes the delivered buffer', () => {
        const source = ProtoChunk.create(OVERWORLD);
        source.setBlock(originX, 0, originZ, 'minecraft:stone');
        const { payload } = source.transfer();
        const rebuilt = ProtoChunk.adopt(payload);
        rebuilt.setBlock(originX, 1, originZ, 'minecraft:dirt');

        // Entry 65 of the first column is y = 1 with minY at -64, and slot 2 is the second state
        // the palette saw. Reading it out of the payload shows the adopted chunk wrote through to
        // the buffer that arrived rather than to a copy of it.
        expect(new Uint16Array(payload.blocks)[64]).toBe(1);
        expect(new Uint16Array(payload.blocks)[65]).toBe(2);
        expect(rebuilt.blockAt(originX, 1, originZ)).toBe('minecraft:dirt');
    });

    it('lists exactly the three buffers the payload holds', () => {
        const { payload, transferList } = ProtoChunk.create(OVERWORLD).transfer();
        expect([...transferList]).toEqual([payload.blocks, payload.biomes, payload.heightmaps]);
    });
});
