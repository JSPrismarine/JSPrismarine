/**
 * How tall a world is, and where its floor sits.
 *
 * Every vertical bound in the chunk stack derives from one of these rather than from a constant,
 * because the three vanilla dimensions do not agree on any of them: the Overworld starts at -64
 * and is 384 blocks tall, the Nether starts at 0 and is 128, the End starts at 0 and is 256.
 *
 * The sub chunk index is the y coordinate shifted right by four, and stays signed - index -4 is
 * the Overworld's bottom sub chunk, covering y -64 to -49. That is also exactly how the index
 * byte is stored in a Bedrock world's sub chunk records, so nothing needs rebasing on the way to
 * disk.
 */
export interface DimensionDefinition {
    /** The id that travels in the network packets and in a LevelDB chunk key. */
    readonly id: 0 | 1 | 2;
    readonly name: string;
    readonly minY: number;
    readonly height: number;
}

export const Dimensions = {
    Overworld: { id: 0, name: 'minecraft:overworld', minY: -64, height: 384 },
    Nether: { id: 1, name: 'minecraft:nether', minY: 0, height: 128 },
    TheEnd: { id: 2, name: 'minecraft:the_end', minY: 0, height: 256 },

    /**
     * The 0..255 shape the server used before real world heights, kept so the change to real ones
     * could be made in two reviewable steps rather than one. Nothing should reach for this.
     * @deprecated Use {@link Dimensions.Overworld}.
     */
    Legacy: { id: 0, name: 'minecraft:overworld', minY: 0, height: 256 }
} as const satisfies Record<string, DimensionDefinition>;

export type DimensionName = 'overworld' | 'nether' | 'the_end';

/** The index of the lowest sub chunk. Negative for the Overworld. */
export const minSubChunk = (dimension: DimensionDefinition): number => dimension.minY >> 4;

/** How many sub chunks the dimension spans, which is also how many biome palettes it carries. */
export const subChunkCount = (dimension: DimensionDefinition): number => dimension.height >> 4;

/** The index of the highest sub chunk. */
export const maxSubChunk = (dimension: DimensionDefinition): number =>
    minSubChunk(dimension) + subChunkCount(dimension) - 1;

/** The highest placeable y. */
export const maxY = (dimension: DimensionDefinition): number => dimension.minY + dimension.height - 1;

export const contains = (dimension: DimensionDefinition, y: number): boolean =>
    y >= dimension.minY && y <= maxY(dimension);

export const dimensionByName = (name: DimensionName): DimensionDefinition => {
    switch (name) {
        case 'nether':
            return Dimensions.Nether;
        case 'the_end':
            return Dimensions.TheEnd;
        default:
            return Dimensions.Overworld;
    }
};
