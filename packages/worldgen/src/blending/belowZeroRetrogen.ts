/**
 * Java's `BelowZeroRetrogen`: how a pre-1.18 overworld chunk gets its new floor.
 *
 * Before 1.18 the overworld ran from y 0 to 255. When Java loads such a chunk, the data fixer
 * `ChunkHeightAndBiomeFix` looks at its y = 0 layer. If the layer holds bedrock, the chunk is
 * generated again between y -64 and -1 with the current generator, blended toward its own old
 * terrain above. The old bedrock floor at y 0 to 4 becomes deepslate, and a column that had no
 * bedrock at y = 0, where a player dug through the floor, stays open all the way down.
 *
 * This module holds the rules as data and functions over Java ids. Reading and writing the chunk
 * belongs to whoever stores it.
 */
import type { BiomeResolver } from '../biome/BiomeSource';

/** The lowest block y the upgrade generates, Java's `UPGRADE_HEIGHT_ACCESSOR.getMinY()`. */
export const RETROGEN_MIN_Y = -64;

/** One past the highest block y the upgrade generates: it fills everything under the old floor. */
export const RETROGEN_END_Y = 0;

/** The old bedrock layers `replaceOldBedrock` turns into deepslate, y 0 to 4 inclusive. */
export const RETROGEN_OLD_BEDROCK_MAX_Y = 4;

/**
 * The cave biomes the upgrade keeps from the biome source. Every other quart under the old floor
 * takes the old chunk's biome at y = 0, so a desert stays a desert all the way down.
 */
export const RETAINED_RETROGEN_BIOMES: ReadonlySet<string> = new Set([
    'minecraft:lush_caves',
    'minecraft:dripstone_caves',
    'minecraft:deep_dark'
]);

/**
 * Java's `BelowZeroRetrogen.getBiomeResolver` for an upgrading chunk.
 *
 * @param resolve - The biome source's lookup, already blended.
 * @param oldBiomeAtZero - The old chunk's biome at quart y 0, by quart x and z.
 */
export const retrogenBiomes =
    (resolve: BiomeResolver, oldBiomeAtZero: (quartX: number, quartZ: number) => string): BiomeResolver =>
    (quartX, quartY, quartZ) => {
        const biome = resolve(quartX, quartY, quartZ);
        return RETAINED_RETROGEN_BIOMES.has(biome) ? biome : oldBiomeAtZero(quartX, quartZ);
    };

/** What the y = 0 layer of a pre-1.18 chunk holds in one column. */
export type FloorBlock = 'bedrock' | 'air' | 'other';

/**
 * `ChunkHeightAndBiomeFix`'s test: whether a pre-1.18 chunk is upgraded, and which columns had
 * no bedrock at y = 0.
 *
 * The chunk is upgraded when its y = 0 layer holds any bedrock and is not air in every column.
 *
 * @param floorAt - The block at y = 0 of a column, by chunk-local x and z.
 * @returns The columns, as `z * 16 + x` like Java's bit set, that were air at y = 0, or
 *   undefined when the chunk is left as it is.
 */
export const missingBedrockOf = (floorAt: (x: number, z: number) => FloorBlock): ReadonlySet<number> | undefined => {
    const missing = new Set<number>();
    let anyBedrock = false;
    for (let z = 0; z < 16; z++) {
        for (let x = 0; x < 16; x++) {
            const floor = floorAt(x, z);
            if (floor === 'air') missing.add(z * 16 + x);
            if (floor === 'bedrock') anyBedrock = true;
        }
    }
    return anyBedrock && missing.size !== 256 ? missing : undefined;
};
