/**
 * How a `worlds.<name>` entry becomes the level stems a {@link Level} is built from.
 *
 * Three inputs, in rising priority: the `worldgen/world_preset` the entry names supplies a stem
 * per dimension; each `dimensions.<id>` entry replaces that stem's type or generator, or adds a
 * dimension the preset lacks; and the `worldGenSettings` a save already carries win over both,
 * because a world keeps the terrain it was generated with. The last step is reported line by
 * line so a config that disagrees with its save is not silently ignored.
 */
import type { DimensionTypeDefinition, LevelStem, WorldPreset } from '@jsprismarine/worldgen';
import {
    OVERWORLD_STEM_ID,
    parseDimensionType,
    parseGeneratorDefinition,
    parseWorldPreset
} from '@jsprismarine/worldgen';

import { DEFAULT_WORLD_PRESET, FLAT_WORLD_PRESET } from '../config/normalizeWorldData';
import type { NormalizedWorldData } from '../config/normalizeWorldData';
import { flatStem } from './generators/factories/flat';
import { OVERWORLD_NOISE_STEM } from './generators/factories/noise';
import type { JavaWorldgenRegistries } from './generators/datadriven/javaWorldgenData';
import type { DimensionLoad } from './Level';
import { VANILLA_DIMENSION_TYPES } from './vanillaDimensionTypes';
import type { WorldGenSettings } from './WorldPersistence';
import { levelStemJsonOf } from './WorldPersistence';

/**
 * The two presets the old `generator` names stood for, with the Overworld stem alone.
 *
 * What a server without the Java data cache boots from: `minecraft:flat` builds without any
 * Java data, and `minecraft:normal` fails in the noise factory with the message that names the
 * fetch commands, as it did before presets were read. With the cache warm the datapack's seven
 * presets are read instead, and both of these carry the Nether and the End as well.
 */
export const BUILT_IN_WORLD_PRESETS: ReadonlyMap<string, WorldPreset> = new Map([
    [DEFAULT_WORLD_PRESET, { dimensions: new Map([[OVERWORLD_STEM_ID, OVERWORLD_NOISE_STEM]]) }],
    [FLAT_WORLD_PRESET, { dimensions: new Map([[OVERWORLD_STEM_ID, flatStem(OVERWORLD_STEM_ID)]]) }]
]);

/**
 * Every `worldgen/world_preset` the pack stack carries, parsed and keyed by id.
 *
 * @throws When a preset document is malformed, naming it.
 */
export const worldPresetsOf = (registries: JavaWorldgenRegistries): ReadonlyMap<string, WorldPreset> => {
    const presets = new Map<string, WorldPreset>();
    for (const [id, document] of registries.worldPresets) {
        presets.set(id, parseWorldPreset(document, `worldgen/world_preset/${id}`));
    }
    return presets;
};

/**
 * The stems of one level: the preset's, with the entry's `dimensions` applied and a save's
 * stems put back over the result.
 *
 * @param world - The entry after `normalizeWorldData`.
 * @param presets - The presets the entry's `preset` may name.
 * @param saved - The stems the save was generated with, when it has any. Each one replaces the
 *   configured stem of its dimension, and a saved dimension the config no longer names is kept.
 * @param log - Told once per saved stem that differs from the config, in a line naming the
 *   dimension and both generator kinds.
 * @returns The stems by dimension id, preset order first, then the dimensions the config or the
 *   save added.
 * @throws When the preset is unknown, an override's generator is malformed, or an added
 *   dimension lacks its `type` or `generator`.
 */
export const resolveStems = (
    world: NormalizedWorldData,
    presets: ReadonlyMap<string, WorldPreset>,
    saved?: WorldGenSettings,
    log: (line: string) => void = () => {}
): ReadonlyMap<string, LevelStem> => {
    const preset = presets.get(world.preset);
    if (preset === undefined) {
        throw new Error(`Unknown world preset ${world.preset}. Known presets: ${[...presets.keys()].join(', ')}`);
    }

    const stems = new Map(preset.dimensions);
    for (const [id, override] of Object.entries(world.dimensions)) {
        const base = stems.get(id);
        const type = override.type ?? base?.type;
        const generator =
            override.generator === undefined
                ? base?.generator
                : parseGeneratorDefinition(override.generator, `dimensions['${id}'].generator`);

        if (type === undefined || generator === undefined) {
            const missing = type === undefined ? 'a type' : 'a generator';
            throw new Error(`dimensions['${id}'] adds a dimension ${world.preset} lacks, so it needs ${missing}`);
        }
        stems.set(id, { type, generator });
    }

    for (const [id, stem] of Object.entries(saved?.dimensions ?? {})) {
        const configured = stems.get(id);
        if (configured === undefined) {
            log(
                `${id} was generated with ${stem.generator.type} but the config no longer names it; keeping the saved stem`
            );
        } else if (!sameStem(configured, stem)) {
            log(
                `${id} was generated with ${stem.generator.type} but the config says ${configured.generator.type}; keeping the saved stem`
            );
        }
        stems.set(id, stem);
    }

    return stems;
};

/** Whether two stems describe the same terrain, compared as the documents they save to. */
const sameStem = (a: LevelStem, b: LevelStem): boolean =>
    JSON.stringify(levelStemJsonOf(a)) === JSON.stringify(levelStemJsonOf(b));

/**
 * When each stem's world is built: the Overworld at startup and every other stem on first
 * entry, unless the entry's `dimensions.<id>.load` says otherwise.
 *
 * @returns One entry per stem, in stem order.
 */
export const loadOf = (
    world: NormalizedWorldData,
    stems: ReadonlyMap<string, LevelStem>
): ReadonlyMap<string, DimensionLoad> => {
    const load = new Map<string, DimensionLoad>();
    for (const id of stems.keys()) {
        load.set(id, world.dimensions[id]?.load ?? (id === OVERWORLD_STEM_ID ? 'eager' : 'lazy'));
    }
    return load;
};

/**
 * The `dimension_type` definition of every type the stems name.
 *
 * The three vanilla types come from the copies this package ships, so a vanilla level opens
 * without the Java data cache; any other type is read from the pack stack's `dimension_type`
 * registry, which is when the registries are first asked for.
 *
 * @param registries - The pack stack's registries, read only for a type the vanilla three do
 *   not cover.
 * @throws When a stem names a type neither source defines.
 */
export const dimensionTypesOf = (
    stems: ReadonlyMap<string, LevelStem>,
    registries: () => JavaWorldgenRegistries
): ReadonlyMap<string, DimensionTypeDefinition> => {
    const types = new Map<string, DimensionTypeDefinition>(Object.entries(VANILLA_DIMENSION_TYPES));
    for (const [id, stem] of stems) {
        if (types.has(stem.type)) continue;

        const document = registries().dimensionTypes.get(stem.type);
        if (document === undefined) {
            throw new Error(`The ${id} dimension names the dimension type ${stem.type}, which no pack defines`);
        }
        types.set(stem.type, parseDimensionType(document, stem.type));
    }
    return types;
};
