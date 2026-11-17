import { describe, expect, it } from 'vitest';

import { GenerationRegion } from './GenerationRegion';
import { createJavaBlockOracle } from './javaBlockOracle';
import { chunkWriteBox, createRegionStructureWriter } from './javaStructureRegion';
import type { StructureLevel } from './javaStructureWorld';

const MIN_Y = -64;
const HEIGHT = 384;

const tile = (): GenerationRegion =>
    new GenerationRegion({
        chunkX: 0,
        chunkZ: 0,
        minY: MIN_Y,
        height: HEIGHT,
        radius: 0,
        seaLevel: 63,
        seed: 1234n,
        blocks: createJavaBlockOracle(new Map()),
        biomeAt: () => 'minecraft:plains'
    });

const level: StructureLevel = {
    minY: MIN_Y,
    height: HEIGHT,
    seaLevel: 63,
    baseHeight: () => 64,
    baseBlock: () => ({ name: 'minecraft:stone', properties: {} }),
    noiseBiome: () => 'minecraft:plains'
};

describe('createRegionStructureWriter', () => {
    it("marks the fences, torches, ladders and bars a piece places, as Java's StructurePiece.placeBlock does", () => {
        const region = tile();
        const writer = createRegionStructureWriter(region, level, chunkWriteBox(0, 0, MIN_Y, MIN_Y + HEIGHT - 1));

        writer.setBlock(1, 30, 1, { name: 'minecraft:wall_torch', properties: { facing: 'north' } });
        writer.setBlock(2, 30, 1, { name: 'minecraft:nether_brick_fence', properties: {} });
        writer.setBlock(3, 30, 1, { name: 'minecraft:ladder', properties: { facing: 'south' } });
        writer.setBlock(4, 30, 1, { name: 'minecraft:stone_bricks', properties: {} });
        // A wall is not in Java's set, so nothing settles it.
        writer.setBlock(5, 30, 1, { name: 'minecraft:cobblestone_wall', properties: {} });
        // Outside the chunk's box: the write is dropped, and so is its mark.
        writer.setBlock(17, 30, 1, { name: 'minecraft:torch', properties: {} });

        expect(region.centerFluidTicks()).toEqual([
            { x: 1, y: 30, z: 1, postProcess: true },
            { x: 2, y: 30, z: 1, postProcess: true },
            { x: 3, y: 30, z: 1, postProcess: true }
        ]);
    });
});
