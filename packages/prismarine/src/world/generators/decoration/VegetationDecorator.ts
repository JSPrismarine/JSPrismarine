import type { DecorationContext, Decorator } from './Decorator';
import { heightIndex } from './Decorator';

/** Chance a grass column gets something growing on it. */
const GRASS_DENSITY = 0.18;

/** Of those, how many are flowers rather than grass tufts. */
const FLOWER_SHARE = 0.12;

/** Chance a sand column above water gets a dead bush. */
const DESERT_DENSITY = 0.02;

const FLOWERS = ['minecraft:dandelion', 'minecraft:poppy'] as const;

/**
 * Scatters grass tufts, flowers and dead bushes over the surface.
 *
 * Runs last, so it can see what the trees and caves left behind and only plant on ground
 * that is still there and still open to the sky.
 */
export class VegetationDecorator implements Decorator {
    public readonly name = 'vegetation';

    public decorate(context: DecorationContext): void {
        const { chunk, random, palette, heights } = context;
        const grassBlock = palette['minecraft:grass_block']!;
        const sand = palette['minecraft:sand']!;
        const air = palette['minecraft:air']!;

        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                const ground = heights[heightIndex(x, z)]!;
                const above = ground + 1;

                // Nothing grows under a tree, in a cave mouth, or below the waterline.
                if (chunk.getBlockRuntimeId(x, above, z) !== air) continue;

                const surface = chunk.getBlockRuntimeId(x, ground, z);

                if (surface === grassBlock && random.chance(GRASS_DENSITY)) {
                    const plant = random.chance(FLOWER_SHARE)
                        ? palette[random.pick(FLOWERS)]
                        : palette['minecraft:short_grass'];

                    if (plant !== undefined) chunk.setBlockRuntimeId(x, above, z, plant);
                    continue;
                }

                if (surface === sand && random.chance(DESERT_DENSITY)) {
                    const bush = palette['minecraft:deadbush'];
                    if (bush !== undefined) chunk.setBlockRuntimeId(x, above, z, bush);
                }
            }
        }
    }
}

export default VegetationDecorator;
