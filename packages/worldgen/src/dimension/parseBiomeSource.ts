import type { BiomeSource } from '../biome/BiomeSource';
import {
    CheckerboardBiomeSource,
    FixedBiomeSource,
    MultiNoiseBiomeSource,
    TheEndBiomeSource
} from '../biome/BiomeSource';
import type { ClimateEntry, ClimateParameterPoint } from '../biome/Climate';
import { ClimateParameterList, parseClimateParameterPoint } from '../biome/Climate';
import { normalizeIdentifier } from '../identifier';
import { asArray, asObject, inRange, integer, optional } from './json';

/** One inline entry of a `multi_noise` biome source's `biomes` list. */
export interface MultiNoiseBiomeEntry {
    /** The biome the climate box belongs to. */
    readonly biome: string;
    /** The climate box. */
    readonly parameters: ClimateParameterPoint;
}

/**
 * The `biome_source` object of a `minecraft:noise` generator, one variant per Java biome
 * source class.
 *
 * A `multi_noise` source either names a `worldgen/multi_noise_biome_source_parameter_list`
 * through `preset` or carries its climate boxes inline under `biomes`.
 */
export type BiomeSourceDefinition =
    | { readonly type: 'minecraft:multi_noise'; readonly preset: string }
    | { readonly type: 'minecraft:multi_noise'; readonly biomes: readonly MultiNoiseBiomeEntry[] }
    | { readonly type: 'minecraft:fixed'; readonly biome: string }
    | { readonly type: 'minecraft:checkerboard'; readonly biomes: readonly string[]; readonly scale: number }
    | { readonly type: 'minecraft:the_end' };

/** Java's default for a checkerboard's `scale`. */
const DEFAULT_CHECKERBOARD_SCALE = 2;
const CHECKERBOARD_SCALE_MAX = 62;

const biomeList = (value: unknown, path: string): readonly string[] => {
    if (typeof value === 'string') {
        if (value.startsWith('#')) {
            throw new TypeError(
                `${path}: biome tags are not resolved here, list the biomes instead, got ${JSON.stringify(value)}`
            );
        }
        return [normalizeIdentifier(value)];
    }
    return asArray(value, path).map((entry) => normalizeIdentifier(entry));
};

/**
 * Reads the `biome_source` JSON of a `minecraft:noise` generator into a definition.
 *
 * @param path - Where the document came from, for error messages.
 * @throws When `type` is not one of the four Java biome sources, or a variant lacks its field.
 */
export const parseBiomeSourceDefinition = (json: unknown, path = '<biome_source>'): BiomeSourceDefinition => {
    const raw = asObject(json, path);
    const type = normalizeIdentifier(raw['type']);
    switch (type) {
        case 'minecraft:multi_noise': {
            if (raw['preset'] !== undefined) return { type, preset: normalizeIdentifier(raw['preset']) };
            const biomes = asArray(raw['biomes'], `${path}.biomes`).map((entry, index): MultiNoiseBiomeEntry => {
                const entryPath = `${path}.biomes[${index}]`;
                const fields = asObject(entry, entryPath);
                return {
                    biome: normalizeIdentifier(fields['biome']),
                    parameters: parseClimateParameterPoint(fields['parameters'], `${entryPath}.parameters`)
                };
            });
            return { type, biomes };
        }
        case 'minecraft:fixed':
            return { type, biome: normalizeIdentifier(raw['biome']) };
        case 'minecraft:checkerboard':
            return {
                type,
                biomes: biomeList(raw['biomes'], `${path}.biomes`),
                scale: optional(raw['scale'], DEFAULT_CHECKERBOARD_SCALE, (value) =>
                    inRange(integer(value, `${path}.scale`), `${path}.scale`, 0, CHECKERBOARD_SCALE_MAX)
                )
            };
        case 'minecraft:the_end':
            return { type };
        default:
            throw new TypeError(`${path}: unknown biome source type ${JSON.stringify(type)}`);
    }
};

/**
 * Builds the biome source a definition describes.
 *
 * A `multi_noise` `preset` resolves through `parameterLists`, keyed by the
 * `multi_noise_biome_source_parameter_list` id. The datapack's own two list files are stubs
 * that only name the preset again, so callers pass the data generator's
 * `reports/biome_parameters` documents, which {@link MultiNoiseBiomeSource.fromJson} reads.
 *
 * @param parameterLists - Raw parameter list documents, keyed by identifier.
 * @param path - Where the definition came from, for error messages.
 * @throws When a preset is not in `parameterLists`, or the type is not a Java biome source.
 */
export const parseBiomeSource = (
    definition: BiomeSourceDefinition,
    parameterLists: ReadonlyMap<string, unknown>,
    path = '<biome_source>'
): BiomeSource => {
    switch (definition.type) {
        case 'minecraft:multi_noise': {
            if ('preset' in definition) {
                const list = parameterLists.get(definition.preset);
                if (list === undefined) {
                    throw new TypeError(
                        `${path}.preset: no multi_noise_biome_source_parameter_list named ${JSON.stringify(definition.preset)}`
                    );
                }
                return MultiNoiseBiomeSource.fromJson(list, definition.preset);
            }
            const entries: ClimateEntry<string>[] = definition.biomes.map((entry) => ({
                point: entry.parameters,
                value: entry.biome
            }));
            return new MultiNoiseBiomeSource(new ClimateParameterList(entries));
        }
        case 'minecraft:fixed':
            return new FixedBiomeSource(definition.biome);
        case 'minecraft:checkerboard':
            return new CheckerboardBiomeSource(definition.biomes, definition.scale);
        case 'minecraft:the_end':
            return new TheEndBiomeSource();
        default: {
            // A definition read from untyped JSON can carry a type the union does not list.
            const unknown: { readonly type: string } = definition;
            throw new TypeError(`${path}: unknown biome source type ${JSON.stringify(unknown.type)}`);
        }
    }
};
