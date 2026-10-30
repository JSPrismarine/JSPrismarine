import { normalizeIdentifier } from '../identifier';
import { asArray, asObject, boolean, inRange, integer, optional, stringOrList } from './json';

/** One layer of a superflat world, read bottom up from the dimension's `min_y`. */
export interface FlatLayer {
    /** The Java block identifier the layer is made of. */
    readonly block: string;
    /** How many blocks thick the layer is, 0 to 4064. */
    readonly height: number;
}

/**
 * The `settings` object of a `minecraft:flat` generator, which is also the `settings` of a
 * `worldgen/flat_level_generator_preset` document.
 */
export interface FlatGeneratorSettings {
    /** The layers, bottom up. May be empty. */
    readonly layers: readonly FlatLayer[];
    /** The single biome the whole world has. Defaults to `minecraft:plains`. */
    readonly biome: string;
    /** Whether lava lakes generate. Defaults to false. */
    readonly lakes: boolean;
    /** Whether the biome's placed features generate. Defaults to false. */
    readonly features: boolean;
    /**
     * The structure sets that place structures, as one id or tag or a list of ids. Absent means
     * every registered structure set, as in Java.
     */
    readonly structureOverrides?: string | readonly string[];
}

/** The biome Java uses when a flat settings object leaves `biome` out. */
const DEFAULT_FLAT_BIOME = 'minecraft:plains';
const LAYER_HEIGHT_MAX = 4064;

/**
 * Reads the `settings` object of a `minecraft:flat` generator.
 *
 * Java spells a layer's thickness `height`; this server's config calls the same number `size`,
 * which is why the parsed field keeps Java's name.
 *
 * @param path - Where the document came from, for error messages.
 * @throws When `layers` is missing or a layer lacks a block or a valid height.
 */
export const parseFlatGeneratorSettings = (json: unknown, path = '<flat_settings>'): FlatGeneratorSettings => {
    const raw = asObject(json, path);

    const layers = asArray(raw['layers'], `${path}.layers`).map((entry, index): FlatLayer => {
        const layerPath = `${path}.layers[${index}]`;
        const layer = asObject(entry, layerPath);
        return {
            block: normalizeIdentifier(layer['block']),
            height: inRange(integer(layer['height'], `${layerPath}.height`), `${layerPath}.height`, 0, LAYER_HEIGHT_MAX)
        };
    });

    const structureOverrides = optional(raw['structure_overrides'], undefined, (value) =>
        stringOrList(value, `${path}.structure_overrides`)
    );

    return {
        layers,
        biome: optional(raw['biome'], DEFAULT_FLAT_BIOME, normalizeIdentifier),
        lakes: optional(raw['lakes'], false, (value) => boolean(value, `${path}.lakes`)),
        features: optional(raw['features'], false, (value) => boolean(value, `${path}.features`)),
        ...(structureOverrides === undefined ? {} : { structureOverrides })
    };
};
