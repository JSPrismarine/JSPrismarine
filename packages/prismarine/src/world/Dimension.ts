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
    SEA_LEVELS,
    dimensionByBedrockId,
    dimensionByName,
    dimensionTypeOf,
    type DimensionType
} from './DimensionType';

/**
 * The name this type had before it carried the Java definition.
 * @deprecated Use {@link DimensionType}. Removed in the next release.
 */
export type DimensionDefinition = DimensionType;

/** The index of the lowest sub chunk. Negative for the Overworld. */
export const minSubChunk = (dimension: DimensionType): number => dimension.minY >> 4;

/** How many sub chunks the dimension spans, which is also how many biome palettes it carries. */
export const subChunkCount = (dimension: DimensionType): number => dimension.height >> 4;

/** The index of the highest sub chunk. */
export const maxSubChunk = (dimension: DimensionType): number =>
    minSubChunk(dimension) + subChunkCount(dimension) - 1;

/** The highest placeable y. */
export const maxY = (dimension: DimensionType): number => dimension.minY + dimension.height - 1;

/** Whether a block y lies inside the dimension. */
export const contains = (dimension: DimensionType, y: number): boolean =>
    y >= dimension.minY && y <= maxY(dimension);
