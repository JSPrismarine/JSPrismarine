import { normalizeIdentifier } from '../identifier';
import type { FlatGeneratorSettings } from './FlatGeneratorSettings';
import { parseFlatGeneratorSettings } from './FlatGeneratorSettings';
import { asObject } from './json';
import type { BiomeSourceDefinition } from './parseBiomeSource';
import { parseBiomeSourceDefinition } from './parseBiomeSource';

/**
 * A `minecraft:noise` generator: a `worldgen/noise_settings` id or inline document and a biome
 * source.
 *
 * An inline document stays as parsed JSON because reading it needs a density function
 * resolver; `parseNoiseGeneratorSettings` takes it from here. The vanilla presets only ever
 * reference settings by id.
 */
export interface NoiseGeneratorDefinition {
    readonly type: 'minecraft:noise';
    /** The `worldgen/noise_settings` id, or the inline document. */
    readonly settings: string | Readonly<Record<string, unknown>>;
    /** The biome layout. */
    readonly biomeSource: BiomeSourceDefinition;
}

/** A `minecraft:flat` generator and its layers. */
export interface FlatGeneratorDefinition {
    readonly type: 'minecraft:flat';
    /** The layers, biome and feature flags. */
    readonly settings: FlatGeneratorSettings;
}

/** The `minecraft:debug` generator, which has no fields. */
export interface DebugGeneratorDefinition {
    readonly type: 'minecraft:debug';
}

/** A generator kind this package does not know. Its `settings` stay as JSON for a factory to read. */
export interface UnknownGeneratorDefinition {
    readonly type: string;
    /** Whatever the document carried under `settings`, or undefined. */
    readonly settings: unknown;
}

/** The `generator` object of a level stem, a tagged union on `type`. */
export type GeneratorDefinition =
    NoiseGeneratorDefinition | FlatGeneratorDefinition | DebugGeneratorDefinition | UnknownGeneratorDefinition;

/** One dimension of a world: a `dimension_type` id bound to a generator. */
export interface LevelStem {
    /** The `dimension_type` id. */
    readonly type: string;
    /** The generator that fills the dimension's chunks. */
    readonly generator: GeneratorDefinition;
}

/**
 * Reads the `generator` object of a level stem.
 *
 * @param path - Where the document came from, for error messages.
 * @throws When `type` is missing, or a known kind lacks its fields.
 */
export const parseGeneratorDefinition = (json: unknown, path = '<generator>'): GeneratorDefinition => {
    const raw = asObject(json, path);
    const type = normalizeIdentifier(raw['type']);
    switch (type) {
        case 'minecraft:noise': {
            const settings = raw['settings'];
            return {
                type,
                settings:
                    typeof settings === 'string'
                        ? normalizeIdentifier(settings)
                        : asObject(settings, `${path}.settings`),
                biomeSource: parseBiomeSourceDefinition(raw['biome_source'], `${path}.biome_source`)
            };
        }
        case 'minecraft:flat':
            return { type, settings: parseFlatGeneratorSettings(raw['settings'], `${path}.settings`) };
        case 'minecraft:debug':
            return { type };
        default:
            return { type, settings: raw['settings'] };
    }
};

/**
 * Reads one level stem, as found under `dimensions` in a `worldgen/world_preset` document or
 * on its own at `data/<namespace>/dimension/<name>.json`.
 *
 * @param path - Where the document came from, for error messages.
 * @throws When `type` or `generator` is missing or malformed.
 */
export const parseLevelStem = (json: unknown, path = '<dimension>'): LevelStem => {
    const raw = asObject(json, path);
    return {
        type: normalizeIdentifier(raw['type']),
        generator: parseGeneratorDefinition(raw['generator'], `${path}.generator`)
    };
};
