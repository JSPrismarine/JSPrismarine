import type {
    CompileEnvironment,
    DensityFunctionCompilerOptions,
    DensitySampler,
    DensityVolumeEvaluator,
    InterpolationCellSize
} from './density/compile';
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
        public readonly settings: NoiseGeneratorSettings,
        /** Optional compiler experiment flags, which leave the closure implementation as default. */
        compilerOptions: DensityFunctionCompilerOptions = {}
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
        this.compiler = new DensityFunctionCompiler(environment, compilerOptions);
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

    /**
     * Compiles an opt-in volume evaluator for one density function tree.
     *
     * The plan is cached by this state, but each returned evaluator owns a separate mutable
     * workspace and must not serve overlapping calls.
     */
    public volumeSampler(node: DensityFunctionNode): DensityVolumeEvaluator {
        return this.compiler.compileVolume(node);
    }

    /** Whether a density tree's proven input axes exclude y. */
    public isYIndependent(node: DensityFunctionNode): boolean {
        return this.compiler.isYIndependent(node);
    }

    /**
     * The cell the `interpolated` nodes compiled so far hold their corners still across, or
     * undefined when none of them has been compiled yet.
     *
     * This is a hint for a caller choosing a visiting order, not part of any result: a sample
     * answers the same whatever order it is asked in.
     *
     * @deprecated It covers every tree compiled on this state, so compiling another function
     *   first, such as the surface pass's `chunk_surface_level`, makes it smaller. Pass the tree
     *   being walked to {@link RandomState.interpolationCellSizeOf}.
     */
    public get interpolationCellSize(): InterpolationCellSize | undefined {
        return this.compiler.interpolationCellSize;
    }

    /**
     * The cell the `interpolated` nodes reachable from one tree hold their corners still
     * across, or undefined when it holds none.
     *
     * A hint for a caller choosing a visiting order, like {@link RandomState.interpolationCellSize},
     * but fixed by the tree alone, whatever else this state has compiled.
     */
    public interpolationCellSizeOf(node: DensityFunctionNode): InterpolationCellSize | undefined {
        return this.compiler.interpolationCellSizeOf(node);
    }

    /** @internal Returns an exact maximum from the reusable buffer of one interpolation cell. */
    public interpolatedCellMaximum(
        node: DensityFunctionNode,
        context: SampleContext,
        x: number,
        y: number,
        z: number
    ): number | undefined {
        return this.compiler.interpolatedCellMaximum(node, context, x, y, z);
    }

    /** How many density samplers the optional code generator emitted. */
    public get generatedFunctionCount(): number {
        return this.compiler.generatedFunctionCount;
    }

    /** Source characters emitted by the optional density code generator. */
    public get generatedFunctionBytes(): number {
        return this.compiler.generatedFunctionBytes;
    }

    /** Density nodes that remained on the closure compiler. */
    public get closureFallbackCount(): number {
        return this.compiler.closureFallbackCount;
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
