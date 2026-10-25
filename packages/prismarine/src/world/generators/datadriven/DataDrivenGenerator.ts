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
import { performance } from 'node:perf_hooks';
import { setImmediate as yieldEventLoop } from 'node:timers/promises';

import type { StepRegion } from '@jsprismarine/chunkgen';
import {
    ChunkHolderMap,
    FEATURE_PATCH_ORDER,
    GenerationScheduler,
    InboundFeaturePatches
} from '@jsprismarine/chunkgen';
import type { BlockOracle, BlockPos, FeatureWorld, PlacedFeature } from '@jsprismarine/features';
import {
    DECORATION_STEPS,
    FeatureLoader,
    WorldgenRandom,
    placeFeature,
    sortFeaturesPerStep
} from '@jsprismarine/features';
import { boxesOverlap } from '@jsprismarine/structures';
import type {
    BiomeClimate,
    BiomeResolver,
    CarverConfig,
    MaterialRuleNode,
    NoiseGeneratorSettings
} from '@jsprismarine/worldgen';
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
    coldEnoughToSnow,
    createClimateSampler,
    memoizeBiomeResolver,
    parseBiomeClimate,
    parseCarver
} from '@jsprismarine/worldgen';

import { BlockRuntimeIds, UNKNOWN_RUNTIME_ID } from '../../../block/state/BlockRuntimeIds';
import BlockStorage from '../../chunk/BlockStorage';
import Chunk from '../../chunk/Chunk';
import SubChunk from '../../chunk/SubChunk';
import { Dimensions, minSubChunk, subChunkCount } from '../../Dimension';
import type { DimensionDefinition } from '../../Dimension';
import type { Generator, SurfaceProbe } from '../../Generator';
import { GenerationChunk } from './GenerationChunk';
import { GenerationQueue } from './GenerationQueue';
import { GenerationRegion } from './GenerationRegion';
import type { RegionChunkPatch } from './GenerationRegion';
import { createJavaBlockOracle } from './javaBlockOracle';
import { createBlockEntity, createEntitySpawn } from './javaGeneratedContent';
import type { BeardPiece } from './javaStructureBeard';
import { BEARD_RADIUS, createBeardifier } from './javaStructureBeard';
import { createNoiseStructureLevel } from './javaStructureLevel';
import { asStructureRandom } from './javaStructureRandom';
import { chunkWriteBox, createRegionStructureWriter } from './javaStructureRegion';
import type { StructureBuilder, StructureStart } from './javaStructureStarts';
import { StructureStartSource } from './javaStructureStarts';
import { createStructureTemplateStore } from './javaStructureTemplatePiece';
import { STRUCTURE_BUILDERS } from './javaStructureTypes';
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
     * Whether to place structures. On by default, and only meaningful when the decoration pass
     * runs, because Java places a structure's pieces inside the decoration step the structure
     * names.
     */
    readonly structures?: boolean;
    /** Overrides the builder for a `worldgen/structure` type, which a test uses to isolate one. */
    readonly structureBuilders?: ReadonlyMap<string, StructureBuilder>;
    /**
     * Where the structure templates `template` and `fossil` stamp come from.
     *
     * Absent by default: the templates are `.nbt` inside Mojang's server jar rather than in the
     * datapack the rest of the registries are read from, so a caller that wants them says so.
     */
    readonly templates?: TemplateSource;
    /**
     * How many chunks of one world are built at once.
     *
     * Defaults to {@link DEFAULT_CONCURRENCY}. A shutdown refuses everything past this depth
     * straight away, so a caller that wants a shutdown to drop a particular request has to keep
     * the depth below the number of requests it makes.
     */
    readonly concurrency?: number;
}

/** What the generator built for one seed, which every chunk of that world shares. */
interface SeededPipeline {
    readonly randomState: RandomState;
    readonly settings: NoiseGeneratorSettings;
    readonly surface: SurfaceSystem;
    readonly materialRule: MaterialRuleNode;
    readonly biomes: BiomeManager;
    /** The per-cell biome lookup every stage shares, so a cell is resolved once per world. */
    readonly biomeCells: BiomeResolver;
    readonly possibleBiomes: ReadonlySet<string>;
    /** Every placed feature the dimension can run, indexed by decoration step then by index. */
    readonly featuresByStep: readonly StepFeatures[];
    /** What each biome contributes to a chunk it touches. */
    readonly biomeDecoration: ReadonlyMap<string, BiomeDecoration>;
    /** The structure starts this world has, or undefined when structures are turned off. */
    readonly structures?: StructureStartSource;
    /** The bare terrain the structures were laid out against. */
    readonly level: ReturnType<typeof createNoiseStructureLevel>;
    readonly carversOf: (biome: string) => readonly CarverConfig[];
    readonly climateOf: (biome: string) => BiomeClimate;
    readonly oracle: BlockOracle;
    readonly translator: JavaStateTranslator;
    /** Where every chunk of this world sits on the ladder, and how long each one is kept. */
    readonly holders: ChunkHolderMap<GenerationChunk>;
    /** The layer loop that drives a chunk and its neighborhood up the ladder. */
    readonly scheduler: GenerationScheduler<GenerationChunk>;
    /**
     * The holders this generator keeps a reference on past the run that built them, oldest first.
     *
     * A run releases its whole neighborhood when it finishes, so without this every chunk would
     * rebuild the twenty-five terrain tiles a `full` target drives. The value is the position,
     * because releasing needs it and the key is a string.
     */
    readonly retained: Map<string, readonly [number, number]>;
    /** Each chunk's biome palette, which its eight neighbors read while they decorate. */
    readonly chunkBiomes: Map<string, ReadonlySet<string>>;
    /** How many chunks of this world are built at once, and what a shutdown refuses. */
    readonly queue: GenerationQueue;
}

/**
 * One decoration step's features, in the order that seeds them.
 *
 * This is Java's `FeatureSorter.StepFeatureData`: one list per step covering every biome of the
 * dimension, so a feature keeps its index wherever it is placed.
 */
interface StepFeatures {
    /** The placed feature identifier at each index. */
    readonly references: readonly string[];
    /** The feature at each index, absent when this server cannot build it. */
    readonly features: readonly (PlacedFeature | undefined)[];
}

/** What one biome contributes to the decoration of a chunk it reaches. */
interface BiomeDecoration {
    /**
     * Every placed feature the biome lists, across all of its steps.
     *
     * Java's `minecraft:biome` placement modifier asks exactly this question of the biome at
     * the candidate position, which is what keeps a snowy tree off a plains hill and a plains
     * tree off an ice spike.
     */
    readonly lists: ReadonlySet<string>;
    /** The indices into {@link StepFeatures} the biome contributes, per decoration step. */
    readonly indicesByStep: readonly (readonly number[])[];
}

/** The identifier `minecraft:bedrock`, which the carvers must not open. */
const BEDROCK = 'minecraft:bedrock';

/** What a carver leaves behind. Java's carvers write cave air rather than ordinary air. */
const CAVE_AIR = 'minecraft:cave_air';

/** How many chunk holders the generator keeps alive past the run that built them. */
const GENERATION_CACHE_SIZE = 128;

/** How many blocks one sub chunk holds. */
const BLOCKS_PER_SUBCHUNK = 4096;

/** How many 4 by 4 by 4 biome cells one sub chunk holds. */
const BIOME_CELLS_PER_SUBCHUNK = 64;

/**
 * How many chunks of one world the generator builds at once by default.
 *
 * Six, which is where this machine's worker scaling peaks and is therefore what a pool is sized
 * at. It is the depth the pool has to be held at to keep every worker busy, and it is also the
 * depth the chunk status ladder's shared-promise path needs to fire at all: with a depth of one
 * the start region's batch of thirty-two is strictly sequential, which is what it was before.
 */
const DEFAULT_CONCURRENCY = 6;

/**
 * How far around a requested chunk the generator keeps holders, in chunks.
 *
 * Two, because that is the radius a `full` target drives `terrain` over. Keeping the terrain layer
 * is what makes a walk across a region pay for one noise fill per chunk instead of twenty-five.
 */
const RETENTION_RADIUS = 2;

/**
 * The nine chunks a feature view covers, in the order their terrain is copied into it.
 *
 * The order decides nothing, because the nine write disjoint columns of the view. It is written
 * down so a reader does not have to work that out.
 */
const FEATURE_VIEW_TILES = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dz) => [dx, dz] as const));

/** How long the terrain fill may hold the event loop before handing it back, in milliseconds. */
const TERRAIN_YIELD_BUDGET_MS = 4;

/** The source a generator with no templates uses, which places the structures that need none. */
const EMPTY_TEMPLATES: TemplateSource = { template: () => undefined, processorList: () => undefined };

const identifiersOf = (value: unknown): readonly string[] => {
    if (typeof value === 'string') return [value];
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
};

/**
 * The chunk generator that reads Java's data.
 *
 * One instance covers one dimension and caches everything that depends only on the seed, plus
 * recent terrain tiles shared by neighboring feature regions.
 */
export class DataDrivenGenerator implements Generator {
    private readonly dimension: DimensionDefinition;
    private readonly worldgen: WorldgenData;
    private readonly materialRules: MaterialRuleData;
    private readonly biomeSource: MultiNoiseBiomeSource;
    private readonly pipelines = new Map<string, SeededPipeline>();

    /** Whether {@link DataDrivenGenerator.stopGenerating} has been called. */
    private stopped = false;

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
        return pipeline.queue.run(cx, cz, async () => {
            this.retain(pipeline, cx, cz);

            // Decoration is the only thing that makes a chunk need its neighborhood. With it off
            // the ladder stops at `terrain`, which is one noise fill rather than the twenty-five
            // a `full` target drives, and there is no Bedrock chunk yet to hand back.
            const target = this.options.decorate === false ? 'terrain' : 'full';
            const staged = await pipeline.scheduler.generate(cx, cz, target);
            const promoted = staged.bedrockChunk;
            if (promoted !== undefined) return promoted;

            const chunk = this.toChunk(cx, cz, staged.terrain, pipeline);
            staged.recordChunk(chunk);
            return chunk;
        });
    }

    /** @inheritDoc */
    public stopGenerating(): void {
        this.stopped = true;
        for (const pipeline of this.pipelines.values()) pipeline.queue.stop();
    }

    /** Every Java state the translator could not place, for a caller that wants to report them. */
    public unmappedStates(seed: number): readonly string[] {
        return this.pipelineFor(BigInt(Math.trunc(seed))).translator.unmappedStates();
    }

    /**
     * The structure starts that reach into a chunk, without generating it.
     *
     * A start is laid out against the bare noise terrain and touches no chunk, so this is the
     * cheap way to ask where a structure is: a comparison against Java's `/locate` needs the
     * generation point and the box, and neither needs a block placed.
     */
    public structureStartsAt(chunkX: number, chunkZ: number, seed = 0): readonly StructureStart[] {
        return this.pipelineFor(BigInt(Math.trunc(seed))).structures?.startsFor(chunkX, chunkZ) ?? [];
    }

    /** The structure types this server has no builder for, which therefore generate nothing. */
    public unbuiltStructureTypes(seed = 0): ReadonlySet<string> {
        return this.pipelineFor(BigInt(Math.trunc(seed))).structures?.unbuiltTypes() ?? new Set();
    }

    /** @inheritDoc */
    public surfaceAt(x: number, z: number, seed = 0): SurfaceProbe {
        const level = this.pipelineFor(BigInt(Math.trunc(seed))).level;

        // `baseHeight` answers the level above the topmost match, the way Java's does, so the
        // block itself is one below. `MOTION_BLOCKING` stops at solid or fluid, which is the
        // ocean surface over water and the ground over land - exactly the distinction a spawn
        // search is making.
        const y = level.baseHeight(x, z, 'MOTION_BLOCKING') - 1;
        if (y < level.minY) return undefined;

        return { y, name: level.baseBlock(x, y, z).name };
    }

    /**
     * A scratch region, either one chunk wide or the three by three a feature pass writes into.
     *
     * @param radius - 0 for a terrain tile and for the region a chunk is promoted out of, 1 for
     * the feature view, which is Java's `WorldGenRegion` extent.
     */
    private createRegion(cx: number, cz: number, radius: number, pipeline: SeededPipeline): GenerationRegion {
        return new GenerationRegion({
            chunkX: cx,
            chunkZ: cz,
            minY: this.dimension.minY,
            height: this.dimension.height,
            radius,
            seaLevel: pipeline.settings.seaLevel,
            seed: pipeline.randomState.seed,
            blocks: pipeline.oracle,
            biomeAt: (x, y, z) => pipeline.biomes.getBiome(x, y, z),
            ...(this.options.templates === undefined ? {} : { templates: this.options.templates })
        });
    }

    /**
     * The `terrain` body: the noise fill, the surface materials and the carvers for one chunk.
     *
     * The tile it leaves behind is never written into again. Up to nine feature passes read it,
     * and the chunk's own promotion copies it, so anything that wrote into it afterwards would
     * make its contents depend on what else the generator had been asked for.
     */
    private async runTerrain(region: StepRegion<GenerationChunk>, pipeline: SeededPipeline): Promise<GenerationChunk> {
        const chunk = region.center;
        chunk.recordTerrain(await this.buildTerrain(chunk.chunkX, chunk.chunkZ, pipeline));
        return chunk;
    }

    /**
     * The `features` body: Java's decoration pass over a three by three view of finished terrain.
     *
     * Nothing is written through. The view collects every write the pass made and splits it by the
     * chunk it landed in, so the eight neighbors receive a patch rather than a mutation and two
     * feature passes that overlap cannot race. The view itself is dropped here: what survives is
     * this chunk's own writes and the eight patches, which is a few kilobytes against the 1.7 MiB
     * the view holds.
     */
    private runFeatures(region: StepRegion<GenerationChunk>, pipeline: SeededPipeline): GenerationChunk {
        const chunk = region.center;
        const view = this.createRegion(chunk.chunkX, chunk.chunkZ, 1, pipeline);
        for (const [dx, dz] of FEATURE_VIEW_TILES) view.copyCenterFrom(region.neighbor(dx, dz, 'terrain').terrain);

        view.beginWriteTracking();
        this.decorate(chunk.chunkX, chunk.chunkZ, view, pipeline);
        chunk.recordFeatures(
            new Map(view.takeTrackedPatches().map((patch) => [this.chunkKey(patch.chunkX, patch.chunkZ), patch]))
        );
        return chunk;
    }

    /**
     * The `full` body: terrain, then this chunk's own feature writes, then the eight inbound
     * patches in {@link FEATURE_PATCH_ORDER}.
     *
     * The order is positional and nothing else, which is what makes the border a function of the
     * seed and the position. Java merges nothing because it wrote through, so where two features
     * from different chunks land on the same block Java's answer depends on which chunk reached
     * `features` first. ADR 0002 takes that deviation on purpose; this loop is where it is paid
     * for, and reading its eight neighbors is why the `full` step declares `features` at radius 1.
     */
    private runFull(region: StepRegion<GenerationChunk>, pipeline: SeededPipeline): GenerationChunk {
        const chunk = region.center;
        const final = this.createRegion(chunk.chunkX, chunk.chunkZ, 0, pipeline);
        final.copyCenterFrom(chunk.terrain);

        const own = chunk.ownFeatureWrites;
        if (own !== undefined) final.applyPatch(own);

        const inbound = new InboundFeaturePatches<RegionChunkPatch>();
        for (const [dx, dz] of FEATURE_PATCH_ORDER) {
            const patch = region.neighbor(dx, dz, 'features').featureWritesInto(chunk.chunkX, chunk.chunkZ);
            if (patch !== undefined) inbound.receive(dx, dz, patch);
        }
        for (const patch of inbound.inMergeOrder()) final.applyPatch(patch);

        chunk.recordChunk(this.toChunk(chunk.chunkX, chunk.chunkZ, final, pipeline));
        return chunk;
    }

    /**
     * Keeps the holders around a requested chunk alive past the run that built them.
     *
     * A run releases its whole neighborhood when it finishes, which is what makes the reference
     * count correct and would also make every chunk rebuild its twenty-five terrain tiles. The
     * oldest holders go when the count passes {@link GENERATION_CACHE_SIZE}. Dropping one costs a
     * rebuild and nothing else, because every status is a pure function of the seed and the
     * position now; the LRU this replaces dropped cross-chunk writes instead.
     */
    private retain(pipeline: SeededPipeline, cx: number, cz: number): void {
        for (let dz = -RETENTION_RADIUS; dz <= RETENTION_RADIUS; dz++) {
            for (let dx = -RETENTION_RADIUS; dx <= RETENTION_RADIUS; dx++) {
                const position = [cx + dx, cz + dz] as const;
                const key = this.chunkKey(position[0], position[1]);
                if (pipeline.retained.delete(key)) {
                    pipeline.retained.set(key, position);
                    continue;
                }

                pipeline.holders.acquire(position[0], position[1]);
                pipeline.retained.set(key, position);
            }
        }

        while (pipeline.retained.size > GENERATION_CACHE_SIZE) {
            const oldest = pipeline.retained.entries().next().value;
            if (oldest === undefined) return;

            pipeline.retained.delete(oldest[0]);
            pipeline.holders.release(oldest[1][0], oldest[1][1]);
        }
    }

    private async buildTerrain(cx: number, cz: number, pipeline: SeededPipeline): Promise<GenerationRegion> {
        const region = this.createRegion(cx, cz, 0, pipeline);

        const sampler = new ChunkSampler(pipeline.randomState, { chunkX: cx, chunkZ: cz });
        // Java reads the structure starts before it samples the terrain, so a village flattens
        // the hillside it is about to stand on. The starts are laid out against the bare noise,
        // which has no beard of its own, so there is no circle here.
        sampler.context.beardifier = createBeardifier(this.beardPieces(cx, cz, pipeline));
        const floor = Math.max(this.dimension.minY, pipeline.settings.noiseSettings.minY);
        const ceiling = Math.min(
            this.dimension.minY + this.dimension.height - 1,
            pipeline.settings.noiseSettings.minY + pipeline.settings.noiseSettings.height - 1
        );

        let lastYield = performance.now();
        // Cell by cell rather than column by column. A column walk leaves an interpolation
        // cell after eight blocks and makes the density stack refetch its eight corners, which
        // a chunk paid 57177 times where the lattice holds 768 cells. The blocks and their
        // fluid update flags are the same either way; only the order they are asked in moves.
        for (let cell = 0; cell < sampler.cellCount; cell++) {
            sampler.forEachCellBlock(cell, (x, y, z, state) => {
                if (y >= floor && y <= ceiling && state !== 'minecraft:air') region.writeName(x, y, z, state);
            });

            // A yield is a trip around the event loop, which on a loaded host costs more than
            // the work it interrupts: a fixed yield every four columns spent most of a preload
            // waiting to be scheduled again. The budget bounds how long the loop is held
            // whatever the host's speed, which is the property the yield is here for.
            if (performance.now() - lastYield >= TERRAIN_YIELD_BUDGET_MS) {
                await yieldEventLoop();
                lastYield = performance.now();
            }
        }

        region.freezeSurfaceHeights();
        pipeline.surface.buildSurface({
            chunk: region.surfaceChunk(),
            rule: pipeline.materialRule,
            biomeAt: (x, y, z) => pipeline.biomes.getBiome(x, y, z),
            biomeClimate: pipeline.climateOf,
            sampleContext: sampler.context,
            possibleBiomes: pipeline.possibleBiomes
        });

        // Java's `terrain` status runs the fill, the surface materials and the carvers in that
        // order, so a cave mouth cuts through finished grass rather than being paved over by it.
        if (this.options.carve !== false) this.carve(cx, cz, region, pipeline, sampler);

        return region;
    }

    /**
     * The structure pieces close enough to a chunk to push its terrain around.
     *
     * Java's filter is the same: a start whose structure asks for no adaptation is skipped
     * outright, and a piece further than twelve blocks from the chunk contributes nothing at
     * any position in it.
     */
    private beardPieces(cx: number, cz: number, pipeline: SeededPipeline): BeardPiece[] {
        const structures = pipeline.structures;
        if (structures === undefined) return [];

        const minX = cx * 16 - BEARD_RADIUS;
        const maxX = cx * 16 + 15 + BEARD_RADIUS;
        const minZ = cz * 16 - BEARD_RADIUS;
        const maxZ = cz * 16 + 15 + BEARD_RADIUS;

        const nearby: BeardPiece[] = [];
        for (const start of structures.startsFor(cx, cz)) {
            if (start.terrainAdaptation === 'none') continue;

            for (const piece of start.pieces) {
                if (piece.ignoresTerrainAdaptation === true) continue;

                const box = piece.boundingBox;
                if (box.minX > maxX || box.maxX < minX || box.minZ > maxZ || box.maxZ < minZ) continue;

                nearby.push({
                    box,
                    groundLevelDelta: piece.groundLevelDelta ?? 0,
                    adaptation: start.terrainAdaptation
                });
            }
        }

        return nearby;
    }

    /**
     * Runs the cave and canyon carvers and opens what they marked.
     *
     * Java replaces a carved block with the aquifer's fluid state, falling back to cave air
     * when the aquifer leaves the position open. `carver/cave.json` reaches `y: 180`, so a
     * tunnel can be marked where the terrain never put a block; Java's write is a no-op there
     * and this skips it, because a cave-air block standing in the sky would raise the region's
     * column ceiling and the surface pass reads that ceiling.
     */
    private carve(
        cx: number,
        cz: number,
        region: GenerationRegion,
        pipeline: SeededPipeline,
        sampler: ChunkSampler
    ): void {
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
                    if (pipeline.oracle.isAir(existing)) continue;
                    if (existing.name === BEDROCK || pipeline.oracle.fluid(existing) !== 'empty') continue;

                    const fluid = sampler.aquifer.computeSubstance(x, y, z, 0);
                    region.writeName(x, y, z, fluid ?? CAVE_AIR);
                }
            }
        }
    }

    private chunkKey(chunkX: number, chunkZ: number): string {
        return `${chunkX},${chunkZ}`;
    }

    private trimCache<T>(cache: Map<string, T>): void {
        while (cache.size > GENERATION_CACHE_SIZE) {
            const oldest = cache.keys().next().value;
            if (oldest === undefined) return;
            cache.delete(oldest);
        }
    }

    /**
     * Runs Java's `applyBiomeDecoration`: for each of the eleven steps, the structures of that
     * step and then its features.
     *
     * Both are seeded from an index that restarts at zero inside every step, so a structure and
     * a feature of the same step can share a seed. That is what Java does, and the two counters
     * are independent: turning structures off does not move a feature.
     *
     * A step's features are the union of what the biomes of the surrounding 3 by 3 chunks list,
     * run once each in index order. The surrounding chunks are included so a tree rooted in a
     * neighbor can still grow across the border, and `minecraft:biome` is what then keeps each
     * feature on the biome that asked for it.
     */
    private decorate(cx: number, cz: number, region: GenerationRegion, pipeline: SeededPipeline): void {
        const random = new WorldgenRandom();
        const origin = { x: cx * 16, y: this.dimension.minY, z: cz * 16 };
        const populationSeed = random.setDecorationSeed(pipeline.randomState.seed, origin.x, origin.z);
        const world = region.featureWorld();
        const palette = this.biomePaletteAround(cx, cz, pipeline);
        const starts = pipeline.structures?.startsFor(cx, cz) ?? [];
        const clip = chunkWriteBox(cx, cz, this.dimension.minY, this.dimension.minY + this.dimension.height - 1);
        const writer = starts.length === 0 ? undefined : createRegionStructureWriter(region, pipeline.level, clip);
        DECORATION_STEPS.forEach((step, stepIndex) => {
            if (writer !== undefined && pipeline.structures !== undefined) {
                pipeline.structures.structuresInStep(step).forEach((structure, index) => {
                    const placing = starts.filter((start) => start.structure === structure);
                    if (placing.length === 0) return;

                    random.setFeatureSeed(populationSeed, index, stepIndex);
                    const pieceRandom = asStructureRandom(random);
                    for (const start of placing) {
                        // Java skips a piece whose box misses the chunk, which is what keeps a
                        // mineshaft's 170 pieces from each running in all thirty chunks it
                        // covers. The skipped piece draws nothing, so the stream moves with it.
                        for (const piece of start.pieces) {
                            if (boxesOverlap(piece.boundingBox, clip)) piece.place(writer, pieceRandom);
                        }
                    }
                });
            }

            const stepFeatures = pipeline.featuresByStep[stepIndex];
            if (stepFeatures === undefined) return;

            const candidates = new Set<number>();
            for (const biome of palette) {
                for (const index of pipeline.biomeDecoration.get(biome)?.indicesByStep[stepIndex] ?? []) {
                    candidates.add(index);
                }
            }

            for (const index of [...candidates].sort((left, right) => left - right)) {
                const feature = stepFeatures.features[index];
                const reference = stepFeatures.references[index];
                if (feature === undefined || reference === undefined) continue;

                random.setFeatureSeed(populationSeed, index, stepIndex);
                placeFeature(
                    feature,
                    { world, featureBelongsToBiome: this.biomeCheck(pipeline, world, reference) },
                    random,
                    origin
                );
            }
        });
    }

    /**
     * Java's `BiomeFilter`: whether the biome at a position lists the feature being placed.
     *
     * The chain decides which position is tested, and it is rarely the chunk origin. In
     * `trees_plains` the check is last, after the heightmap and the survival test, so it asks
     * about the block the tree would stand on.
     */
    private biomeCheck(
        pipeline: SeededPipeline,
        world: FeatureWorld,
        reference: string
    ): (position: BlockPos) => boolean {
        return (position) => pipeline.biomeDecoration.get(world.getBiome(position))?.lists.has(reference) ?? false;
    }

    /**
     * The biomes of the nine chunks a decoration pass may write into.
     *
     * Java collects these from the biome palettes of the 3 by 3 chunks around the one being
     * decorated, which it can do because all nine have finished their `biomes` status. Reading
     * the biome source per cell gives the same answer, because the palette is what that source
     * filled.
     */
    private biomePaletteAround(cx: number, cz: number, pipeline: SeededPipeline): ReadonlySet<string> {
        const palette = new Set<string>();
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                for (const biome of this.chunkBiomes(cx + dx, cz + dz, pipeline)) palette.add(biome);
            }
        }
        return palette;
    }

    /** One chunk's biome palette, kept because each chunk's is read by nine decoration passes. */
    private chunkBiomes(cx: number, cz: number, pipeline: SeededPipeline): ReadonlySet<string> {
        const key = this.chunkKey(cx, cz);
        const cached = pipeline.chunkBiomes.get(key);
        if (cached !== undefined) {
            pipeline.chunkBiomes.delete(key);
            pipeline.chunkBiomes.set(key, cached);
            return cached;
        }

        const biomes = new Set<string>();
        const bottom = this.dimension.minY >> 2;
        const top = (this.dimension.minY + this.dimension.height - 1) >> 2;
        for (let quartX = cx * 4; quartX < cx * 4 + 4; quartX++) {
            for (let quartZ = cz * 4; quartZ < cz * 4 + 4; quartZ++) {
                for (let quartY = bottom; quartY <= top; quartY++) {
                    biomes.add(pipeline.biomeCells(quartX, quartY, quartZ));
                }
            }
        }

        pipeline.chunkBiomes.set(key, biomes);
        this.trimCache(pipeline.chunkBiomes);
        return biomes;
    }

    /**
     * Translates the region's Java states into the Bedrock chunk, and records the biomes.
     *
     * By the palette, not block by block. The region holds its blocks as indices into a palette
     * of a few hundred materials, and a sub chunk holds its own the same way, so the whole
     * translation is one mapping lookup per material and then a reindexing of the buffer. The
     * per-block form it replaces cost a mapping lookup and a sub chunk lookup for each of the
     * column's blocks, which is the work that has to happen on the main thread after a worker
     * hands a chunk back and therefore the work that caps the pool.
     */
    private toChunk(cx: number, cz: number, region: GenerationRegion, pipeline: SeededPipeline): Chunk {
        const chunk = new Chunk(cx, cz, this.buildSubChunks(region, pipeline), this.dimension);
        // The constructor is a load rather than a write, so nothing has told the chunk it is
        // unsaved. A generated chunk is exactly the thing that has never been written to disk.
        chunk.markChanged();

        this.recordBlockEntities(region, chunk, pipeline);
        this.recordEntitySpawns(region, chunk);
        this.recordBiomes(cx, cz, chunk, pipeline);
        return chunk;
    }

    /**
     * The region's center chunk as Bedrock sub chunks, one per 16 block slab that holds anything.
     *
     * A slab whose palette never grows past air is left out, the same way a per-block fill never
     * created a sub chunk nothing was written into. An unmapped Java state becomes air for the
     * same reason: the per-block fill skipped the write, and skipping a write leaves air.
     */
    private buildSubChunks(region: GenerationRegion, pipeline: SeededPipeline): Map<number, SubChunk> {
        const { palette, slots, columnTops } = region.centerBlockSlots();
        const air = BlockRuntimeIds.getByName('minecraft:air');
        const runtimeIds = new Int32Array(palette.length);
        for (let slot = 0; slot < palette.length; slot++) {
            const block = palette[slot]!;
            // A template block arrives as a Bedrock state already, so it skips the mapping.
            const runtimeId =
                block.bedrock === undefined
                    ? pipeline.translator.runtimeIdOf(block.java.name, block.java.properties)
                    : pipeline.translator.bedrockRuntimeIdOf(block.bedrock.name, block.bedrock.states);
            runtimeIds[slot] = runtimeId === UNKNOWN_RUNTIME_ID ? air : runtimeId;
        }

        const minY = this.dimension.minY;
        const height = this.dimension.height;
        let top = minY - 1;
        for (let column = 0; column < 256; column++) {
            if (columnTops[column]! > top) top = columnTops[column]!;
        }

        const subChunks = new Map<number, SubChunk>();
        const localSlots = new Int32Array(palette.length);
        for (let section = minY >> 4; section <= top >> 4; section++) {
            const sectionMinY = section * 16;
            const blocks = new Uint16Array(BLOCKS_PER_SUBCHUNK);
            const sectionPalette = [air];
            // Two lookups rather than one. The array answers for a slot already seen in this
            // section, which is almost every block; the map is what keeps two region slots that
            // translate to the same runtime id from taking two palette entries, the way
            // `BlockStorage.setBlock` does.
            const byRuntimeId = new Map<number, number>([[air, 0]]);
            localSlots.fill(-1);

            for (let localX = 0; localX < 16; localX++) {
                for (let localZ = 0; localZ < 16; localZ++) {
                    const column = localX * 16 + localZ;
                    const columnBase = column * height - minY;
                    const target = (localX << 8) | (localZ << 4);
                    const columnTop = Math.min(columnTops[column]!, sectionMinY + 15);

                    for (let y = sectionMinY; y <= columnTop; y++) {
                        const slot = slots[columnBase + y]!;
                        let local = localSlots[slot]!;
                        if (local < 0) {
                            const runtimeId = runtimeIds[slot]!;
                            local = byRuntimeId.get(runtimeId) ?? sectionPalette.push(runtimeId) - 1;
                            byRuntimeId.set(runtimeId, local);
                            localSlots[slot] = local;
                        }

                        blocks[target | (y & 0xf)] = local;
                    }
                }
            }

            if (sectionPalette.length === 1) continue;
            subChunks.set(section, new SubChunk(new Map([[0, new BlockStorage({ blocks, palette: sectionPalette })]])));
        }

        return subChunks;
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
     *
     * A section is resolved as its sixty-four cells and handed over whole, so a section whose
     * cells all agree costs one number rather than the 4096 writes that would expand it to 8 KiB
     * and then collapse it again.
     */
    private recordBiomes(cx: number, cz: number, chunk: Chunk, pipeline: SeededPipeline): void {
        const biomes = chunk.getBiomes();
        const sections = subChunkCount(this.dimension);
        const floor = minSubChunk(this.dimension);
        const resolver = pipeline.biomeCells;
        const cells = new Uint16Array(BIOME_CELLS_PER_SUBCHUNK);

        for (let section = 0; section < sections; section++) {
            const sectionMinY = this.dimension.minY + section * 16;
            let uniform = true;
            for (let cellX = 0; cellX < 4; cellX++) {
                for (let cellZ = 0; cellZ < 4; cellZ++) {
                    for (let cellY = 0; cellY < 4; cellY++) {
                        const id = bedrockBiomeIdOf(
                            resolver(
                                (cx * 16 + cellX * 4) >> 2,
                                (sectionMinY + cellY * 4) >> 2,
                                (cz * 16 + cellZ * 4) >> 2
                            )
                        );
                        cells[(cellX * 4 + cellZ) * 4 + cellY] = id;
                        if (id !== cells[0]) uniform = false;
                    }
                }
            }

            if (uniform) {
                biomes.setSection(floor + section, cells[0]!);
                continue;
            }

            const packed = new Uint16Array(BLOCKS_PER_SUBCHUNK);
            for (let localX = 0; localX < 16; localX++) {
                for (let localZ = 0; localZ < 16; localZ++) {
                    const cell = ((localX >> 2) * 4 + (localZ >> 2)) * 4;
                    const target = (localX << 8) | (localZ << 4);
                    for (let localY = 0; localY < 16; localY++) {
                        packed[target | localY] = cells[cell + (localY >> 2)]!;
                    }
                }
            }
            biomes.setSection(floor + section, packed);
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
        const resolver = memoizeBiomeResolver(this.biomeSource.resolver(createClimateSampler(randomState)));
        const biomes = new BiomeManager(resolver, BiomeManager.obfuscateSeed(seed));
        const oracle = createJavaBlockOracle(registries.blockTags);
        const level = createNoiseStructureLevel({
            randomState,
            settings,
            minY: this.dimension.minY,
            height: this.dimension.height,
            noiseBiome: resolver,
            isSolid: (state) => oracle.isSolid(state),
            isFluid: (state) => oracle.fluid(state) !== 'empty',
            coldEnoughToSnow: (x, y, z) =>
                coldEnoughToSnow(climateOf(resolver(x >> 2, y >> 2, z >> 2)), x, y, z, settings.seaLevel)
        });

        const decoration = this.buildDecorationPlan();
        const holders = new ChunkHolderMap<GenerationChunk>((chunkX, chunkZ) => new GenerationChunk(chunkX, chunkZ));
        const pipeline: SeededPipeline = {
            randomState,
            settings,
            surface,
            materialRule: this.materialRules.rule(settings.materialRule),
            biomes,
            biomeCells: resolver,
            possibleBiomes,
            featuresByStep: decoration.featuresByStep,
            biomeDecoration: decoration.biomeDecoration,
            level,
            ...(this.options.structures === false
                ? {}
                : {
                      structures: new StructureStartSource({
                          seed,
                          registries,
                          level,
                          templates: createStructureTemplateStore(this.options.templates ?? EMPTY_TEMPLATES),
                          isPossibleBiome: (biome) => possibleBiomes.has(biome),
                          builders: this.options.structureBuilders ?? STRUCTURE_BUILDERS
                      })
                  }),
            carversOf: this.carverLookup(),
            climateOf,
            oracle,
            translator: new JavaStateTranslator(),
            holders,
            // The three bodies close over `pipeline`, which is assigned before any of them can
            // run: nothing climbs a rung until `generateChunk` asks the scheduler to.
            scheduler: new GenerationScheduler<GenerationChunk>({
                holders,
                tasks: {
                    terrain: (region) => this.runTerrain(region, pipeline),
                    features: (region) => this.runFeatures(region, pipeline),
                    full: (region) => this.runFull(region, pipeline)
                }
            }),
            retained: new Map(),
            chunkBiomes: new Map(),
            queue: new GenerationQueue(this.options.concurrency ?? DEFAULT_CONCURRENCY)
        };

        // A world asked for after the shutdown began is refused at once rather than generating
        // the first chunk of a dimension nobody will see saved.
        if (this.stopped) pipeline.queue.stop();
        return pipeline;
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

    /** The placed feature identifiers one biome lists, as eleven lists in Java's step order. */
    private biomeFeatureReferences(biome: string): readonly (readonly string[])[] {
        const document = this.options.registries.biomes.get(biome);
        const steps =
            typeof document === 'object' && document !== null
                ? (document as { features?: unknown }).features
                : undefined;

        return Array.isArray(steps) ? steps.map((entries) => identifiersOf(entries)) : [];
    }

    /**
     * The dimension's feature order and each biome's place in it.
     *
     * Java builds this once per chunk generator and reuses it for every chunk, because a
     * feature's index has to be the same wherever it is placed: the index is half of the
     * feature's seed. {@link sortFeaturesPerStep} is what merges the biomes' disagreeing orders
     * into the one list per step the index counts along.
     */
    private buildDecorationPlan(): {
        readonly featuresByStep: readonly StepFeatures[];
        readonly biomeDecoration: ReadonlyMap<string, BiomeDecoration>;
    } {
        const registries = this.options.registries;
        const loader = new FeatureLoader({
            feature: (id) => registries.features.get(id),
            placedFeature: (id) => registries.placedFeatures.get(id),
            blockStateProvider: (id) => registries.blockStateProviders.get(id)
        });

        const byBiome = new Map<string, readonly (readonly string[])[]>();
        for (const biome of this.biomeSource.possibleBiomes()) {
            byBiome.set(biome, this.biomeFeatureReferences(biome));
        }

        const featuresByStep = sortFeaturesPerStep(byBiome.values()).map((references) => ({
            references,
            features: references.map((reference) => {
                try {
                    return loader.placedFeatureById(reference);
                } catch {
                    // A placed feature this server cannot build keeps its slot rather than
                    // failing the world, because every later feature is seeded by its index.
                    return undefined;
                }
            })
        }));

        const indexOfStep = featuresByStep.map(({ references }) => new Map(references.map((name, at) => [name, at])));

        const biomeDecoration = new Map<string, BiomeDecoration>();
        for (const [biome, steps] of byBiome) {
            const lists = new Set<string>();
            const indicesByStep = featuresByStep.map((_entry, step) => {
                const indices: number[] = [];
                for (const reference of steps[step] ?? []) {
                    lists.add(reference);
                    const index = indexOfStep[step]?.get(reference);
                    if (index !== undefined) indices.push(index);
                }
                return indices;
            });

            biomeDecoration.set(biome, { lists, indicesByStep });
        }

        return { featuresByStep, biomeDecoration };
    }
}
