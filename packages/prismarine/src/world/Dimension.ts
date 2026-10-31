/**
 * The vertical arithmetic every chunk, codec and light engine does on a {@link DimensionType}.
 *
 * The type itself, the vanilla three and the name lookup live in `DimensionType.ts` and are
 * re-exported here, so a module that only needs a bound keeps one import.
 */
import type { DimensionType } from './DimensionType';

export {
    Dimensions,
    FIRST_CUSTOM_DIMENSION_ID,
    dimensionByBedrockId,
    dimensionByName,
    dimensionTypeOf,
    type DimensionType
} from './DimensionType';

/**
 * The two numbers the vertical arithmetic reads. A {@link DimensionType} has them, and so does
 * the record a chunk generation task carries for one.
 */
export type DimensionBounds = Pick<DimensionType, 'minY' | 'height'>;

/** The index of the lowest sub chunk. Negative for the Overworld. */
export const minSubChunk = (dimension: DimensionBounds): number => dimension.minY >> 4;

/** How many sub chunks the dimension spans, which is also how many biome palettes it carries. */
export const subChunkCount = (dimension: DimensionBounds): number => dimension.height >> 4;

/** The index of the highest sub chunk. */
export const maxSubChunk = (dimension: DimensionBounds): number =>
    minSubChunk(dimension) + subChunkCount(dimension) - 1;

/** The highest placeable y. */
export const maxY = (dimension: DimensionBounds): number => dimension.minY + dimension.height - 1;

/** Whether a block y lies inside the dimension. */
export const contains = (dimension: DimensionBounds, y: number): boolean => y >= dimension.minY && y <= maxY(dimension);
