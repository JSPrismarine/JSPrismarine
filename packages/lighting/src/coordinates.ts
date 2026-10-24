import { SECTION_SIZE } from './LightSection';

/** The edge length of a chunk column in blocks. */
export const CHUNK_SIZE = SECTION_SIZE;

/** The number of columns of blocks in a chunk, 16 by 16. */
export const CHUNK_COLUMN_COUNT = CHUNK_SIZE * CHUNK_SIZE;

/**
 * The chunk coordinate a block coordinate falls in. Floors toward negative infinity, so block -1
 * belongs to chunk -1.
 * @param {number} blockCoordinate - A world x or z.
 * @returns {number} The chunk x or z.
 */
export const chunkOf = (blockCoordinate: number): number => blockCoordinate >> 4;

/**
 * A single number identifying a chunk column, for use as a `Map` key.
 *
 * Both coordinates are folded into 26 bits, which covers chunks -33554432 to 33554431 and so the
 * whole of Minecraft's -30000000 to 30000000 block range. The product stays below 2^52 and is
 * therefore an exact double.
 * @param {number} chunkX - The chunk x.
 * @param {number} chunkZ - The chunk z.
 * @returns {number} The key.
 */
export const columnKeyOf = (chunkX: number, chunkZ: number): number =>
    (chunkX & 0x3ffffff) * 0x4000000 + (chunkZ & 0x3ffffff);

/**
 * The index of a block column inside a chunk's 16 by 16 heightmap.
 * @param {number} localX - Chunk-local x, 0 to 15.
 * @param {number} localZ - Chunk-local z, 0 to 15.
 * @returns {number} The heightmap index, 0 to 255.
 */
export const heightmapIndexOf = (localX: number, localZ: number): number => (localX << 4) | localZ;
