/**
 * Where a structure starts and what it is made of.
 *
 * Java's `ChunkGenerator.createStructures` asks every structure set whether a chunk is one of
 * its, draws the structure the set offers there, lays it out against the bare terrain and keeps
 * the result if the biome at its generation point allows it. `createReferences` then finds, for
 * the chunk being generated, every start within eight chunks whose box reaches into it. Both are
 * here, with one cache in front of them, because a village is laid out once and written into
 * each of the dozen chunks it covers.
 *
 * Laying a structure out touches no chunk and writes nothing, so a start is a pure function of
 * the world seed and the chunk it starts in. That is what makes the cache safe and what makes
 * two neighboring chunks agree about the same village.
 */
import type { DecorationStep } from '@jsprismarine/features';
import { DECORATION_STEPS } from '@jsprismarine/features';
import type { BoundingBox, RandomSource, TemplatePool } from '@jsprismarine/structures';
import { createLegacyRandom, parseTemplatePool } from '@jsprismarine/structures';

import type { TerrainAdaptation } from './javaStructureBeard';
import { terrainAdaptationOf } from './javaStructureBeard';
import type { NamedStructureSet } from './javaStructurePlacement';
import { candidateChunksIn, chooseStructure, createBiomeExpander, loadStructureSets } from './javaStructurePlacement';
import { structureRandomSeed } from './javaStructurePlacement';
import type { StructureTemplateStore } from './javaStructureTemplatePiece';
import type { StructureLevel, StructurePiece } from './javaStructureWorld';
import { boxTouchesChunk, unionOf } from './javaStructureWorld';
import type { JavaWorldgenRegistries } from './javaWorldgenData';

/** How far Java looks for a start that reaches into the chunk being generated. */
const REFERENCE_RADIUS = 8;

/** How many cached starts are kept before the cache is dropped and rebuilt. */
const CACHE_LIMIT = 8192;

/** What a structure type's builder is given. */
export interface StructureBuildContext {
    /** The structure identifier, for example `minecraft:village_plains`. */
    readonly id: string;
    /** The `worldgen/structure` document, parsed no further than JSON. */
    readonly definition: Record<string, unknown>;
    /** The chunk the structure starts in. */
    readonly chunkX: number;
    readonly chunkZ: number;
    readonly seed: bigint;
    /** The stream Java seeds from the world seed and the start chunk, untouched. */
    readonly random: RandomSource;
    readonly level: StructureLevel;
    readonly templates: StructureTemplateStore;
    /** Resolves a `worldgen/template_pool` identifier, parsed once and kept. */
    readonly pool: (identifier: string) => TemplatePool | undefined;
}

/** What a builder produced: the pieces and the point the biome check is made at. */
export interface StructureLayout {
    readonly pieces: readonly StructurePiece[];
    /** Java's generation point, which is also what `/locate` reports. */
    readonly origin: { readonly x: number; readonly y: number; readonly z: number };
}

/** Lays one structure type out. Returns undefined when the structure cannot start here. */
export type StructureBuilder = (context: StructureBuildContext) => StructureLayout | undefined;

/** One structure that starts in a chunk, laid out and ready to be written. */
export interface StructureStart {
    /** The structure identifier. */
    readonly structure: string;
    /** The structure set that offered this chunk. */
    readonly set: string;
    readonly chunkX: number;
    readonly chunkZ: number;
    /** The decoration step the pieces are written in. */
    readonly step: DecorationStep;
    /** How the structure pushes the terrain around it, before the terrain is sampled. */
    readonly terrainAdaptation: TerrainAdaptation;
    readonly boundingBox: BoundingBox;
    readonly pieces: readonly StructurePiece[];
    /** Java's generation point. */
    readonly origin: { readonly x: number; readonly y: number; readonly z: number };
}

/** How a {@link StructureStartSource} is built. */
export interface StructureStartOptions {
    readonly seed: bigint;
    readonly registries: JavaWorldgenRegistries;
    readonly level: StructureLevel;
    readonly templates: StructureTemplateStore;
    /** Whether the dimension's biome source can produce a biome. */
    readonly isPossibleBiome: (biome: string) => boolean;
    /** The builder for each `worldgen/structure` type. */
    readonly builders: ReadonlyMap<string, StructureBuilder>;
}

/** The step a structure document names, defaulting to the one 44 of the 52 carry. */
const stepOf = (value: unknown): DecorationStep =>
    DECORATION_STEPS.find((candidate) => candidate === value) ?? 'surface_structures';

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The structure starts a world has, for one seed.
 *
 * One of these covers one dimension of one world. It is built once and asked per chunk.
 */
export class StructureStartSource {
    private readonly sets: readonly NamedStructureSet[];
    private readonly biomesOf: (structure: string) => ReadonlySet<string>;
    private readonly pools = new Map<string, TemplatePool | undefined>();
    private readonly starts = new Map<string, StructureStart | null>();

    /** The structures of each step, in registry order, which is the order Java seeds them in. */
    private readonly byStep = new Map<DecorationStep, string[]>();

    /** The structure types no builder is registered for, which the caller may want to report. */
    private readonly unbuilt = new Set<string>();

    public constructor(private readonly options: StructureStartOptions) {
        const expand = createBiomeExpander(options.registries.biomeTags);
        const biomeCache = new Map<string, ReadonlySet<string>>();

        this.biomesOf = (structure) => {
            const cached = biomeCache.get(structure);
            if (cached !== undefined) return cached;

            const document = options.registries.structures.get(structure);
            const biomes = expand(isRecord(document) ? document.biomes : undefined);
            biomeCache.set(structure, biomes);
            return biomes;
        };

        this.sets = loadStructureSets(options.registries.structureSets, this.biomesOf, options.isPossibleBiome);

        for (const [id, document] of options.registries.structures) {
            const named = stepOf(isRecord(document) ? document.step : undefined);
            const list = this.byStep.get(named);
            if (list === undefined) this.byStep.set(named, [id]);
            else list.push(id);
        }
    }

    /**
     * The structures of a step, in the order Java seeds them.
     *
     * Every registered structure is counted, whether or not this world generates it, because
     * Java's index runs over the whole registry. The count is also the index the step's first
     * feature is seeded with, which is how structures and features share one counter.
     */
    public structuresInStep(step: DecorationStep): readonly string[] {
        return this.byStep.get(step) ?? [];
    }

    /** The structure types this server has no builder for. */
    public unbuiltTypes(): ReadonlySet<string> {
        return this.unbuilt;
    }

    /** The structure sets this dimension uses, which is what the placement scan runs over. */
    public usedSets(): readonly NamedStructureSet[] {
        return this.sets;
    }

    /**
     * Every start whose pieces reach into a chunk.
     *
     * The scan is Java's `createReferences` window: eight chunks in each direction, which is
     * what bounds how far a structure may spill from the chunk it started in.
     */
    public startsFor(chunkX: number, chunkZ: number): readonly StructureStart[] {
        const range = {
            minChunkX: chunkX - REFERENCE_RADIUS,
            minChunkZ: chunkZ - REFERENCE_RADIUS,
            maxChunkX: chunkX + REFERENCE_RADIUS,
            maxChunkZ: chunkZ + REFERENCE_RADIUS
        };

        const found: StructureStart[] = [];
        for (const named of this.sets) {
            for (const candidate of candidateChunksIn(named.set.placement, this.options.seed, range)) {
                const start = this.startAt(named, candidate.x, candidate.z);
                if (start !== null && boxTouchesChunk(start.boundingBox, chunkX, chunkZ)) found.push(start);
            }
        }

        return found;
    }

    /** The start a set produces in one chunk, laid out once and kept. */
    public startAt(named: NamedStructureSet, chunkX: number, chunkZ: number): StructureStart | null {
        const key = `${named.id}@${chunkX},${chunkZ}`;
        const cached = this.starts.get(key);
        if (cached !== undefined) return cached;

        const built = this.buildStart(named, chunkX, chunkZ);
        if (this.starts.size >= CACHE_LIMIT) this.starts.clear();
        this.starts.set(key, built);
        return built;
    }

    private buildStart(named: NamedStructureSet, chunkX: number, chunkZ: number): StructureStart | null {
        const structure = chooseStructure(named.set, this.options.seed, chunkX, chunkZ);
        if (structure === undefined) return null;

        const definition = this.options.registries.structures.get(structure);
        if (!isRecord(definition)) return null;

        const builder = this.options.builders.get(String(definition.type));
        if (builder === undefined) {
            this.unbuilt.add(String(definition.type));
            return null;
        }

        const layout = builder({
            id: structure,
            definition,
            chunkX,
            chunkZ,
            seed: this.options.seed,
            random: createLegacyRandom(structureRandomSeed(this.options.seed, chunkX, chunkZ)),
            level: this.options.level,
            templates: this.options.templates,
            pool: (identifier) => this.poolAt(identifier)
        });
        if (layout === undefined || layout.pieces.length === 0) return null;
        if (!this.biomeAllows(structure, layout.origin)) return null;

        return {
            structure,
            set: named.id,
            chunkX,
            chunkZ,
            step: stepOf(definition.step),
            terrainAdaptation: terrainAdaptationOf(definition.terrain_adaptation),
            boundingBox: unionOf(layout.pieces),
            pieces: layout.pieces,
            origin: layout.origin
        };
    }

    /** Java's `isValidBiome`: the biome at the generation point, read at quart resolution. */
    private biomeAllows(structure: string, origin: { x: number; y: number; z: number }): boolean {
        const biomes = this.biomesOf(structure);
        if (biomes.size === 0) return false;

        return biomes.has(this.options.level.noiseBiome(origin.x >> 2, origin.y >> 2, origin.z >> 2));
    }

    private poolAt(identifier: string): TemplatePool | undefined {
        if (this.pools.has(identifier)) return this.pools.get(identifier);

        const document = this.options.registries.templatePools.get(identifier);
        let pool: TemplatePool | undefined;
        try {
            pool = document === undefined ? undefined : parseTemplatePool(document);
        } catch {
            // Extracted game data: an unreadable pool closes that branch of the assembly rather
            // than failing the structure.
            pool = undefined;
        }

        this.pools.set(identifier, pool);
        return pool;
    }
}
