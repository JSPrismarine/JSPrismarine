/**
 * The generator that runs Java Edition's published world generation data.
 *
 * It composes five packages, in Java's own order: `@jsprismarine/worldgen` for the density
 * functions, the aquifers, the biome source, the carvers and the surface rules, then
 * `@jsprismarine/features` for the decoration pass. Everything those produce is a Java block
 * state, so the whole chunk is built in a {@link GenerationRegion} and translated to Bedrock
 * runtime ids once, at the end.
 *
 * The registries come from two fetched directories; see
 * [`javaWorldgenData.ts`](javaWorldgenData.ts). A server with neither cannot run this
 * generator, and says so rather than producing a world that is quietly not Java's.
 */
import type { BlockOracle, PlacedFeature, ScheduledFeature } from '@jsprismarine/features';
import { DECORATION_STEPS, FeatureLoader, decorateChunk } from '@jsprismarine/features';
import type { BiomeClimate, CarverConfig, MaterialRuleNode, NoiseGeneratorSettings } from '@jsprismarine/worldgen';
import {
    BiomeManager,
    CarvingMask,
    ChunkSampler,
    MaterialRuleData,
    MultiNoiseBiomeSource,
    RandomState,
    SurfaceSystem,
    WorldgenData,
    carveChunk,
    createClimateSampler,
    parseBiomeClimate,
    parseCarver
} from '@jsprismarine/worldgen';

import { UNKNOWN_RUNTIME_ID } from '../../../block/state/BlockRuntimeIds';
import Chunk from '../../chunk/Chunk';
import { Dimensions, subChunkCount } from '../../Dimension';
import type { DimensionDefinition } from '../../Dimension';
import type { Generator } from '../../Generator';
import { GenerationRegion } from './GenerationRegion';
import { createJavaBlockOracle } from './javaBlockOracle';
import { createBlockEntity, createEntitySpawn } from './javaGeneratedContent';
import type { TemplateSource } from './javaTemplatePlacement';
import type { JavaWorldgenRegistries } from './javaWorldgenData';
import { bedrockBiomeIdOf, JavaStateTranslator } from './javaTranslation';

/** How a {@link DataDrivenGenerator} is built. */
export interface DataDrivenGeneratorOptions {
    /** The Java registries, already read off disk. */
    readonly registries: JavaWorldgenRegistries;
    /** The dimension being generated. Defaults to the Overworld. */
    readonly dimension?: DimensionDefinition;
    /** The `worldgen/noise_settings` identifier. Defaults to `minecraft:overworld`. */
    readonly noiseSettings?: string;
    /** The `reports/biome_parameters` identifier. Defaults to `minecraft:overworld`. */
    readonly biomeParameters?: string;
    /** Whether to run the decoration pass. On by default; a terrain test turns it off. */
    readonly decorate?: boolean;
    /** Whether to run the carvers. On by default. */
    readonly carve?: boolean;
    /**
     * Where the structure templates `template` and `fossil` stamp come from.
     *
     * Absent by default: the templates are `.nbt` inside Mojang's server jar rather than in the
     * datapack the rest of the registries are read from, so a caller that wants them says so.
     */
    readonly templates?: TemplateSource;
}

/** What the generator built for one seed, which every chunk of that world shares. */
interface SeededPipeline {
    readonly randomState: RandomState;
    readonly settings: NoiseGeneratorSettings;
    readonly surface: SurfaceSystem;
    readonly materialRule: MaterialRuleNode;
    readonly biomes: BiomeManager;
    readonly possibleBiomes: ReadonlySet<string>;
    readonly plan: readonly ScheduledFeature[];
    readonly carversOf: (biome: string) => readonly CarverConfig[];
    readonly climateOf: (biome: string) => BiomeClimate;
    readonly oracle: BlockOracle;
    readonly translator: JavaStateTranslator;
}

/** The identifier `minecraft:bedrock`, which the carvers must not open. */
const BEDROCK = 'minecraft:bedrock';

/** What a carver leaves behind. Java's carvers write cave air rather than ordinary air. */
const CAVE_AIR = { name: 'minecraft:cave_air', properties: {} } as const;

const identifiersOf = (value: unknown): readonly string[] => {
    if (typeof value === 'string') return [value];
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
};

/**
 * The chunk generator that reads Java's data.
 *
 * One instance covers one dimension and caches everything that depends only on the seed, so a
 * world pays the registry parse once and each later chunk pays only for its own sampling.
 */
export class DataDrivenGenerator implements Generator {
    private readonly dimension: DimensionDefinition;
    private readonly worldgen: WorldgenData;
    private readonly materialRules: MaterialRuleData;
    private readonly biomeSource: MultiNoiseBiomeSource;
    private readonly pipelines = new Map<string, SeededPipeline>();

    public constructor(private readonly options: DataDrivenGeneratorOptions) {
        const registries = options.registries;
        this.dimension = options.dimension ?? Dimensions.Overworld;
        this.worldgen = new WorldgenData({
            densityFunctions: registries.densityFunctions,
            noises: registries.noises,
            noiseSettings: registries.noiseSettings
        });
        this.materialRules = new MaterialRuleData(
            { materialRules: registries.materialRules, materialConditions: registries.materialConditions },
            (reference, path) => {
                if (typeof reference !== 'string') {
                    throw new TypeError(`${path}: an ore vein rule names a density function by identifier`);
                }

                return this.worldgen.densityFunction(reference);
            }
        );

        const parameters = registries.biomeParameters.get(options.biomeParameters ?? 'minecraft:overworld');
        if (parameters === undefined) {
            throw new RangeError(
                `No biome parameter list is registered as ${options.biomeParameters ?? 'minecraft:overworld'}. ` +
                    'Run `pnpm --filter @jsprismarine/bedrock-data run datagen:java` to write the data generator reports.'
            );
        }

        this.biomeSource = MultiNoiseBiomeSource.fromJson(parameters);
    }

    /** @inheritDoc */
    public async generateChunk(cx: number, cz: number, seed = 0): Promise<Chunk> {
        const pipeline = this.pipelineFor(BigInt(Math.trunc(seed)));
        const region = this.buildTerrain(cx, cz, pipeline);

        if (this.options.decorate !== false) this.decorate(cx, cz, region, pipeline);

        return this.toChunk(cx, cz, region, pipeline);
    }

    /** Every Java state the translator could not place, for a caller that wants to report them. */
    public unmappedStates(seed: number): readonly string[] {
        return this.pipelineFor(BigInt(Math.trunc(seed))).translator.unmappedStates();
    }

    private buildTerrain(cx: number, cz: number, pipeline: SeededPipeline): GenerationRegion {
        const region = new GenerationRegion({
            chunkX: cx,
            chunkZ: cz,
            minY: this.dimension.minY,
            height: this.dimension.height,
            seaLevel: pipeline.settings.seaLevel,
            seed: pipeline.randomState.seed,
            blocks: pipeline.oracle,
            biomeAt: (x, y, z) => pipeline.biomes.getBiome(x, y, z),
            ...(this.options.templates === undefined ? {} : { templates: this.options.templates })
        });

        const sampler = new ChunkSampler(pipeline.randomState, { chunkX: cx, chunkZ: cz });
        const floor = Math.max(this.dimension.minY, pipeline.settings.noiseSettings.minY);
        const ceiling = Math.min(
            this.dimension.minY + this.dimension.height - 1,
            pipeline.settings.noiseSettings.minY + pipeline.settings.noiseSettings.height - 1
        );

        for (let localX = 0; localX < 16; localX++) {
            for (let localZ = 0; localZ < 16; localZ++) {
                const x = cx * 16 + localX;
                const z = cz * 16 + localZ;
                const column = sampler.column(x, z);
                for (let y = ceiling; y >= floor; y--) {
                    const block = column[y - pipeline.settings.noiseSettings.minY];
                    if (block === undefined || block.state === 'minecraft:air') continue;

                    region.write(x, y, z, { name: block.state, properties: {} });
                }
            }
        }

        if (this.options.carve !== false) this.carve(cx, cz, region, pipeline);

        region.freezeSurfaceHeights();
        pipeline.surface.buildSurface({
            chunk: region.surfaceChunk(),
            rule: pipeline.materialRule,
            biomeAt: (x, y, z) => pipeline.biomes.getBiome(x, y, z),
            biomeClimate: pipeline.climateOf,
            sampleContext: sampler.context,
            possibleBiomes: pipeline.possibleBiomes
        });

        return region;
    }

    /**
     * Runs the cave and canyon carvers and opens what they marked.
     *
     * Java replaces a carved block with cave air, or with the aquifer's fluid below the lava
     * level. The aquifer is not consulted here, so a carved position above the dimension floor
     * becomes cave air and bedrock is left alone, which is the rule every carver config states
     * through its own `replaceable` list.
     */
    private carve(cx: number, cz: number, region: GenerationRegion, pipeline: SeededPipeline): void {
        const mask = new CarvingMask(this.dimension.minY, this.dimension.minY + this.dimension.height - 1);

        carveChunk({
            seed: pipeline.randomState.seed,
            chunkX: cx,
            chunkZ: cz,
            carversAt: (sourceChunkX, sourceChunkZ) =>
                pipeline.carversOf(pipeline.biomes.getBiome(sourceChunkX * 16, 0, sourceChunkZ * 16)),
            context: pipeline.surface.generationContext,
            output: mask
        });

        for (let localX = 0; localX < 16; localX++) {
            for (let localZ = 0; localZ < 16; localZ++) {
                for (let y = this.dimension.minY; y < this.dimension.minY + this.dimension.height; y++) {
                    if (!mask.isCarved(localX, y, localZ)) continue;

                    const x = cx * 16 + localX;
                    const z = cz * 16 + localZ;
                    const existing = region.stateAt(x, y, z);
                    if (existing.name === BEDROCK || pipeline.oracle.fluid(existing) !== 'empty') continue;

                    region.write(x, y, z, CAVE_AIR);
                }
            }
        }
    }

    private decorate(cx: number, cz: number, region: GenerationRegion, pipeline: SeededPipeline): void {
        decorateChunk(pipeline.plan, { world: region.featureWorld() }, pipeline.randomState.seed, cx, cz);
    }

    /** Translates the region's Java states into the Bedrock chunk, and records the biomes. */
    private toChunk(cx: number, cz: number, region: GenerationRegion, pipeline: SeededPipeline): Chunk {
        const chunk = new Chunk(cx, cz, new Map(), this.dimension);

        region.forEachCenterBlock((localX, y, localZ, block) => {
            // A template block arrives as a Bedrock state already, so it skips the mapping.
            const runtimeId =
                block.bedrock === undefined
                    ? pipeline.translator.runtimeIdOf(block.java.name, block.java.properties)
                    : pipeline.translator.bedrockRuntimeIdOf(block.bedrock.name, block.bedrock.states);
            if (runtimeId === UNKNOWN_RUNTIME_ID) return;

            chunk.setBlockRuntimeId(localX, y, localZ, runtimeId);
        });

        this.recordBlockEntities(region, chunk, pipeline);
        this.recordEntitySpawns(region, chunk);
        this.recordBiomes(cx, cz, chunk, pipeline);
        return chunk;
    }

    /**
     * Files the block entities the decoration pass attached.
     *
     * A chest without this is a chest with nothing in it and a spawner without it is an inert
     * block, so a type the rewrite has no Bedrock name for is skipped rather than guessed at.
     */
    private recordBlockEntities(region: GenerationRegion, chunk: Chunk, pipeline: SeededPipeline): void {
        for (const placed of region.centerBlockEntities()) {
            const blockEntity = createBlockEntity(placed, pipeline.randomState.seed);
            if (blockEntity !== undefined) chunk.setBlockEntity(blockEntity);
        }
    }

    /**
     * Records the entities a feature built its blocks around.
     *
     * The generator has no world to add an entity to, so the chunk carries the request and the
     * world acts on it the first time the chunk is loaded.
     */
    private recordEntitySpawns(region: GenerationRegion, chunk: Chunk): void {
        const spawns = chunk.getEntitySpawns();
        for (const requested of region.centerEntitySpawns()) {
            const spawn = createEntitySpawn(requested);
            if (spawn !== undefined) spawns.push(spawn);
        }
    }

    /**
     * Fills the chunk's biome column from the biome source.
     *
     * The source answers per 4 by 4 by 4 cell, which is how Java stores biomes; Bedrock stores
     * one per block, so each cell fills its 64 blocks. That is the same expansion Geyser does
     * when it translates a Java chunk.
     */
    private recordBiomes(cx: number, cz: number, chunk: Chunk, pipeline: SeededPipeline): void {
        const biomes = chunk.getBiomes();
        const sections = subChunkCount(this.dimension);
        const resolver = this.biomeSource.resolver(createClimateSampler(pipeline.randomState));

        for (let section = 0; section < sections; section++) {
            const sectionMinY = this.dimension.minY + section * 16;
            for (let cellY = 0; cellY < 4; cellY++) {
                for (let cellX = 0; cellX < 4; cellX++) {
                    for (let cellZ = 0; cellZ < 4; cellZ++) {
                        const javaBiome = resolver(
                            (cx * 16 + cellX * 4) >> 2,
                            (sectionMinY + cellY * 4) >> 2,
                            (cz * 16 + cellZ * 4) >> 2
                        );
                        const id = bedrockBiomeIdOf(javaBiome);

                        for (let dx = 0; dx < 4; dx++) {
                            for (let dz = 0; dz < 4; dz++) {
                                for (let dy = 0; dy < 4; dy++) {
                                    biomes.set(cellX * 4 + dx, sectionMinY + cellY * 4 + dy, cellZ * 4 + dz, id);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private pipelineFor(seed: bigint): SeededPipeline {
        const key = seed.toString();
        const cached = this.pipelines.get(key);
        if (cached) return cached;

        const built = this.buildPipeline(seed);
        this.pipelines.set(key, built);
        return built;
    }

    private buildPipeline(seed: bigint): SeededPipeline {
        const registries = this.options.registries;
        const settingsId = this.options.noiseSettings ?? 'minecraft:overworld';
        const settings = this.worldgen.settings(settingsId);
        const randomState = new RandomState(this.worldgen, seed, settings);
        const surface = new SurfaceSystem(randomState);
        const climateOf = this.climateLookup();

        const possibleBiomes = new Set(this.biomeSource.possibleBiomes());
        const biomes = new BiomeManager(
            this.biomeSource.resolver(createClimateSampler(randomState)),
            BiomeManager.obfuscateSeed(seed)
        );

        return {
            randomState,
            settings,
            surface,
            materialRule: this.materialRules.rule(settings.materialRule),
            biomes,
            possibleBiomes,
            plan: this.buildFeaturePlan(),
            carversOf: this.carverLookup(),
            climateOf,
            oracle: createJavaBlockOracle(registries.blockTags),
            translator: new JavaStateTranslator()
        };
    }

    /** Reads a biome's `temperature` and `temperature_modifier`, memoized per biome. */
    private climateLookup(): (biome: string) => BiomeClimate {
        const cache = new Map<string, BiomeClimate>();
        const fallback: BiomeClimate = { baseTemperature: 0.5, temperatureModifier: 'none' };

        return (biome) => {
            const cached = cache.get(biome);
            if (cached) return cached;

            const document = this.options.registries.biomes.get(biome);
            const climate = document === undefined ? fallback : parseBiomeClimate(document, biome);
            cache.set(biome, climate);
            return climate;
        };
    }

    /** Reads a biome's `carvers` list, memoized per biome. */
    private carverLookup(): (biome: string) => readonly CarverConfig[] {
        const cache = new Map<string, readonly CarverConfig[]>();

        return (biome) => {
            const cached = cache.get(biome);
            if (cached) return cached;

            const document = this.options.registries.biomes.get(biome);
            const references =
                typeof document === 'object' && document !== null
                    ? identifiersOf((document as { carvers?: unknown }).carvers)
                    : [];

            const configs = references.flatMap((reference) => {
                const raw = this.options.registries.carvers.get(reference);
                return raw === undefined ? [] : [parseCarver(raw, reference)];
            });

            cache.set(biome, configs);
            return configs;
        };
    }

    /**
     * The chunk's decoration plan: every placed feature any biome lists, in Java's step order.
     *
     * Java sorts the per-step lists topologically across the biomes of the level so that two
     * biomes which disagree on the order of two features never interleave them. This takes the
     * order each step's features are first seen in instead, which is the same answer whenever
     * the biomes do agree, and vanilla's do for all but a handful.
     */
    private buildFeaturePlan(): readonly ScheduledFeature[] {
        const registries = this.options.registries;
        const loader = new FeatureLoader({
            feature: (id) => registries.features.get(id),
            placedFeature: (id) => registries.placedFeatures.get(id),
            blockStateProvider: (id) => registries.blockStateProviders.get(id)
        });

        const perStep = DECORATION_STEPS.map(() => [] as string[]);
        for (const biome of this.biomeSource.possibleBiomes()) {
            const document = registries.biomes.get(biome);
            const steps =
                typeof document === 'object' && document !== null
                    ? (document as { features?: unknown }).features
                    : undefined;
            if (!Array.isArray(steps)) continue;

            steps.forEach((entries, step) => {
                const list = perStep[step];
                if (list === undefined) return;

                for (const reference of identifiersOf(entries)) {
                    if (!list.includes(reference)) list.push(reference);
                }
            });
        }

        const plan: ScheduledFeature[] = [];
        perStep.forEach((references, step) => {
            references.forEach((reference, index) => {
                let feature: PlacedFeature;
                try {
                    feature = loader.placedFeatureById(reference);
                } catch {
                    // A placed feature the stack does not carry is left out of the plan rather
                    // than failing the world; the index of the rest is unchanged either way.
                    return;
                }

                plan.push({ feature, step: DECORATION_STEPS[step]!, index });
            });
        });

        return plan;
    }
}
