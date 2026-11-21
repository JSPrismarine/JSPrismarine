import type {
    CompileEnvironment,
    DensityBoundSampler,
    DensityFunctionCompilerOptions,
    DensitySampler,
    InterpolationCellSize
} from './density/compile';
import type { CellProgram } from './density/cellProgram';
import { DensityFunctionCompiler } from './density/compile';
import type { DensityFunctionNode } from './density/DensityFunction';
import { SampleContext } from './density/SampleContext';
import { BLENDED_NOISE_SEED } from './noise/BlendedNoise';
import type { Noise } from './noise/GradientNoise';
import { nativeWorldgen, withNativeStack } from './noise/nativeNoise';
import { LegacyRandomSource } from './random/LegacyRandomSource';
import type { PositionalRandomFactory, RandomSource } from './random/RandomSource';
import { XoroshiroRandomSource } from './random/XoroshiroRandomSource';
import type { NoiseGeneratorSettings } from './settings/NoiseGeneratorSettings';
import type { WorldgenData } from './WorldgenData';
import type { NativeWorldgen } from '@jsprismarine/native-worldgen';

/** The two nether noises Java still instantiates through the pre-1.18 octave chain. */
const LEGACY_NETHER_NOISES: ReadonlyMap<string, bigint> = new Map([
    ['minecraft:nether/temperature', 0n],
    ['minecraft:nether/vegetation', 1n]
]);

/** How a {@link RandomState} compiles its density functions and samples its noises. */
export interface RandomStateOptions extends DensityFunctionCompilerOptions {
    /**
     * Whether `worldgen/noise` stacks run in `@jsprismarine/native-worldgen`'s C kernel, which
     * gives the same bits. On by default whenever the library loads on this thread; false keeps
     * every noise in TypeScript, as the parity suite's TypeScript path does.
     */
    readonly nativeNoise?: boolean;
}

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
    /** The native library the noises run in, or undefined for TypeScript only. */
    private readonly nativeLibrary: NativeWorldgen | undefined;

    public constructor(
        private readonly data: WorldgenData,
        /** The 64-bit world seed. */
        public readonly seed: bigint,
        /** The settings whose `legacy_random_source` flag chooses the generator. */
        public readonly settings: NoiseGeneratorSettings,
        /** Compiler experiment flags, which leave the closure implementation as default, and the noise path. */
        options: RandomStateOptions = {}
    ) {
        this.nativeLibrary = options.nativeNoise === false ? undefined : nativeWorldgen();
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
            endIslandRandom: () => new LegacyRandomSource(seed),
            stack: (noise) => (this.nativeLibrary === undefined ? noise : withNativeStack(this.nativeLibrary, noise))
        };
        this.compiler = new DensityFunctionCompiler(environment, options);
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
        if (legacyOffset === undefined) {
            const created = parameters.create(this.random.fromHashOf(id));
            const hashed = this.nativeLibrary === undefined ? created : withNativeStack(this.nativeLibrary, created);
            this.noiseInstances.set(id, hashed);
            return hashed;
        }
        const created = parameters.createForLegacyNetherBiome(new LegacyRandomSource(this.seed + legacyOffset));
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
     * Compiles a density function tree into a program that evaluates it over a whole
     * interpolation cell at a time, bit for bit as the terrain fill's per-block samples would.
     */
    public cellProgram(node: DensityFunctionNode, cell: InterpolationCellSize): CellProgram {
        return this.compiler.cellProgram(node, cell);
    }

    /**
     * Compiles a function that bounds a density function tree's samples over a box of blocks;
     * see {@link DensityFunctionCompiler.boundSampler} for the box it needs.
     */
    public boundSampler(node: DensityFunctionNode): DensityBoundSampler {
        return this.compiler.boundSampler(node);
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
     * through {@link ChunkSampler} instead.
     */
    public sampleUncached(node: DensityFunctionNode, x: number, y: number, z: number): number {
        return this.sampler(node)(new SampleContext(), x, y, z);
    }
}
