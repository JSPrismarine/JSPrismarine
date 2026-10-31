import { OVERWORLD_STEM_ID } from '@jsprismarine/worldgen';
import type { DimensionConfig, GeneratorDefinitionJson, WorldData } from './JsonConfigTypes';

/** The `worldgen/world_preset` a world uses when its entry names none. */
export const DEFAULT_WORLD_PRESET = 'minecraft:normal';

/** The `worldgen/world_preset` the old `generator: 'Flat'` stands for. */
export const FLAT_WORLD_PRESET = 'minecraft:flat';

/**
 * One layer of a flat world, bottom first, as the old `layers` key spelled it.
 *
 * `FlatLayerJson` is the replacement, which calls the same number `height` as Java does.
 */
export interface FlatLayer {
    readonly block: string;
    readonly size: number;
}

/**
 * A `worlds.<name>` entry as a config written before `preset` and `dimensions` spells it.
 *
 * `generator` named the generator class, `Overworld` or `Flat`, and `layers` the flat layers.
 * Neither key is part of {@link WorldData} or the config schema any more; this is the shape
 * {@link normalizeWorldData} still reads so an old file loads and is written back in the new
 * spelling on its first start.
 */
export interface LegacyWorldData extends WorldData {
    /** The old generator name, `Overworld` or `Flat`, in any case. */
    readonly generator?: string;
    /** The old flat world layers, read only with `generator: 'Flat'`. */
    readonly layers?: readonly FlatLayer[];
}

/**
 * What the old `generator` names stand for, keyed lowercase because `GeneratorManager`
 * matched them that way.
 */
const LEGACY_GENERATOR_PRESETS: Readonly<Record<string, string>> = {
    overworld: DEFAULT_WORLD_PRESET,
    flat: FLAT_WORLD_PRESET
};

/**
 * A world entry with the old `generator` and `layers` keys translated into `preset` and
 * `dimensions`, and nothing left optional that the loader would otherwise default.
 */
export interface NormalizedWorldData {
    readonly seed: string | number;
    readonly provider?: string;
    /** The `worldgen/world_preset` id, `minecraft:normal` when the entry named none. */
    readonly preset: string;
    /** The entry's own `dimensions`, plus an Overworld stem translated from old flat `layers`. */
    readonly dimensions: Readonly<Record<string, DimensionConfig>>;
    /**
     * One sentence per old key the entry used, written for a log line. Empty when the entry
     * already spells everything the new way, which is what a caller that logs these once per
     * world and rewrites the entry converges on.
     */
    readonly deprecations: readonly string[];
}

/**
 * The `minecraft:flat` generator that reproduces an old `layers` list.
 *
 * `biome`, `lakes`, `features` and `structure_overrides` are written out rather than left to
 * their defaults so the entry reads the same in the file as it did in the old generator: one
 * plains biome, no lakes, no features, no structures.
 */
const flatGeneratorOf = (layers: readonly FlatLayer[]): GeneratorDefinitionJson => ({
    type: 'minecraft:flat',
    settings: {
        biome: 'minecraft:plains',
        layers: layers.map(({ block, size }) => ({ block, height: size })),
        lakes: false,
        features: false,
        structure_overrides: []
    }
});

/**
 * Reads a `worlds.<name>` entry in either its old or its new spelling and answers the new one.
 *
 * The translation, row for row: `generator: 'Overworld'` or no `generator` is
 * `preset: 'minecraft:normal'`; `generator: 'Flat'` is `preset: 'minecraft:flat'`; `Flat` with
 * `layers` adds an Overworld stem whose `minecraft:flat` generator carries the same layers,
 * spelled `{ block, height }`. A `preset` or an Overworld `generator` the entry already
 * spells the new way wins over the translated one, so an entry that carries both keeps what
 * its author wrote last. The function is pure: it neither logs nor writes.
 *
 * @param data - The entry as read from the file.
 * @param knownKinds - The generator kinds a `dimensions.<id>.generator.type` may name, for
 *   the error message.
 * @throws When `generator` is a string other than `Overworld` or `Flat`, in any case, which is
 *   what `GeneratorManager` refused before this.
 */
export const normalizeWorldData = (data: LegacyWorldData, knownKinds: readonly string[]): NormalizedWorldData => {
    const { seed, provider, generator, layers } = data;
    const deprecations: string[] = [];
    const dimensions: Record<string, DimensionConfig> = { ...data.dimensions };
    let preset = data.preset;
    let legacyPreset: string | undefined;

    if (generator !== undefined) {
        legacyPreset = LEGACY_GENERATOR_PRESETS[generator.toLowerCase()];
        if (legacyPreset === undefined) {
            throw new Error(
                `Invalid generator with id ${generator}. The \`generator\` key is deprecated: write ` +
                    `\`preset\` as '${DEFAULT_WORLD_PRESET}' or '${FLAT_WORLD_PRESET}', or a ` +
                    `\`dimensions\` entry whose generator type is one of: ${knownKinds.join(', ')}.`
            );
        }
        deprecations.push(`\`generator: '${generator}'\` is deprecated; write \`preset: '${legacyPreset}'\`.`);
        preset ??= legacyPreset;
    }

    if (layers !== undefined) {
        if (legacyPreset === FLAT_WORLD_PRESET) {
            deprecations.push(
                '`layers` is deprecated; write the layers as `{ block, height }` under ' +
                    `\`dimensions['${OVERWORLD_STEM_ID}'].generator.settings.layers\`.`
            );
            const overworld = dimensions[OVERWORLD_STEM_ID];
            if (overworld?.generator === undefined) {
                dimensions[OVERWORLD_STEM_ID] = { ...overworld, generator: flatGeneratorOf(layers) };
            }
        } else {
            deprecations.push("`layers` is deprecated and has no effect without `generator: 'Flat'`; remove it.");
        }
    }

    return { seed, provider, preset: preset ?? DEFAULT_WORLD_PRESET, dimensions, deprecations };
};

/**
 * The entry to write back to the file for a normalized world: the new keys only, with
 * `provider` and `dimensions` left out when there is nothing to say.
 */
export const worldDataOf = ({ seed, provider, preset, dimensions }: NormalizedWorldData): WorldData => ({
    preset,
    ...(provider === undefined ? {} : { provider }),
    seed,
    ...(Object.keys(dimensions).length === 0 ? {} : { dimensions })
});
