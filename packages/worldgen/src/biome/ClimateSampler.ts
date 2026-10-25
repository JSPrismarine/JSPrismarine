import type { DensitySampler } from '../density/compile';
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
    const temperature = randomState.sampler(router.temperature);
    const humidity = randomState.sampler(router.vegetation);
    const continentalness = randomState.sampler(router.continents);
    const erosion = randomState.sampler(router.erosion);
    const depth = randomState.sampler(router.depth);
    const weirdness = randomState.sampler(router.ridges);
    const at = (sampler: DensitySampler, x: number, y: number, z: number): number => sampler(context, x, y, z);

    return {
        sample: (quartX, quartY, quartZ) => {
            const x = quartToBlock(quartX);
            const y = quartToBlock(quartY);
            const z = quartToBlock(quartZ);
            return climateTarget(
                at(temperature, x, y, z),
                at(humidity, x, y, z),
                at(continentalness, x, y, z),
                at(erosion, x, y, z),
                at(depth, x, y, z),
                at(weirdness, x, y, z)
            );
        },
        erosion: (x, y, z) => at(erosion, x, y, z)
    };
};
