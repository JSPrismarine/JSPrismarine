import { describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import Chunk from './chunk/Chunk';
import { Dimensions } from './DimensionType';
import { MapColors } from './mapColors';
import { mapTerrainOf } from './mapTerrain';

const id = (name: string): number => BlockRuntimeIds.getByName(name);

/** A world of one loaded chunk at the origin, in a dimension like the Overworld. */
const worldOf = (chunk: Chunk) => ({
    getLoadedChunk: (chunkX: number, chunkZ: number) => (chunkX === 0 && chunkZ === 0 ? chunk : null),
    getDimension: () => Dimensions.Overworld
});

/** Stacks blocks upward from y 60 in one column. */
const column = (chunk: Chunk, x: number, z: number, blocks: readonly number[]): void => {
    blocks.forEach((runtimeId, index) => chunk.setBlockRuntimeId(x, 60 + index, z, runtimeId));
};

describe('a column as a map reads it', () => {
    it('is the color and height of its top block', () => {
        const chunk = new Chunk(0, 0);
        column(chunk, 1, 1, [id('minecraft:stone'), id('minecraft:dirt'), id('minecraft:grass_block')]);

        expect(mapTerrainOf(worldOf(chunk)).column(1, 1)).toEqual({
            colorId: MapColors.grass.id,
            y: 62,
            waterDepth: 0
        });
    });

    it('looks through a block with no map color to the one under it', () => {
        const chunk = new Chunk(0, 0);
        column(chunk, 1, 1, [id('minecraft:stone'), id('minecraft:stone_button')]);

        expect(mapTerrainOf(worldOf(chunk)).column(1, 1)).toMatchObject({ colorId: MapColors.stone.id, y: 60 });
    });

    it("is water's color for water, counting the blocks to the floor under it as its depth", () => {
        const chunk = new Chunk(0, 0);
        const water = id('minecraft:water');
        column(chunk, 1, 1, [id('minecraft:sand'), water, water, water]);

        // Java's loop counts the sand it stops on as well as the two waters under the top one.
        expect(mapTerrainOf(worldOf(chunk)).column(1, 1)).toEqual({
            colorId: MapColors.water.id,
            y: 63,
            waterDepth: 3
        });
    });

    it('draws a waterlogged block that has no sturdy top as water, and one that does as itself', () => {
        const chunk = new Chunk(0, 0);
        const water = id('minecraft:water');
        const slab = (half: string): number => {
            const runtimeId = BlockRuntimeIds.tryGetByState('minecraft:oak_slab', { 'minecraft:vertical_half': half });
            expect(runtimeId, half).not.toBeNull();
            return runtimeId ?? 0;
        };
        column(chunk, 1, 1, [id('minecraft:sand'), slab('bottom')]);
        chunk.setBlockRuntimeId(1, 61, 1, water, 1);
        column(chunk, 2, 2, [id('minecraft:sand'), slab('top')]);
        chunk.setBlockRuntimeId(2, 61, 2, water, 1);

        const terrain = mapTerrainOf(worldOf(chunk));
        expect(terrain.column(1, 1)).toMatchObject({ colorId: MapColors.water.id, waterDepth: 1 });
        expect(terrain.column(2, 2).colorId).toBe(MapColors.wood.id);
    });

    it('draws a waterlogged barrier as water, where a dry one is looked through, as Java does', () => {
        const chunk = new Chunk(0, 0);
        column(chunk, 1, 1, [id('minecraft:stone'), id('minecraft:barrier')]);
        column(chunk, 2, 2, [id('minecraft:stone'), id('minecraft:barrier')]);
        chunk.setBlockRuntimeId(2, 61, 2, id('minecraft:water'), 1);

        const terrain = mapTerrainOf(worldOf(chunk));
        expect(terrain.column(1, 1)).toMatchObject({ colorId: MapColors.stone.id, y: 60 });
        expect(terrain.column(2, 2)).toMatchObject({ colorId: MapColors.water.id, y: 61 });
    });

    it('looks through a waterlogged block Java gives no color, such as a ladder', () => {
        const chunk = new Chunk(0, 0);
        column(chunk, 1, 1, [id('minecraft:stone'), id('minecraft:ladder')]);
        chunk.setBlockRuntimeId(1, 61, 1, id('minecraft:water'), 1);

        expect(mapTerrainOf(worldOf(chunk)).column(1, 1)).toMatchObject({ colorId: MapColors.stone.id, y: 60 });
    });

    it('reads a column from the chunk that holds it, west and north of the origin too', () => {
        // Chunk (1, -1) holds block (17, -5) at (1, 11); chunk (-1, -1) holds (-3, -5) at (13, 11).
        const east = new Chunk(1, -1);
        east.setBlockRuntimeId(1, 60, 11, id('minecraft:sand'));
        const west = new Chunk(-1, -1);
        west.setBlockRuntimeId(13, 70, 11, id('minecraft:snow'));
        const chunks = new Map([
            ['1,-1', east],
            ['-1,-1', west]
        ]);
        const terrain = mapTerrainOf({
            getLoadedChunk: (chunkX, chunkZ) => chunks.get(`${chunkX},${chunkZ}`) ?? null,
            getDimension: () => Dimensions.Overworld
        });

        expect(terrain.column(17, -5)).toMatchObject({ colorId: MapColors.sand.id, y: 60 });
        expect(terrain.column(-3, -5)).toMatchObject({ colorId: MapColors.snow.id, y: 70 });
        expect(terrain.isLoaded(-3, -5)).toBe(true);
        expect(terrain.isLoaded(-17, -5)).toBe(false);
    });

    it('is drawn as bedrock at the floor when nothing is in it', () => {
        const terrain = mapTerrainOf(worldOf(new Chunk(0, 0)));

        expect(terrain.column(5, 5)).toEqual({
            colorId: MapColors.stone.id,
            y: Dimensions.Overworld.minY,
            waterDepth: 0
        });
    });

    it('knows which chunks are loaded and whether the dimension has a ceiling', () => {
        const terrain = mapTerrainOf(worldOf(new Chunk(0, 0)));

        expect(terrain.isLoaded(15, 15)).toBe(true);
        expect(terrain.isLoaded(16, 0)).toBe(false);
        expect(terrain.hasCeiling).toBe(false);
        expect(mapTerrainOf({ getLoadedChunk: () => null, getDimension: () => Dimensions.Nether }).hasCeiling).toBe(
            true
        );
    });
});
