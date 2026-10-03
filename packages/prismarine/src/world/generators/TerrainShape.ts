import type Noise from './Noise';

/**
 * The shape of the overworld, expressed as a function of world coordinates alone.
 *
 * Sea level and the base height are absolute and unchanged by the world floor moving to -64 -
 * they are where vanilla puts them, and the terrain shape is built around them. Only the floor
 * and the ceiling come from the dimension.
 *
 * This lives apart from the generator because a structure needs to know how high the ground is
 * at coordinates it is not currently writing to. A village is planned once, at its origin, and
 * then drawn into each of the several chunks it covers; if each chunk worked out its own idea
 * of ground level, the halves of a house would sit at different heights. Sampling the same
 * function from anywhere gives every chunk the same answer.
 */

/** Everything below this fills with water when the ground does not reach it. */
export const SEA_LEVEL = 62;

/** Terrain rides on this, plus or minus {@link HEIGHT_VARIATION}. */
export const BASE_HEIGHT = 64;
export const HEIGHT_VARIATION = 32;

/**
 * Larger divisor, wider hills. Measured over a 512x512 sample this puts the ground between
 * y=44 and y=87 with roughly a quarter of it under water, which is varied enough to see.
 */
export const TERRAIN_SCALE = 96;

/** How deep the dirt under grass goes. */
export const SOIL_DEPTH = 4;

/** Shores within this much of sea level get sand rather than grass. */
export const BEACH_BAND = 2;

/**
 * The topmost solid block's height at a world position, before anything is decorated onto it.
 * @param {Noise} noise - The world's noise, seeded from the world seed.
 * @param {number} worldX - World x, not chunk-local.
 * @param {number} worldZ - World z, not chunk-local.
 * @param {number} floor - The dimension's lowest placeable y.
 * @param {number} ceiling - The dimension's highest placeable y.
 * @returns {number} The y of the surface block.
 */
export const surfaceHeightAt = (
    noise: Noise,
    worldX: number,
    worldZ: number,
    floor: number,
    ceiling: number
): number => {
    const shape = noise.fractal(worldX / TERRAIN_SCALE, worldZ / TERRAIN_SCALE);

    // Centre the noise on zero so it raises and lowers the base height evenly.
    const height = Math.round(BASE_HEIGHT + (shape - 0.5) * 2 * HEIGHT_VARIATION);

    // Never below the bedrock floor, never through the ceiling.
    return Math.min(Math.max(height, floor + 1), ceiling);
};

/** Whether a column is shore or seabed rather than grass - see {@link BEACH_BAND}. */
export const isSandy = (height: number): boolean => height <= SEA_LEVEL + BEACH_BAND;
