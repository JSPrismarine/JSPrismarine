import type { LevelStem } from '@jsprismarine/worldgen';
import { OVERWORLD_STEM_ID, parseGeneratorDefinition } from '@jsprismarine/worldgen';

import type { NormalizedWorldData } from '../config/normalizeWorldData';
import { FLAT_WORLD_PRESET } from '../config/normalizeWorldData';
import { flatStem } from './generators/factories/flat';
import { OVERWORLD_NOISE_STEM } from './generators/factories/noise';

/**
 * The Overworld stem a normalized world entry asks for, until the preset itself is read.
 *
 * A `dimensions['minecraft:overworld'].generator` is the stem's generator, parsed, which is
 * how a flat world keeps its layers and how a kind registered through
 * `GeneratorFactories.registerClassGenerator` is reached. Without one, the preset decides
 * between the two stems the old `generator` key could name: `minecraft:flat` is the flat stem
 * with the default layers and anything else is the `minecraft:normal` Overworld stem. Interim:
 * the world preset and the other dimensions are read from the pack stack next, and this choice
 * moves into that loader.
 *
 * @param world - The entry after {@link normalizeWorldData}.
 * @param dimensionType - The `dimension_type` id the stem binds. Defaults to the Overworld's.
 * @throws When the configured generator is malformed, as a `minecraft:flat` one without
 *   `layers` or a `minecraft:noise` one without `biome_source`.
 */
export const overworldStemOf = (world: NormalizedWorldData, dimensionType: string = OVERWORLD_STEM_ID): LevelStem => {
    const configured = world.dimensions[OVERWORLD_STEM_ID]?.generator;
    if (configured !== undefined) {
        return {
            type: dimensionType,
            generator: parseGeneratorDefinition(configured, `dimensions['${OVERWORLD_STEM_ID}'].generator`)
        };
    }

    return world.preset === FLAT_WORLD_PRESET
        ? flatStem(dimensionType)
        : { ...OVERWORLD_NOISE_STEM, type: dimensionType };
};
