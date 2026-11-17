/**
 * What fluid a chunk holds at one position, as Java's `getFluidState` reads a block.
 */
import { liquidOf } from '../physics/BlockRules';
import type Chunk from './Chunk';

/**
 * The fluid block at a position of a chunk: the block itself when it is a fluid, or else the
 * water a waterlogged block keeps in its liquid layer, which is where Bedrock stores what Java's
 * `BlockState.getFluidState` answers with.
 *
 * @param x - Chunk-local x, 0 to 15.
 * @param z - Chunk-local z, 0 to 15.
 * @returns The fluid block's name, or undefined when the position holds no fluid.
 */
export const fluidNameAt = (chunk: Chunk, x: number, y: number, z: number): string | undefined => {
    const name = chunk.getBlock(x, y, z).name;
    if (liquidOf(name) !== null) return name;
    const liquid = chunk.getBlock(x, y, z, 1).name;
    return liquidOf(liquid) === null ? undefined : liquid;
};
