import type { DensityFunctionNode } from './density/DensityFunction';
import { parseDensityFunction } from './density/parse';
import { normalizeIdentifier } from './identifier';
import { NormalNoise, parseNoiseParameters } from './noise/NormalNoise';
import type { NoiseGeneratorSettings } from './settings/NoiseGeneratorSettings';
import { parseNoiseGeneratorSettings } from './settings/NoiseGeneratorSettings';

/** The raw JSON documents of the three worldgen registries this package reads. */
export interface WorldgenDataSource {
    /** `worldgen/density_function`, keyed by identifier. */
    readonly densityFunctions: ReadonlyMap<string, unknown>;
    /** `worldgen/noise`, keyed by identifier. */
    readonly noises: ReadonlyMap<string, unknown>;
    /** `worldgen/noise_settings`, keyed by identifier. */
    readonly noiseSettings: ReadonlyMap<string, unknown>;
}

/**
 * The parsed worldgen registries for one data pack stack.
 *
 * Parsing is lazy and memoized per identifier, so a reference reached from twenty places
 * yields the same tree object. The compiler keys its cache slots off that identity, which is
 * how a shared subtree such as `minecraft:shift_x` is evaluated once per position.
 */
export class WorldgenData {
    private readonly densityFunctionCache = new Map<string, DensityFunctionNode>();
    private readonly noiseCache = new Map<string, NormalNoise>();
    private readonly settingsCache = new Map<string, NoiseGeneratorSettings>();
    private readonly resolving = new Set<string>();

    public constructor(private readonly source: WorldgenDataSource) {}

    /** The identifiers of every density function in the stack. */
    public get densityFunctionIds(): string[] {
        return [...this.source.densityFunctions.keys()];
    }

    /** The identifiers of every noise in the stack. */
    public get noiseIds(): string[] {
        return [...this.source.noises.keys()];
    }

    /** The identifiers of every noise settings document in the stack. */
    public get noiseSettingsIds(): string[] {
        return [...this.source.noiseSettings.keys()];
    }

    /**
     * Parses a density function, following its references.
     *
     * @throws When the identifier is missing from the stack, or when the references form a
     *   cycle, which Java's lazy holders would turn into a stack overflow at sample time.
     */
    public densityFunction(reference: string): DensityFunctionNode {
        const id = normalizeIdentifier(reference);
        const cached = this.densityFunctionCache.get(id);
        if (cached) return cached;
        if (this.resolving.has(id)) {
            throw new RangeError(
                `Density function ${id} references itself through ${[...this.resolving].join(' -> ')}`
            );
        }

        const raw = this.source.densityFunctions.get(id);
        if (raw === undefined) throw new RangeError(`No density function is registered as ${id}`);

        this.resolving.add(id);
        try {
            const parsed = parseDensityFunction(raw, (child) => this.densityFunction(child), id);
            this.densityFunctionCache.set(id, parsed);
            return parsed;
        } finally {
            this.resolving.delete(id);
        }
    }

    /**
     * Parses a noise parameter document.
     *
     * @throws When the identifier is missing from the stack.
     */
    public noise(reference: string): NormalNoise {
        const id = normalizeIdentifier(reference);
        const cached = this.noiseCache.get(id);
        if (cached) return cached;
        const raw = this.source.noises.get(id);
        if (raw === undefined) throw new RangeError(`No noise is registered as ${id}`);
        const parsed = new NormalNoise(parseNoiseParameters(raw));
        this.noiseCache.set(id, parsed);
        return parsed;
    }

    /**
     * Parses a noise settings document and every density function it reaches.
     *
     * @throws When the identifier is missing from the stack.
     */
    public settings(reference: string): NoiseGeneratorSettings {
        const id = normalizeIdentifier(reference);
        const cached = this.settingsCache.get(id);
        if (cached) return cached;
        const raw = this.source.noiseSettings.get(id);
        if (raw === undefined) throw new RangeError(`No noise settings are registered as ${id}`);
        const parsed = parseNoiseGeneratorSettings(raw, (child) => this.densityFunction(child), id);
        this.settingsCache.set(id, parsed);
        return parsed;
    }
}
