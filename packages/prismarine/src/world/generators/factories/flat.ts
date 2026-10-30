import type { FlatGeneratorSettings, LevelStem } from '@jsprismarine/worldgen';

import type { GeneratorFactory } from '../../GeneratorFactories';
import { DEFAULT_FLAT_SETTINGS, FlatGenerator } from '../Flat';

export { DEFAULT_FLAT_SETTINGS } from '../Flat';

/** The kind id of Java's superflat generator. */
export const FLAT_GENERATOR_KIND = 'minecraft:flat';

/**
 * A flat stem for a dimension type.
 *
 * @param settings - The layers and biome. Defaults to {@link DEFAULT_FLAT_SETTINGS}.
 */
export const flatStem = (
    dimensionType: string,
    settings: FlatGeneratorSettings = DEFAULT_FLAT_SETTINGS
): LevelStem => ({
    type: dimensionType,
    generator: { type: FLAT_GENERATOR_KIND, settings }
});

/**
 * The `minecraft:flat` kind: the stem's layers stacked from the dimension's floor, in the
 * stem's biome.
 *
 * `lakes`, `features` and `structure_overrides` are read and kept but not yet honored: no
 * feature or structure runs over a flat chunk today.
 */
export const flatGeneratorFactory: GeneratorFactory = {
    kind: FLAT_GENERATOR_KIND,
    build(context) {
        const generator = context.stem.generator;
        // The stem parser only produces settings for this kind, so a stem of another kind
        // reaching this factory is a registry bug rather than a data error.
        if (
            generator.type !== FLAT_GENERATOR_KIND ||
            !('settings' in generator) ||
            !isFlatSettings(generator.settings)
        ) {
            throw new TypeError(`The ${context.dimension.id} stem carries no flat generator settings`);
        }

        return new FlatGenerator({
            settings: generator.settings,
            dimension: context.dimension,
            content: context.content,
            logger: context.logger
        });
    }
};

const isFlatSettings = (value: unknown): value is FlatGeneratorSettings =>
    typeof value === 'object' && value !== null && 'layers' in value && Array.isArray(value.layers);
