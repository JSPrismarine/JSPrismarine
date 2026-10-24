import type { CompileEnvironment, DensitySampler } from './density/compile';
import { DensityFunctionCompiler } from './density/compile';
import type { DensityFunctionNode } from './density/DensityFunction';
import { SampleContext } from './density/SampleContext';
import { BLENDED_NOISE_SEED } from './noise/BlendedNoise';
import type { Noise } from './noise/GradientNoise';
import { LegacyRandomSource } from './random/LegacyRandomSource';
import type { PositionalRandomFactory, RandomSource } from './random/RandomSource';
import { XoroshiroRandomSource } from './random/XoroshiroRandomSource';
import type { NoiseGeneratorSettings } from './settings/NoiseGeneratorSettings';
import type { WorldgenData } from './WorldgenData';

/** The two nether noises Java still instantiates through the pre-1.18 octave chain. */
const LEGACY_NETHER_NOISES: ReadonlyMap<string, bigint> = new Map([
    ['minecraft:nether/temperature', 0n],
    ['minecraft:nether/vegetation', 1n]
]);

/**
 * Everything one world seed fixes: the positional randoms, the seeded noise instances and the
 * compiled density functions.
 *
 * A `RandomState` is immutable once built and safe to share across chunks. The mutable
 * per-chunk state lives in the {@link SampleContext} instances it hands out.
 */
export class RandomState {
    /** The positional factory every noise and feature stage derives its randomness from. */
    public readonly random: PositionalRandomFactory;

    private readonly compiler: DensityFunctionCompiler;
    private readonly noiseInstances = new Map<string, Noise>();
    private readonly positionalRandoms = new Map<string, PositionalRandomFactory>();

    public constructor(
        private readonly data: WorldgenData,
        /** The 64-bit world seed. */
        public readonly seed: bigint,
        /** The settings whose `legacy_random_source` flag chooses the generator. */
        public readonly settings: NoiseGeneratorSettings
    ) {
        const root: RandomSource = settings.useLegacyRandomSource
            ? new LegacyRandomSource(seed)
            : XoroshiroRandomSource.fromSeed(seed);
        this.random = root.forkPositional();

        const environment: CompileEnvironment = {
            noise: (id) => this.noise(id),
            random: (id) =>
                settings.useLegacyRandomSource && id === BLENDED_NOISE_SEED
                    ? new LegacyRandomSource(seed)
                    : this.random.fromHashOf(id),
            endIslandRandom: () => new LegacyRandomSource(seed)
        };
        this.compiler = new DensityFunctionCompiler(environment);
    }

    /**
     * Returns the seeded noise instance for an identifier, building it on first use.
     *
     * The nether's temperature and vegetation noises take the pre-1.18 path, seeded from a
     * legacy random at a fixed offset from the world seed rather than from a hashed name.
     */
    public noise(id: string): Noise {
        const cached = this.noiseInstances.get(id);
        if (cached) return cached;

        const parameters = this.data.noise(id);
        const legacyOffset = LEGACY_NETHER_NOISES.get(id);
        const created =
            legacyOffset === undefined
                ? parameters.create(this.random.fromHashOf(id))
                : parameters.createForLegacyNetherBiome(new LegacyRandomSource(this.seed + legacyOffset));
        this.noiseInstances.set(id, created);
        return created;
    }

    /** Returns the positional factory keyed by a name, such as `minecraft:aquifer`. */
    public randomFactory(name: string): PositionalRandomFactory {
        const cached = this.positionalRandoms.get(name);
        if (cached) return cached;
        const created = this.random.fromHashOf(name).forkPositional();
        this.positionalRandoms.set(name, created);
        return created;
    }

    /** Compiles a density function tree against this seed, reusing earlier compilations. */
    public sampler(node: DensityFunctionNode): DensitySampler {
        return this.compiler.compile(node);
    }

    /** Creates the per-chunk mutable state a sampler reads, with every memo slot empty. */
    public createContext(): SampleContext {
        return new SampleContext();
    }

    /**
     * Samples one density function at one position with no caching between calls.
     *
     * This is the debug path Java exposes as `sampleBlockValueUncached`; chunk generation goes
     * through {@link import('./chunk/ChunkSampler').ChunkSampler} instead.
     */
    public sampleUncached(node: DensityFunctionNode, x: number, y: number, z: number): number {
        return this.sampler(node)(new SampleContext(), x, y, z);
    }
}
