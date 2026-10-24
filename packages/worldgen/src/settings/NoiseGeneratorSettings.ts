import { normalizeIdentifier } from '../identifier';
import type { DensityFunctionNode } from '../density/DensityFunction';
import type { DensityFunctionResolver } from '../density/parse';
import { parseDensityFunction } from '../density/parse';

/**
 * The eight named slots of a 26.3 noise router.
 *
 * 1.21 had fifteen. The aquifer entries (`barrier`, `fluid_level_floodedness`,
 * `fluid_level_spread`, `lava`) moved into {@link AquiferConfig}, the ore vein entries
 * (`vein_toggle`, `vein_ridged`, `vein_gap`) moved into the `minecraft:ore_vein` material
 * rule, `initial_density_without_jaggedness` became `chunk_surface_level`, and the climate
 * slots stayed where they were.
 */
export interface NoiseRouter {
    /** Climate temperature, sampled per biome cell. */
    readonly temperature: DensityFunctionNode;
    /** Climate humidity, which Java still names vegetation. */
    readonly vegetation: DensityFunctionNode;
    /** Continentalness, the land-versus-ocean axis. */
    readonly continents: DensityFunctionNode;
    /** Erosion, the flatness axis. */
    readonly erosion: DensityFunctionNode;
    /** Depth, how far below the surface a position is. */
    readonly depth: DensityFunctionNode;
    /** Weirdness folded into ridges, the peaks-and-valleys axis. */
    readonly ridges: DensityFunctionNode;
    /** The preliminary surface height used before the surface pass runs. */
    readonly chunkSurfaceLevel: DensityFunctionNode;
    /** The density that decides whether a block is solid. */
    readonly finalDensity: DensityFunctionNode;
}

/** The six density functions that drive aquifer placement. */
export interface AquiferConfig {
    /** Noise that thickens the stone barrier between two aquifers. */
    readonly barrierNoise: DensityFunctionNode;
    /** Noise that decides how full an aquifer cell is. */
    readonly fluidLevelFloodednessNoise: DensityFunctionNode;
    /** Noise that offsets a partially flooded aquifer's surface. */
    readonly fluidLevelSpreadNoise: DensityFunctionNode;
    /** Noise that turns an aquifer into lava. */
    readonly lavaNoise: DensityFunctionNode;
    /** Positive values switch aquifers off, which keeps them out of the deep dark. */
    readonly exclusion: DensityFunctionNode;
    /** The preliminary surface height aquifer cells measure their depth against. */
    readonly surfaceLevel: DensityFunctionNode;
}

/** The vertical extent a dimension generates over. */
export interface NoiseSettings {
    /** The lowest block y, a multiple of 16. */
    readonly minY: number;
    /** The number of blocks above `minY`, a multiple of 16. */
    readonly height: number;
}

/** One `worldgen/noise_settings` document. */
export interface NoiseGeneratorSettings {
    /** The vertical extent. */
    readonly noiseSettings: NoiseSettings;
    /** The Java block state identifier used where the density is solid. */
    readonly defaultBlock: string;
    /** The Java block state identifier used for the dimension's sea. */
    readonly defaultFluid: string;
    /** The eight router slots. */
    readonly noiseRouter: NoiseRouter;
    /** The `material_rule` reference the surface pass resolves. */
    readonly materialRule: string;
    /** The y level the global fluid picker fills to. */
    readonly seaLevel: number;
    /** Whether the generator suppresses the first mob spawn pass. */
    readonly disableMobGeneration: boolean;
    /** The aquifer functions, absent in dimensions that generate no aquifers. */
    readonly aquifers: AquiferConfig | undefined;
    /** Whether the world seeds its randoms with the 48-bit legacy generator. */
    readonly useLegacyRandomSource: boolean;
}

const asObject = (value: unknown, path: string): Record<string, unknown> => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new TypeError(`${path}: expected an object, got ${JSON.stringify(value)}`);
    }
    // A parsed JSON document is `unknown`; every field read below is checked.
    return value as Record<string, unknown>;
};

const integer = (value: unknown, path: string): number => {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new TypeError(`${path}: expected an integer, got ${JSON.stringify(value)}`);
    }
    return value;
};

const boolean = (value: unknown, path: string): boolean => {
    if (typeof value !== 'boolean') throw new TypeError(`${path}: expected a boolean, got ${JSON.stringify(value)}`);
    return value;
};

const blockState = (value: unknown, path: string): string => {
    if (typeof value === 'string') return normalizeIdentifier(value);
    const raw = asObject(value, path);
    return normalizeIdentifier(raw['Name'] ?? raw['name']);
};

/**
 * Reads one `worldgen/noise_settings` JSON document.
 *
 * @param resolve - Looks up a referenced density function by identifier.
 * @throws When a required field is missing or has the wrong shape. The router's eight slots,
 *   `noise`, `sea_level`, `default_block`, `default_fluid`, `material_rule`,
 *   `disable_mob_generation` and `legacy_random_source` are all required, as in Java.
 */
export const parseNoiseGeneratorSettings = (
    source: unknown,
    resolve: DensityFunctionResolver,
    path = '<noise_settings>'
): NoiseGeneratorSettings => {
    const raw = asObject(source, path);
    const noise = asObject(raw['noise'], `${path}.noise`);
    const minY = integer(noise['min_y'], `${path}.noise.min_y`);
    const height = integer(noise['height'], `${path}.noise.height`);
    if (minY % 16 !== 0) throw new RangeError(`${path}.noise.min_y has to be a multiple of 16`);
    if (height % 16 !== 0) throw new RangeError(`${path}.noise.height has to be a multiple of 16`);

    const routerSource = asObject(raw['noise_router'], `${path}.noise_router`);
    const parseSlot = (name: string): DensityFunctionNode =>
        parseDensityFunction(routerSource[name], resolve, `${path}.noise_router.${name}`);

    const aquiferSource = raw['aquifers'];
    const aquifers =
        aquiferSource === undefined
            ? undefined
            : (() => {
                  const fields = asObject(aquiferSource, `${path}.aquifers`);
                  const parseAquifer = (name: string): DensityFunctionNode =>
                      parseDensityFunction(fields[name], resolve, `${path}.aquifers.${name}`);
                  return {
                      barrierNoise: parseAquifer('barrier'),
                      fluidLevelFloodednessNoise: parseAquifer('fluid_level_floodedness'),
                      fluidLevelSpreadNoise: parseAquifer('fluid_level_spread'),
                      lavaNoise: parseAquifer('lava'),
                      exclusion: parseAquifer('exclusion'),
                      surfaceLevel: parseAquifer('surface_level')
                  } satisfies AquiferConfig;
              })();

    return {
        noiseSettings: { minY, height },
        defaultBlock: blockState(raw['default_block'], `${path}.default_block`),
        defaultFluid: blockState(raw['default_fluid'], `${path}.default_fluid`),
        noiseRouter: {
            temperature: parseSlot('temperature'),
            vegetation: parseSlot('vegetation'),
            continents: parseSlot('continents'),
            erosion: parseSlot('erosion'),
            depth: parseSlot('depth'),
            ridges: parseSlot('ridges'),
            chunkSurfaceLevel: parseSlot('chunk_surface_level'),
            finalDensity: parseSlot('final_density')
        },
        materialRule: normalizeIdentifier(raw['material_rule']),
        seaLevel: integer(raw['sea_level'], `${path}.sea_level`),
        disableMobGeneration: boolean(raw['disable_mob_generation'], `${path}.disable_mob_generation`),
        aquifers,
        useLegacyRandomSource: boolean(raw['legacy_random_source'], `${path}.legacy_random_source`)
    };
};
