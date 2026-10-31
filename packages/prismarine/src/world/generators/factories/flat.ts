import type { FlatGeneratorSettings, LevelStem } from '@jsprismarine/worldgen';
import { parseFlatGeneratorSettings } from '@jsprismarine/worldgen';

import type { GeneratorFactory } from '../../GeneratorFactories';
import type { JavaWorldgenRegistries } from '../datadriven/javaWorldgenData';
import { DEFAULT_FLAT_SETTINGS, FlatGenerator } from '../Flat';

export { DEFAULT_FLAT_SETTINGS } from '../Flat';

/** The kind id of Java's superflat generator. */
export const FLAT_GENERATOR_KIND = 'minecraft:flat';

/**
 * A flat stem for a dimension type.
 *
 * @param settings - The layers and biome, or the `worldgen/flat_level_generator_preset` id that
 *   carries them. Defaults to {@link DEFAULT_FLAT_SETTINGS}.
 */
export const flatStem = (
    dimensionType: string,
    settings: FlatGeneratorSettings | string = DEFAULT_FLAT_SETTINGS
): LevelStem => ({
    type: dimensionType,
    generator: { type: FLAT_GENERATOR_KIND, settings }
});

/**
 * The `minecraft:flat` kind: the stem's layers stacked from the dimension's floor, in the
 * stem's biome.
 *
 * The stem's `settings` is the settings object or a `worldgen/flat_level_generator_preset` id,
 * which Java's `world_gen_settings` allows in its place. The id resolves through the pack
 * stack's preset registry, so a datapack's preset works as well as the vanilla nine; that is
 * the one case in which this kind reads the Java registries.
 *
 * `lakes`, `features` and `structure_overrides` are read and kept but not yet honored: no
 * feature or structure runs over a flat chunk today.
 *
 * @throws {Error} When the stem names a preset no `worldgen/flat_level_generator_preset`
 *   document defines, or the preset's `settings` do not parse.
 */
export const flatGeneratorFactory: GeneratorFactory = {
    kind: FLAT_GENERATOR_KIND,
    build(context) {
        const generator = context.stem.generator;
        // The stem parser only produces settings for this kind, so a stem of another kind
        // reaching this factory is a registry bug rather than a data error.
        if (generator.type !== FLAT_GENERATOR_KIND || !('settings' in generator)) {
            throw new TypeError(`The ${context.dimension.id} stem carries no flat generator settings`);
        }
        const settings =
            typeof generator.settings === 'string'
                ? presetSettings(context.worldgen(), context.dimension.id, generator.settings)
                : generator.settings;
        if (!isFlatSettings(settings)) {
            throw new TypeError(`The ${context.dimension.id} stem carries no flat generator settings`);
        }

        return new FlatGenerator({
            settings,
            dimension: context.dimension,
            content: context.content,
            logger: context.logger
        });
    }
};

/**
 * The settings of a `worldgen/flat_level_generator_preset`, which the datapack wraps under a
 * `settings` key beside the `display` item the preset picker shows.
 *
 * @throws {Error} When no document has the id, or its `settings` do not parse.
 */
const presetSettings = (
    registries: JavaWorldgenRegistries,
    dimensionType: string,
    preset: string
): FlatGeneratorSettings => {
    const document = registries.flatLevelGeneratorPresets.get(preset);
    if (document === undefined) {
        throw new Error(
            `The ${dimensionType} stem names the flat preset ${preset}, which no worldgen/flat_level_generator_preset document defines`
        );
    }
    const path = `worldgen/flat_level_generator_preset/${preset}`;
    const settings =
        typeof document === 'object' && document !== null && 'settings' in document ? document.settings : undefined;
    return parseFlatGeneratorSettings(settings, `${path}.settings`);
};

const isFlatSettings = (value: unknown): value is FlatGeneratorSettings =>
    typeof value === 'object' && value !== null && 'layers' in value && Array.isArray(value.layers);
