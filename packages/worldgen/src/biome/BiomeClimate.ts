import { f32 } from '../math';
import { NoiseStackBuilder } from '../noise/NoiseStack';
import { SimplexNoise } from '../noise/SimplexNoise';
import { LegacyRandomSource } from '../random/LegacyRandomSource';

/** How a biome bends its base temperature with position. */
export type TemperatureModifier = 'none' | 'frozen';

/** The two climate fields of a `worldgen/biome` document that the surface pass reads. */
export interface BiomeClimate {
    /** The biome's `temperature` field. */
    readonly baseTemperature: number;
    /** The biome's `temperature_modifier` field. */
    readonly temperatureModifier: TemperatureModifier;
}

/** Returns the climate of a biome identifier. */
export type BiomeClimateLookup = (biome: string) => BiomeClimate;

/**
 * Reads the climate fields out of a `worldgen/biome` document.
 *
 * @throws When `temperature` is missing or `temperature_modifier` names something other than
 *   `none` or `frozen`.
 */
export const parseBiomeClimate = (source: unknown, path = '<biome>'): BiomeClimate => {
    if (typeof source !== 'object' || source === null || Array.isArray(source)) {
        throw new TypeError(`${path}: expected an object, got ${JSON.stringify(source)}`);
    }
    // A parsed JSON document is `unknown`; both fields are checked here.
    const raw = source as Record<string, unknown>;
    const temperature = raw['temperature'];
    if (typeof temperature !== 'number' || !Number.isFinite(temperature)) {
        throw new TypeError(`${path}.temperature: expected a finite number, got ${JSON.stringify(temperature)}`);
    }
    const modifier = raw['temperature_modifier'] ?? 'none';
    if (modifier !== 'none' && modifier !== 'frozen') {
        throw new TypeError(
            `${path}.temperature_modifier: expected "none" or "frozen", got ${JSON.stringify(modifier)}`
        );
    }
    return { baseTemperature: f32(temperature), temperatureModifier: modifier };
};

// The three noises below are seeded from fixed numbers rather than from the world seed, so
// every world shares them. Java builds them as static fields of `Biome`.
const temperatureNoise = new SimplexNoise(new LegacyRandomSource(1234n), true);
const biomeInfoNoise = new SimplexNoise(new LegacyRandomSource(2345n), true);
const frozenTemperatureNoise = (() => {
    const random = new LegacyRandomSource(3456n);
    return new NoiseStackBuilder()
        .add(new SimplexNoise(random, true), 1, f32(0.14285715))
        .add(new SimplexNoise(random, true), 0.5, f32(0.2857143))
        .add(new SimplexNoise(random, true), 0.25, f32(0.5714286))
        .build();
})();

/** Applies a biome's temperature modifier at one position. */
const modifyTemperature = (climate: BiomeClimate, x: number, z: number): number => {
    if (climate.temperatureModifier === 'none') return climate.baseTemperature;
    const largeVariation = f32(frozenTemperatureNoise.get2(x * 0.05, z * 0.05) * 7);
    const edgeVariation = biomeInfoNoise.get2(x * 0.2, z * 0.2);
    if (largeVariation + edgeVariation < 0.3) {
        if (biomeInfoNoise.get2(x * 0.09, z * 0.09) < 0.8) return f32(0.2);
    }
    return climate.baseTemperature;
};

/**
 * The temperature of a biome at one block position.
 *
 * Above sea level plus 17 the value falls with height and with a fixed noise field, which is
 * what puts a snow line partway up a mountain inside one biome.
 */
export const biomeTemperature = (climate: BiomeClimate, x: number, y: number, z: number, seaLevel: number): number => {
    const adjusted = modifyTemperature(climate, x, z);
    const snowLevel = seaLevel + 17;
    if (y <= snowLevel) return adjusted;
    const variation = f32(temperatureNoise.get2(f32(x / 8), f32(z / 8)) * 8);
    return f32(adjusted - f32(f32(f32(f32(variation + y) - snowLevel) * f32(0.05)) / 40));
};

/** Whether precipitation at a position falls as snow, which is Java's `coldEnoughToSnow`. */
export const coldEnoughToSnow = (climate: BiomeClimate, x: number, y: number, z: number, seaLevel: number): boolean =>
    biomeTemperature(climate, x, y, z, seaLevel) < f32(0.15);

/** Whether a frozen ocean's icebergs sit two blocks lower here than their noise asks for. */
export const shouldMeltFrozenOceanIcebergSlightly = (
    climate: BiomeClimate,
    x: number,
    y: number,
    z: number,
    seaLevel: number
): boolean => biomeTemperature(climate, x, y, z, seaLevel) > f32(0.1);
