import type {
    BiomeSourceDefinition,
    ClimateParameter,
    ClimateParameterPoint,
    FlatGeneratorDefinition,
    GeneratorDefinition,
    LevelStem,
    NoiseGeneratorDefinition
} from '@jsprismarine/worldgen';
import { parseLevelStem, unquantizeClimateCoord } from '@jsprismarine/worldgen';

import type { SavedWeather } from './Weather';
import { savedWeatherOf } from './Weather';

/** A non-player entity snapshot used by providers without actor storage. */
export interface LegacyWorldEntity {
    type: string;
    position: {
        x: number;
        y: number;
        z: number;
        pitch?: number;
        yaw?: number;
        headYaw?: number;
    };
}

/**
 * The generators a save was made with, in the shape of Java's `world_gen_settings.dat`.
 *
 * Written once the stems are resolved and read back before they are resolved again, so a world
 * keeps the terrain it was generated with when the config changes under it. The stems are
 * stored as Java `dimension` documents, which is what `parseLevelStem` reads.
 */
export interface WorldGenSettings {
    /** The seed as a decimal string, since JSON cannot hold a 64-bit integer. */
    readonly seed: string;
    /** The resolved stem of every dimension, by Java dimension id such as `minecraft:the_nether`. */
    readonly dimensions: Readonly<Record<string, LevelStem>>;
}

/** World state a provider stores outside the chunk data. */
export interface WorldPersistenceData {
    spawn?: { x: number; y: number; z: number };
    gameRules?: Array<[string, [boolean | number, boolean]]>;
    weather?: SavedWeather;
    /** Used by providers that do not store actors in chunk data. */
    entities?: LegacyWorldEntity[];
    /** The seed and stems the save was generated with. */
    worldGenSettings?: WorldGenSettings;
}

/**
 * Reads persisted world state at the JSON and NBT boundaries.
 *
 * A malformed spawn, rule, weather or entity entry is dropped. A malformed stem is not: the
 * stems say which terrain the save holds, and starting with different ones would generate a
 * different world into the same chunks.
 *
 * @throws When `worldGenSettings` is present and one of its stems does not parse.
 */
export const worldPersistenceDataOf = (value: unknown): WorldPersistenceData => {
    if (!isRecord(value)) return {};

    const spawn = spawnOf(value['spawn']);
    const gameRules = gameRulesOf(value['gameRules']);
    const weather = savedWeatherOf(value['weather']);
    const entities = entitiesOf(value['entities']);
    const worldGenSettings = worldGenSettingsOf(value['worldGenSettings']);

    return {
        ...(spawn === undefined ? {} : { spawn }),
        ...(gameRules === undefined ? {} : { gameRules }),
        ...(weather === undefined ? {} : { weather }),
        ...(entities === undefined ? {} : { entities }),
        ...(worldGenSettings === undefined ? {} : { worldGenSettings })
    };
};

/**
 * The persisted state as the JSON object a provider stores.
 *
 * Everything but the stems is already plain data. A parsed stem is not: its biome source and
 * flat settings carry camel-cased fields and quantized climate values, so it is written back as
 * the Java document `parseLevelStem` reads.
 */
export const worldPersistenceJsonOf = (data: WorldPersistenceData): Record<string, unknown> => {
    const { worldGenSettings, ...rest } = data;
    if (worldGenSettings === undefined) return { ...rest };

    return {
        ...rest,
        worldGenSettings: {
            seed: worldGenSettings.seed,
            dimensions: Object.fromEntries(
                Object.entries(worldGenSettings.dimensions).map(([id, stem]) => [id, levelStemJsonOf(stem)])
            )
        }
    };
};

/**
 * Whether a stem's generator is `minecraft:noise`, narrowing it to its settings and biome
 * source. `GeneratorDefinition` carries an unknown-kind variant typed `type: string`, so a plain
 * comparison on `type` does not narrow the union by itself.
 */
export const isNoiseGenerator = (generator: GeneratorDefinition): generator is NoiseGeneratorDefinition =>
    generator.type === 'minecraft:noise';

/**
 * Whether a stem's generator is `minecraft:flat` with its layers in the stem, narrowing it to
 * them. A flat stem that names a `flat_level_generator_preset` instead is not one: its layers
 * live in the pack stack, and the stem is written back as the id it was read with.
 */
export const isFlatGenerator = (generator: GeneratorDefinition): generator is FlatGeneratorDefinition =>
    generator.type === 'minecraft:flat' && 'settings' in generator && typeof generator.settings === 'object';

/** A parsed level stem as the Java `dimension` document it came from. */
export const levelStemJsonOf = (stem: LevelStem): Record<string, unknown> => ({
    type: stem.type,
    generator: generatorJsonOf(stem.generator)
});

const generatorJsonOf = (generator: GeneratorDefinition): Record<string, unknown> => {
    if (isNoiseGenerator(generator)) {
        return {
            type: generator.type,
            settings: generator.settings,
            biome_source: biomeSourceJsonOf(generator.biomeSource)
        };
    }
    if (isFlatGenerator(generator)) {
        const { layers, biome, lakes, features, structureOverrides } = generator.settings;
        return {
            type: generator.type,
            settings: {
                layers: layers.map((layer) => ({ block: layer.block, height: layer.height })),
                biome,
                lakes,
                features,
                ...(structureOverrides === undefined ? {} : { structure_overrides: structureOverrides })
            }
        };
    }
    if (generator.type === 'minecraft:debug') return { type: generator.type };

    // A kind this package does not know keeps whatever `settings` it was read with.
    const settings = 'settings' in generator ? generator.settings : undefined;
    return { type: generator.type, ...(settings === undefined ? {} : { settings }) };
};

const biomeSourceJsonOf = (source: BiomeSourceDefinition): Record<string, unknown> => {
    switch (source.type) {
        case 'minecraft:multi_noise':
            if ('preset' in source) return { type: source.type, preset: source.preset };
            return {
                type: source.type,
                biomes: source.biomes.map((entry) => ({
                    biome: entry.biome,
                    parameters: climateParameterPointJsonOf(entry.parameters)
                }))
            };
        case 'minecraft:fixed':
            return { type: source.type, biome: source.biome };
        case 'minecraft:checkerboard':
            return { type: source.type, biomes: [...source.biomes], scale: source.scale };
        case 'minecraft:the_end':
            return { type: source.type };
    }
};

/** A climate box back in Java's unquantized floats, each axis as `[min, max]`. */
const climateParameterPointJsonOf = (point: ClimateParameterPoint): Record<string, unknown> => {
    const span = (parameter: ClimateParameter): [number, number] => [
        unquantizeClimateCoord(parameter.min),
        unquantizeClimateCoord(parameter.max)
    ];
    return {
        temperature: span(point.temperature),
        humidity: span(point.humidity),
        continentalness: span(point.continentalness),
        erosion: span(point.erosion),
        depth: span(point.depth),
        weirdness: span(point.weirdness),
        offset: unquantizeClimateCoord(point.offset)
    };
};

const worldGenSettingsOf = (value: unknown): WorldGenSettings | undefined => {
    if (!isRecord(value)) return undefined;

    const rawSeed = value['seed'];
    const seed = typeof rawSeed === 'string' ? rawSeed : isFiniteNumber(rawSeed) ? String(rawSeed) : undefined;
    const rawDimensions = value['dimensions'];
    if (seed === undefined || !isRecord(rawDimensions)) {
        throw new Error('worldGenSettings needs a seed string and a dimensions object');
    }

    const dimensions: Record<string, LevelStem> = {};
    for (const [id, stem] of Object.entries(rawDimensions)) {
        dimensions[id] = parseLevelStem(stem, `worldGenSettings.dimensions[${JSON.stringify(id)}]`);
    }

    return { seed, dimensions };
};

/** Validates legacy file data before migrating it and removing its source file. */
export const legacyWorldPersistenceDataOf = (value: unknown): WorldPersistenceData => {
    if (!isRecord(value)) throw new Error('Legacy world data must be an object');

    const data = worldPersistenceDataOf(value);
    if (value['spawn'] !== undefined && data.spawn === undefined) throw new Error('Legacy spawn position is invalid');
    if (value['weather'] !== undefined && data.weather === undefined) throw new Error('Legacy weather is invalid');
    if (value['gameRules'] !== undefined && !Array.isArray(value['gameRules']))
        throw new Error('Legacy game rules are invalid');
    if (Array.isArray(value['gameRules']) && (data.gameRules?.length ?? 0) !== value['gameRules'].length)
        throw new Error('Legacy game rules contain invalid entries');
    if (value['entities'] !== undefined && !Array.isArray(value['entities']))
        throw new Error('Legacy entity snapshots are invalid');
    if (Array.isArray(value['entities']) && (data.entities?.length ?? 0) !== value['entities'].length)
        throw new Error('Legacy entity snapshots contain invalid entries');

    return data;
};

/** Parses world state encoded as JSON inside provider storage. */
export const parseWorldPersistenceData = (text: string): WorldPersistenceData => {
    const parsed: unknown = JSON.parse(text);
    return worldPersistenceDataOf(parsed);
};

const spawnOf = (value: unknown): WorldPersistenceData['spawn'] | undefined => {
    if (!isRecord(value)) return undefined;
    const { x, y, z } = value;
    if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) return undefined;

    return { x, y, z };
};

const gameRulesOf = (value: unknown): WorldPersistenceData['gameRules'] | undefined => {
    if (!Array.isArray(value)) return undefined;

    const rules: NonNullable<WorldPersistenceData['gameRules']> = [];
    for (const entry of value) {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') continue;

        const state = entry[1];
        if (!Array.isArray(state) || state.length !== 2) continue;
        const [ruleValue, editable] = state;
        if (typeof editable !== 'boolean') continue;
        if (typeof ruleValue !== 'boolean' && !isFiniteNumber(ruleValue)) continue;

        rules.push([entry[0], [ruleValue, editable]]);
    }

    return rules;
};

const entitiesOf = (value: unknown): LegacyWorldEntity[] | undefined => {
    if (!Array.isArray(value)) return undefined;

    return value.flatMap((entry) => {
        if (!isRecord(entry) || typeof entry['type'] !== 'string' || !isRecord(entry['position'])) return [];

        const position = entry['position'];
        const { x, y, z } = position;
        if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) return [];

        const pitch = optionalNumber(position['pitch']);
        const yaw = optionalNumber(position['yaw']);
        const headYaw = optionalNumber(position['headYaw']);

        return [
            {
                type: entry['type'],
                position: {
                    x,
                    y,
                    z,
                    ...(pitch === undefined ? {} : { pitch }),
                    ...(yaw === undefined ? {} : { yaw }),
                    ...(headYaw === undefined ? {} : { headYaw })
                }
            }
        ];
    });
};

const optionalNumber = (value: unknown): number | undefined => (isFiniteNumber(value) ? value : undefined);

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
