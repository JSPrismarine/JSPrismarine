/**
 * Where a structure starts and what it is made of.
 *
 * Java's `ChunkGenerator.createStructures` asks every structure set whether a chunk is one of
 * its, draws the structure the set offers there, finds its generation point against the bare
 * terrain, and lays the structure out only if the biome at that point allows it.
 * `createReferences` then finds, for the chunk being generated, every start within eight chunks
 * whose box reaches into it. Both are here, with one cache in front of them, because a village is
 * laid out once and written into each of the dozen chunks it covers.
 *
 * Laying a structure out touches no chunk and writes nothing, so a start is a pure function of
 * the world seed and the chunk it starts in. That is what makes the cache safe and what makes
 * two neighboring chunks agree about the same village.
 *
 * @javaSee ChunkGenerator.createStructures
 */
import { performance } from 'node:perf_hooks';

import type { DecorationStep } from '@jsprismarine/features';
import { DECORATION_STEPS } from '@jsprismarine/features';
import type {
    BoundingBox,
    ChunkPosition,
    ConcentricRingsPlacement,
    RandomSource,
    RandomSpreadPlacement,
    RingPosition,
    StructurePlacement,
    TemplatePool
} from '@jsprismarine/structures';
import {
    concentricRingPositions,
    createLegacyRandom,
    isStructureChunk,
    parseStructureSet,
    parseTemplatePool,
    potentialStructureChunk
} from '@jsprismarine/structures';

import type { TerrainAdaptation } from './javaStructureBeard';
import { terrainAdaptationOf } from './javaStructureBeard';
import type { ChunkRange, NamedStructureSet } from './javaStructurePlacement';
import {
    CandidateChunkMemo,
    createTagExpander,
    loadStructureSets,
    findBiomeHorizontal,
    structureAttemptsAt
} from './javaStructurePlacement';
import { structureRandomSeed } from './javaStructurePlacement';
import type { StructureTemplateStore } from './javaStructureTemplatePiece';
import type { StructureLevel, StructurePiece, StructurePiecePlan } from './javaStructureWorld';
import {
    boxTouchesChunk,
    freezeStructurePlanData,
    structurePieceFromPlan,
    structurePiecePlanOf,
    unionOf
} from './javaStructureWorld';
import type { JavaWorldgenRegistries } from './javaWorldgenData';
import { isRecord } from '../../../utils/isRecord';
import { PrismarineGenerationErrors } from '@jsprismarine/errors/prismarine/generation';

/** How far Java looks for a start that reaches into the chunk being generated. */
const REFERENCE_RADIUS = 8;

/**
 * How many exclusion zones deep a placement check follows.
 *
 * A zone names another set whose own placement may carry a zone, and Java follows the chain
 * until it ends. No vanilla chain is longer than one; the cap only stops a datapack whose
 * sets exclude each other in a cycle, which overflows Java's stack.
 */
const MAX_EXCLUSION_DEPTH = 8;

/** How far from a drawn ring position, in blocks, Java looks for a biome the placement prefers. */
const RING_BIOME_SEARCH_RADIUS = 112;

/** How many chunks a ring position can move: the search radius, from the chunk's middle. */
const RING_MOVE_CHUNKS = Math.ceil((RING_BIOME_SEARCH_RADIUS + 8) / 16);

/** Every chunk, for a ring placement searched whole. */
const UNBOUNDED = {
    minChunkX: Number.NEGATIVE_INFINITY,
    minChunkZ: Number.NEGATIVE_INFINITY,
    maxChunkX: Number.POSITIVE_INFINITY,
    maxChunkZ: Number.POSITIVE_INFINITY
};

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
    /**
     * The biomes a `worldgen/biome` tag holds, given without its `#`. A builder whose Java
     * structure checks a biome tag reads it here; without it, as in a test with no registries,
     * the check is skipped.
     */
    readonly biomeTag?: (tag: string) => ReadonlySet<string>;
}

/**
 * What a builder produced: the point the biome check is made at, and the pieces, deferred.
 *
 * This is Java's `Structure$GenerationStub`, which pairs a position with a
 * `Consumer<StructurePiecesBuilder>` that `Structure.generate` runs only once
 * `findValidGenerationPoint` has accepted the biome at that position. A structure drawn into a
 * biome that refuses it is therefore never assembled, and {@link StructureLayout.pieces} being a
 * call rather than a field is what keeps that true here.
 */
export interface StructureLayout {
    /** Java's generation point, which is also what `/locate` reports. */
    readonly origin: { readonly x: number; readonly y: number; readonly z: number };
    /**
     * Assembles the pieces, which is Java's `GenerationStub.getPiecesBuilder`.
     *
     * Called at most once per layout, and never before the biome at {@link StructureLayout.origin}
     * has been accepted. A builder may keep drawing from {@link StructureBuildContext.random}
     * inside it: nothing touches that stream between the two, so the draws land in Java's order.
     *
     * @javaSource Structure$GenerationStub.getPiecesBuilder
     */
    readonly pieces: () => readonly StructurePiece[];
}

/**
 * Lays one structure type out, as far as its generation point.
 *
 * Returns undefined when the structure cannot start here at all. A structure that places its
 * start but then assembles nothing answers an empty {@link StructureLayout.pieces} instead,
 * which Java reports the same way through `StructureStart.isValid`.
 */
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
    /**
     * Java's `StructurePlacement.getLocatePos`: the start chunk's corner moved by the set's
     * `locate_offset`, which is the position `/locate` reports and an eye of ender flies to.
     *
     * The y is the offset's own, 0 for every vanilla set; Java prints it as `~`.
     *
     * @javaSource StructurePlacement.getLocatePos
     */
    readonly locatePosition: { readonly x: number; readonly y: number; readonly z: number };
}

/** One candidate start identified without assembling its pieces. */
export interface StructureStartCandidate {
    /** The structure set that offered the candidate chunk. */
    readonly set: string;
    /** The candidate start chunk x. */
    readonly chunkX: number;
    /** The candidate start chunk z. */
    readonly chunkZ: number;
}

/** Structured-clone-safe layout data for one accepted structure start. */
export type StructureStartPlan = Omit<StructureStart, 'pieces'> & {
    /** Piece data in Java's placement order, without worker-local methods or references. */
    readonly pieces: readonly StructurePiecePlan[];
};

/** A candidate result, including a cached rejection so another worker does not rebuild it. */
export interface StructureStartPlanEntry extends StructureStartCandidate {
    /** Null records the same rejected/empty result as the source cache. */
    readonly start: StructureStartPlan | null;
}

/** What {@link StructureStartSource.locate} is asked to find. */
export interface StructureSearchOptions {
    /** The chunk the search radiates out from. */
    readonly originChunkX: number;
    readonly originChunkZ: number;
    /**
     * The block the search is made from, which distances are measured to. Defaults to the
     * origin chunk's corner at y 0.
     */
    readonly origin?: { readonly x: number; readonly y: number; readonly z: number };
    /**
     * How far out to look, in rings of placement regions, which is how Java's `/locate` counts
     * its radius of 100. A random spread set spaced 34 chunks apart is searched 3400 chunks out;
     * a concentric ring placement is searched whole.
     */
    readonly radius: number;
    /**
     * Whether a structure identifier is one the caller is looking for.
     *
     * A predicate rather than a list so a tag, which is how `/locate` names a group of them,
     * does not have to be flattened before the search starts.
     */
    readonly wanted: (structure: string) => boolean;
    /**
     * Whether to pass over a start the search would otherwise answer, by its structure and start
     * chunk. An explorer map passes over a structure an earlier map already points at.
     */
    readonly skip?: (structure: string, chunkX: number, chunkZ: number) => boolean;
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
    /** Called for every worker-local start-cache miss, before `StructureStartSource.buildStart`. */
    readonly onBuildStart?: (set: string, chunkX: number, chunkZ: number, elapsedMs: number) => void;
}

/** The step a structure document names, defaulting to the one 44 of the 52 carry. */
const stepOf = (value: unknown): DecorationStep =>
    DECORATION_STEPS.find((candidate) => candidate === value) ?? 'surface_structures';

/**
 * The structure starts a world has, for one seed.
 *
 * One of these covers one dimension of one world. It is built once and asked per chunk.
 */
export class StructureStartSource {
    private readonly sets: readonly NamedStructureSet[];
    private readonly setsById: ReadonlyMap<string, NamedStructureSet>;
    private readonly biomesOf: (structure: string) => ReadonlySet<string>;
    private readonly biomeTag: (tag: string) => ReadonlySet<string>;
    private readonly pools = new Map<string, TemplatePool | undefined>();
    private readonly placements = new Map<string, StructurePlacement | undefined>();
    /** Each ring placement's drawn positions, and where each has moved once a range asked. */
    private readonly rings = new Map<
        ConcentricRingsPlacement,
        { positions: readonly RingPosition[]; moved: ChunkPosition[]; preferred: ReadonlySet<string> }
    >();
    private readonly starts = new Map<string, StructureStart | null>();
    private readonly startsByChunk = new Map<string, readonly StructureStart[]>();
    private readonly candidates: CandidateChunkMemo;

    /** The structures of each step, in registry order, which is the order Java seeds them in. */
    private readonly byStep = new Map<DecorationStep, string[]>();

    /** The structure types no builder is registered for, which the caller may want to report. */
    private readonly unbuilt = new Set<string>();

    public constructor(private readonly options: StructureStartOptions) {
        const expand = createTagExpander(options.registries.biomeTags);
        this.biomeTag = (tag) => expand(`#${tag}`);
        this.candidates = new CandidateChunkMemo(options.seed, (placement, range) =>
            this.ringChunksIn(placement, range, expand)
        );
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
        this.setsById = new Map(this.sets.map((named) => [named.id, named]));

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
     * Candidate starts that may be queried while generating a rectangular chunk region.
     *
     * Every target chunk queries the eight-chunk reference window around it. Expanding the
     * requested region by that radius produces the exact union, so callers can plan starts before
     * dispatch without assembling any layout on the coordinator thread.
     * @param minChunkX - Minimum target chunk x.
     * @param minChunkZ - Minimum target chunk z.
     * @param maxChunkX - Maximum target chunk x.
     * @param maxChunkZ - Maximum target chunk z.
     * @returns Candidates in the union of all target chunks' reference windows.
     */
    public candidatesForRegion(
        minChunkX: number,
        minChunkZ: number,
        maxChunkX: number,
        maxChunkZ: number
    ): readonly StructureStartCandidate[] {
        const range = {
            minChunkX: minChunkX - REFERENCE_RADIUS,
            minChunkZ: minChunkZ - REFERENCE_RADIUS,
            maxChunkX: maxChunkX + REFERENCE_RADIUS,
            maxChunkZ: maxChunkZ + REFERENCE_RADIUS
        };
        const candidates: StructureStartCandidate[] = [];
        for (const named of this.sets) {
            for (const candidate of this.candidates.in(named.set.placement, range)) {
                candidates.push({ set: named.id, chunkX: candidate.x, chunkZ: candidate.z });
            }
        }
        return candidates;
    }

    /**
     * Builds the requested starts and returns their cloneable plans, caching positive and negative results.
     * @param candidates - Candidate starts assigned to this worker.
     * @returns One plan or rejection record for each candidate.
     */
    public plansForCandidates(candidates: readonly StructureStartCandidate[]): readonly StructureStartPlanEntry[] {
        return candidates.map((candidate) => {
            const named = this.setsById.get(candidate.set);
            if (named === undefined) throw new PrismarineGenerationErrors.UnknownStructureSet({ set: candidate.set });
            const start = this.startAt(named, candidate.chunkX, candidate.chunkZ);
            const entry: StructureStartPlanEntry = {
                ...candidate,
                start: start === null ? null : this.planOf(start)
            };
            freezeStructurePlanData(entry);
            return entry;
        });
    }

    /**
     * Installs worker-produced plans before a chunk task starts asking for structure references.
     * @param entries - Plans or rejection records returned by owner workers.
     */
    public installPlans(entries: readonly StructureStartPlanEntry[]): void {
        for (const entry of entries) {
            const key = `${entry.set}@${entry.chunkX},${entry.chunkZ}`;
            if (
                entry.start !== null &&
                (entry.start.set !== entry.set ||
                    entry.start.chunkX !== entry.chunkX ||
                    entry.start.chunkZ !== entry.chunkZ)
            ) {
                throw new PrismarineGenerationErrors.StructureStartMismatch({ key });
            }
            if (this.starts.has(key)) continue;
            if (!this.setsById.has(entry.set))
                throw new PrismarineGenerationErrors.UnknownStructureSet({ set: entry.set });
            // structuredClone does not preserve Object.freeze. Re-freeze each worker message
            // before decoded pieces retain references to its nested layout fields.
            freezeStructurePlanData(entry);
            const start = entry.start === null ? null : this.startFromPlan(entry.start);
            if (this.starts.size >= CACHE_LIMIT) this.starts.clear();
            this.starts.set(key, start);
        }
    }

    /**
     * The structure Java's `/locate` answers, or undefined when the search radius held none.
     *
     * This is Java's `ChunkGenerator.findNearestMapStructure`. It is not always the nearest start:
     * a random spread placement is walked one ring of regions at a time, each ring answers the
     * first start in scan order, and the first ring with an answer ends the search. A start in
     * the next ring can be nearer than the one answered, and Java answers the same.
     *
     * Each region offers one candidate chunk, so the command's hundred rings ask about forty
     * thousand positions rather than the millions of chunks they cover, and only a candidate the
     * walk reaches is laid out. Nothing here touches a chunk, so this costs no terrain and writes
     * nothing.
     *
     * @param options - Where to search from, how far, and which structures count.
     * @returns The start, or undefined when nothing matched inside the radius.
     * @javaSource ChunkGenerator.findNearestMapStructure
     */
    public locate(options: StructureSearchOptions): StructureStart | undefined {
        const { originChunkX, originChunkZ, radius } = options;
        const origin = options.origin ?? { x: originChunkX * 16, y: 0, z: originChunkZ * 16 };
        const distanceTo = (x: number, y: number, z: number): number =>
            (x - origin.x) ** 2 + (y - origin.y) ** 2 + (z - origin.z) ** 2;

        // A set none of whose structures are wanted cannot answer, and skipping it here is what
        // keeps the scan to the one or two sets a `/locate` names.
        const sets = this.sets.filter((named) => named.set.structures.some((entry) => options.wanted(entry.structure)));

        /** Java's `getStructureGeneratingAt`: the wanted start a placement chunk holds, if any. */
        const generatingAt = (named: NamedStructureSet, chunk: ChunkPosition): StructureStart | undefined => {
            const start = this.startAt(named, chunk.x, chunk.z);
            if (start === null || !options.wanted(start.structure)) return undefined;
            return options.skip?.(start.structure, start.chunkX, start.chunkZ) === true ? undefined : start;
        };

        let best: StructureStart | undefined;
        let bestDistance = Number.POSITIVE_INFINITY;

        // A ring placement is searched whole, by the distance to the middle of each ring chunk at
        // y 32. A chunk no nearer than the best so far is not laid out at all.
        for (const named of sets) {
            const placement = named.set.placement;
            if (placement.type !== 'minecraft:concentric_rings') continue;
            for (const chunk of this.candidates.in(placement, UNBOUNDED)) {
                const distance = distanceTo(chunk.x * 16 + 8, 32, chunk.z * 16 + 8);
                if (best !== undefined && distance >= bestDistance) continue;
                const start = generatingAt(named, chunk);
                if (start === undefined) continue;
                best = start;
                bestDistance = distance;
            }
        }

        // A random spread placement is walked one ring of regions at a time, and the first ring in
        // which any set holds a start ends the search. Within a ring each set answers the first
        // start in its scan order, not its nearest, and the answers compete by distance.
        const spreads = sets.flatMap((named) =>
            named.set.placement.type === 'minecraft:random_spread' ? [{ named, placement: named.set.placement }] : []
        );
        for (let ring = 0; ring <= radius && spreads.length > 0; ring++) {
            let found = false;
            for (const { named, placement } of spreads) {
                const start = this.firstInRing(named, placement, originChunkX, originChunkZ, ring, generatingAt);
                if (start === undefined) continue;
                found = true;
                const at = start.locatePosition;
                const distance = distanceTo(at.x, at.y, at.z);
                if (distance < bestDistance) {
                    best = start;
                    bestDistance = distance;
                }
            }
            if (found) return best;
        }

        return best;
    }

    /**
     * The first start one ring of a random spread placement's regions holds, in Java's scan order.
     *
     * The ring is the regions `ring` steps out from the origin's, x then z, and each step is the
     * placement's spacing added to the origin chunk, not a region boundary.
     *
     * @javaSource ChunkGenerator.getNearestGeneratedStructure(Ljava/util/Set;Lnet/minecraft/world/level/LevelReader;Lnet/minecraft/world/level/StructureManager;IIIZJLnet/minecraft/world/level/levelgen/structure/placement/RandomSpreadStructurePlacement;)Lcom/mojang/datafixers/util/Pair;
     */
    private firstInRing(
        named: NamedStructureSet,
        placement: RandomSpreadPlacement,
        originChunkX: number,
        originChunkZ: number,
        ring: number,
        generatingAt: (named: NamedStructureSet, chunk: ChunkPosition) => StructureStart | undefined
    ): StructureStart | undefined {
        const seed = this.options.seed;
        for (let stepX = -ring; stepX <= ring; stepX++) {
            const edgeX = stepX === -ring || stepX === ring;
            for (let stepZ = -ring; stepZ <= ring; stepZ++) {
                if (!edgeX && stepZ !== -ring && stepZ !== ring) continue;
                const chunk = potentialStructureChunk(
                    placement,
                    seed,
                    originChunkX + placement.spacing * stepX,
                    originChunkZ + placement.spacing * stepZ
                );
                // Java's `StructureCheck` applies the frequency rule before it looks further.
                if (!isStructureChunk(placement, seed, chunk.x, chunk.z)) continue;
                const start = generatingAt(named, chunk);
                if (start !== undefined) return start;
            }
        }
        return undefined;
    }

    /**
     * Where a concentric rings placement's structures start in a range: each drawn position,
     * moved to a chunk whose biome the placement prefers when one lies within 112 blocks of its
     * middle.
     *
     * A move is a biome search over 3249 cells, so a position is moved only when a range it
     * could land in asks for it, and the answer is kept. Generating a chunk asks for the few
     * strongholds near it rather than all 128.
     *
     * @javaSource ChunkGeneratorStructureState.lambda$generateRingPositions$0
     */
    private ringChunksIn(
        placement: ConcentricRingsPlacement,
        range: ChunkRange,
        expand: (spec: unknown) => ReadonlySet<string>
    ): ChunkPosition[] {
        let ring = this.rings.get(placement);
        if (ring === undefined) {
            ring = {
                positions: concentricRingPositions(placement, this.options.seed),
                moved: [],
                preferred: expand(placement.preferredBiomes)
            };
            this.rings.set(placement, ring);
        }
        const { positions, moved, preferred } = ring;
        const noiseBiome = (x: number, y: number, z: number): string => this.options.level.noiseBiome(x, y, z);

        // Two positions can move to the same chunk, which starts one structure.
        const found = new Map<string, ChunkPosition>();
        positions.forEach(({ x, z, random }, index) => {
            if (
                x < range.minChunkX - RING_MOVE_CHUNKS ||
                x > range.maxChunkX + RING_MOVE_CHUNKS ||
                z < range.minChunkZ - RING_MOVE_CHUNKS ||
                z > range.maxChunkZ + RING_MOVE_CHUNKS
            ) {
                return;
            }
            let chunk = moved[index];
            if (chunk === undefined) {
                const cell = findBiomeHorizontal(
                    x * 16 + 8,
                    0,
                    z * 16 + 8,
                    RING_BIOME_SEARCH_RADIUS,
                    (biome) => preferred.has(biome),
                    random,
                    noiseBiome
                );
                chunk = cell === undefined ? { x, z } : { x: cell.x >> 4, z: cell.z >> 4 };
                moved[index] = chunk;
            }
            if (
                chunk.x >= range.minChunkX &&
                chunk.x <= range.maxChunkX &&
                chunk.z >= range.minChunkZ &&
                chunk.z <= range.maxChunkZ
            ) {
                found.set(`${chunk.x},${chunk.z}`, chunk);
            }
        });
        return [...found.values()];
    }

    /**
     * Every start whose pieces reach into a chunk.
     *
     * The scan is Java's `createReferences` window: eight chunks in each direction, which is
     * what bounds how far a structure may spill from the chunk it started in.
     */
    public startsFor(chunkX: number, chunkZ: number): readonly StructureStart[] {
        const key = `${chunkX},${chunkZ}`;
        const cached = this.startsByChunk.get(key);
        if (cached !== undefined) return cached;

        const range = {
            minChunkX: chunkX - REFERENCE_RADIUS,
            minChunkZ: chunkZ - REFERENCE_RADIUS,
            maxChunkX: chunkX + REFERENCE_RADIUS,
            maxChunkZ: chunkZ + REFERENCE_RADIUS
        };

        const found: StructureStart[] = [];
        for (const named of this.sets) {
            for (const candidate of this.candidates.in(named.set.placement, range)) {
                const start = this.startAt(named, candidate.x, candidate.z);
                if (start !== null && boxTouchesChunk(start.boundingBox, chunkX, chunkZ)) found.push(start);
            }
        }

        if (this.startsByChunk.size >= CACHE_LIMIT) this.startsByChunk.clear();
        this.startsByChunk.set(key, found);
        return found;
    }

    /** The start a set produces in one chunk, laid out once and kept. */
    public startAt(named: NamedStructureSet, chunkX: number, chunkZ: number): StructureStart | null {
        const key = `${named.id}@${chunkX},${chunkZ}`;
        const cached = this.starts.get(key);
        if (cached !== undefined) return cached;

        let built: StructureStart | null;
        if (this.options.onBuildStart === undefined) {
            built = this.buildStart(named, chunkX, chunkZ);
        } else {
            const started = performance.now();
            try {
                built = this.buildStart(named, chunkX, chunkZ);
            } finally {
                // Observe cache misses, including rejected starts, rather than only successful layouts.
                this.options.onBuildStart(named.id, chunkX, chunkZ, performance.now() - started);
            }
        }
        if (this.starts.size >= CACHE_LIMIT) this.starts.clear();
        this.starts.set(key, built);
        return built;
    }

    private buildStart(named: NamedStructureSet, chunkX: number, chunkZ: number): StructureStart | null {
        if (this.excludedAt(named.set.placement, chunkX, chunkZ, 0)) return null;

        // Java's `createStructures`: a structure that cannot start here, most often because the
        // biome at its generation point refuses it, hands the chunk to the next one the set
        // draws. Sets of biome variants rely on it: a chunk outside the badlands that draws the
        // badlands mineshaft gets the normal one, and an ocean chunk that draws a beached
        // shipwreck gets a sunken one.
        for (const structure of structureAttemptsAt(named.set, this.options.seed, chunkX, chunkZ)) {
            const start = this.tryStructure(named, structure, chunkX, chunkZ);
            if (start !== null) return start;
        }
        return null;
    }

    /**
     * Whether a placement's exclusion zone keeps a structure out of a chunk.
     *
     * Java forbids the chunk when the zone's other set could start a structure within
     * `chunk_count` chunks of it. That is the other set's placement alone, biome and layout
     * aside, which is how a pillager outpost stays ten chunks clear of where a village could
     * have been.
     *
     * @javaSource ChunkGeneratorStructureState.hasStructureChunkInRange
     */
    private excludedAt(placement: StructurePlacement, chunkX: number, chunkZ: number, depth: number): boolean {
        const zone = placement.exclusionZone;
        if (zone === undefined || depth >= MAX_EXCLUSION_DEPTH) return false;

        const other = this.placementOf(zone.otherSet);
        if (other === undefined) return false;

        const range = {
            minChunkX: chunkX - zone.chunkCount,
            minChunkZ: chunkZ - zone.chunkCount,
            maxChunkX: chunkX + zone.chunkCount,
            maxChunkZ: chunkZ + zone.chunkCount
        };
        return this.candidates
            .in(other, range)
            .some((candidate) => !this.excludedAt(other, candidate.x, candidate.z, depth + 1));
    }

    /**
     * The placement of any registered structure set, used or not.
     *
     * An exclusion zone names its set through the registry, so a set this dimension drops still
     * clears the zone around where it would have placed.
     */
    private placementOf(id: string): StructurePlacement | undefined {
        const used = this.setsById.get(id);
        if (used !== undefined) return used.set.placement;
        if (this.placements.has(id)) return this.placements.get(id);

        let placement: StructurePlacement | undefined;
        try {
            const document = this.options.registries.structureSets.get(id);
            placement = document === undefined ? undefined : parseStructureSet(document).placement;
        } catch {
            // Extracted game data, as in `loadStructureSets`: a set that cannot be read excludes nothing.
            placement = undefined;
        }
        this.placements.set(id, placement);
        return placement;
    }

    /** One attempt of Java's `tryGenerateStructure`: the start, or null when it cannot start here. */
    private tryStructure(
        named: NamedStructureSet,
        structure: string,
        chunkX: number,
        chunkZ: number
    ): StructureStart | null {
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
            pool: (identifier) => this.poolAt(identifier),
            biomeTag: this.biomeTag
        });
        if (layout === undefined) return null;

        // Java's order, from `Structure.generate`: `findValidGenerationPoint` filters the stub by
        // the biome at its position, and only the stub that survives has its pieces built. The
        // rejected ones are the overwhelming majority, and assembling them first is what made
        // structure layout the most expensive part of generating a chunk.
        if (!this.biomeAllows(structure, layout.origin)) return null;

        const pieces = layout.pieces();
        if (pieces.length === 0) return null;

        return {
            structure,
            set: named.id,
            chunkX,
            chunkZ,
            step: stepOf(definition.step),
            terrainAdaptation: terrainAdaptationOf(definition.terrain_adaptation),
            boundingBox: unionOf(pieces),
            pieces,
            origin: layout.origin,
            locatePosition: {
                x: chunkX * 16 + named.set.placement.locateOffset[0],
                y: named.set.placement.locateOffset[1],
                z: chunkZ * 16 + named.set.placement.locateOffset[2]
            }
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

    private planOf(start: StructureStart): StructureStartPlan {
        const plan: StructureStartPlan = structuredClone({
            structure: start.structure,
            set: start.set,
            chunkX: start.chunkX,
            chunkZ: start.chunkZ,
            step: start.step,
            terrainAdaptation: start.terrainAdaptation,
            boundingBox: start.boundingBox,
            pieces: start.pieces.map(structurePiecePlanOf),
            origin: start.origin,
            locatePosition: start.locatePosition
        });
        freezeStructurePlanData(plan);
        return plan;
    }

    private startFromPlan(plan: StructureStartPlan): StructureStart {
        return {
            structure: plan.structure,
            set: plan.set,
            chunkX: plan.chunkX,
            chunkZ: plan.chunkZ,
            step: plan.step,
            terrainAdaptation: plan.terrainAdaptation,
            boundingBox: plan.boundingBox,
            pieces: plan.pieces.map((piece) => structurePieceFromPlan(piece, { templates: this.options.templates })),
            origin: plan.origin,
            locatePosition: plan.locatePosition
        };
    }
}
