import { SampleContext } from '../density/SampleContext';
import { quartToBlock } from '../math';
import type { RandomState } from '../RandomState';
import type { ClimateTargetPoint } from './Climate';
import { climateTarget } from './Climate';

/**
 * The six climate slots of the noise router, sampled at a biome cell.
 *
 * Biome cells are 4 by 4 by 4 blocks, so a sampler takes quart coordinates and multiplies by
 * four before it reaches the density functions. The end biome source is the one caller that
 * also needs a raw block-coordinate sample, which {@link ClimateSampler.erosion} gives it.
 */
export interface ClimateSampler {
    /** Samples all six climate functions at one biome cell. */
    sample(quartX: number, quartY: number, quartZ: number): ClimateTargetPoint;
    /** Samples the erosion function at one block position. */
    erosion(x: number, y: number, z: number): number;
}

/**
 * Builds the climate sampler for a seed and a dimension.
 *
 * @param context - The memo slots the compiled density functions share. Pass a fresh one per
 *   region walked, or leave it out for an independent sampler.
 */
export const createClimateSampler = (randomState: RandomState, context = new SampleContext()): ClimateSampler => {
    const router = randomState.settings.noiseRouter;
    const temperature = createColumnSampler(randomState, router.temperature, context);
    const humidity = createColumnSampler(randomState, router.vegetation, context);
    const continentalness = createColumnSampler(randomState, router.continents, context);
    const erosion = createColumnSampler(randomState, router.erosion, context);
    const depth = randomState.sampler(router.depth);
    const weirdness = createColumnSampler(randomState, router.ridges, context);
    return {
        sample: (quartX, quartY, quartZ) => {
            const x = quartToBlock(quartX);
            const y = quartToBlock(quartY);
            const z = quartToBlock(quartZ);
            return climateTarget(
                temperature(x, y, z),
                humidity(x, y, z),
                continentalness(x, y, z),
                erosion(x, y, z),
                depth(context, x, y, z),
                weirdness(x, y, z)
            );
        },
        erosion: (x, y, z) => erosion(x, y, z)
    };
};

const CLIMATE_COLUMN_CACHE_SIDE = 32;
const CLIMATE_COLUMN_CACHE_SHIFT = Math.log2(CLIMATE_COLUMN_CACHE_SIDE);
const CLIMATE_COLUMN_CACHE_SLOTS = CLIMATE_COLUMN_CACHE_SIDE * CLIMATE_COLUMN_CACHE_SIDE;

/** Stores one climate function's values for the current horizontal columns. */
const createColumnSampler = (
    randomState: RandomState,
    node: Parameters<RandomState['sampler']>[0],
    context: SampleContext
): ((x: number, y: number, z: number) => number) => {
    const sampler = randomState.sampler(node);
    if (!randomState.isYIndependent(node)) return (x, y, z) => sampler(context, x, y, z);

    const keyX = new Float64Array(CLIMATE_COLUMN_CACHE_SLOTS);
    const keyZ = new Float64Array(CLIMATE_COLUMN_CACHE_SLOTS);
    const values = new Float64Array(CLIMATE_COLUMN_CACHE_SLOTS);
    const filled = new Uint8Array(CLIMATE_COLUMN_CACHE_SLOTS);

    return (x, _y, z) => {
        const slot =
            (x & (CLIMATE_COLUMN_CACHE_SIDE - 1)) |
            ((z & (CLIMATE_COLUMN_CACHE_SIDE - 1)) << CLIMATE_COLUMN_CACHE_SHIFT);
        if (filled[slot] === 1 && keyX[slot] === x && keyZ[slot] === z) return values[slot] ?? 0;

        // Y-independent trees are evaluated at Java's y=0 slice; exact X/Z keys make collisions recompute.
        const value = sampler(context, x, 0, z);
        keyX[slot] = x;
        keyZ[slot] = z;
        values[slot] = value;
        filled[slot] = 1;
        return value;
    };
};
