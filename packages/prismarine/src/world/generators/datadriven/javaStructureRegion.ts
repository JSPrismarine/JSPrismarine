/**
 * Writing a structure's pieces into the chunk being generated.
 *
 * Java places a structure once per chunk it covers, clipped to that chunk's box, which is how a
 * village that spans a dozen chunks ends up whole without any chunk knowing about its neighbors.
 * The clip is the whole of what this adds over the region's own writes: a piece places its
 * blocks freely and the ones outside the chunk are dropped, exactly as they are dropped at the
 * edge of Java's write region.
 */
import type { BoundingBox } from '@jsprismarine/structures';

import type { GenerationRegion } from './GenerationRegion';
import type { StructureLevel, StructureWriter } from './javaStructureWorld';
import { boxContains } from './javaStructureWorld';

/** The box covering one chunk's full height, which is the box Java clips a structure to. */
export const chunkWriteBox = (chunkX: number, chunkZ: number, minY: number, maxY: number): BoundingBox => ({
    minX: chunkX * 16,
    minY,
    minZ: chunkZ * 16,
    maxX: chunkX * 16 + 15,
    maxY,
    maxZ: chunkZ * 16 + 15
});

/**
 * Builds the writer a structure's pieces are placed through.
 *
 * @param clip - The chunk box writes are kept to. A write outside it is dropped and reported as
 *   not landed, which is what tells a piece its block went nowhere.
 */
export const createRegionStructureWriter = (
    region: GenerationRegion,
    level: StructureLevel,
    clip: BoundingBox
): StructureWriter => {
    const world = region.featureWorld();

    return {
        level,
        blockAt: (x, y, z) => region.stateAt(x, y, z),
        setBlock: (x, y, z, state) => {
            if (!boxContains(clip, x, y, z) || !region.write(x, y, z, state)) return false;
            // Java's `StructurePiece.placeBlock` ticks the fluid a placed block holds, which is
            // what lets a fortress's lava fall and a monument's water settle.
            if (world.blocks.fluid(region.stateAt(x, y, z)) !== 'empty') region.scheduleFluidTick(x, y, z);
            // It writes through `WorldGenRegion.setBlock`, which marks a block's post-process
            // position: a ruined portal's magma marks the block above it.
            region.markPostProcessOf(x, y, z, state.name);
            return true;
        },
        setBedrockBlock: (x, y, z, state) => {
            if (!boxContains(clip, x, y, z) || !region.writeBedrock(x, y, z, state)) return false;
            region.markPostProcessOf(x, y, z, state.name);
            return true;
        },
        setBlockEntity: (x, y, z, request) => {
            if (boxContains(clip, x, y, z)) world.setBlockEntity?.({ x, y, z }, request);
        },
        spawnEntity: (type, x, y, z, yaw) => {
            // Java clips an entity by the block it stands over, which is what decides the chunk
            // the spawn belongs to as well.
            if (boxContains(clip, Math.floor(x), Math.floor(y), Math.floor(z))) {
                region.spawnEntityAt(type, x, y, z, yaw);
            }
        },
        heightAt: (heightmap, x, z) =>
            // The region holds terrain for the chunk being generated and nothing for its
            // neighbors, so a column outside it answers from the noise instead of reading air.
            x >= clip.minX && x <= clip.maxX && z >= clip.minZ && z <= clip.maxZ
                ? world.getHeight(heightmap, x, z)
                : level.baseHeight(x, z, heightmap),
        hasTag: (identifier, tag) => world.blocks.hasTag({ name: identifier, properties: {} }, tag)
    };
};
