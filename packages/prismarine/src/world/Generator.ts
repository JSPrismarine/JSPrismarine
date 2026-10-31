import type { GenerationPriority } from '@jsprismarine/chunkgen';

import type { WorldConfig } from './World';
import type Chunk from './chunk/Chunk';

/**
 * How a generator refuses a chunk once {@link Generator.stopGenerating} has been called.
 *
 * Its own class so a caller can tell a shutdown apart from a chunk that genuinely could not be
 * generated. Those are the same `Error` otherwise, and the start region has to report one and
 * re-throw the other.
 */
export class GenerationStopped extends Error {
    /**
     * @param cx - Chunk x of the request that was refused.
     * @param cz - Chunk z of the request that was refused.
     */
    public constructor(cx: number, cz: number) {
        super(`Chunk ${cx},${cz} was not generated: the generator has stopped`);
        this.name = 'GenerationStopped';
    }
}

/**
 * The topmost block of a column, as {@link Generator.surfaceAt} reports it.
 *
 * Undefined when the column holds nothing at all, which is what an empty dimension answers
 * everywhere and a generated one answers nowhere.
 */
export type SurfaceProbe = { readonly y: number; readonly name: string } | undefined;

/**
 * What a structure search was asked for.
 *
 * The origin is in blocks because that is what a player's position is; the radius is in chunks
 * because that is the unit a structure set is spaced in.
 */
export interface StructureSearchRequest {
    readonly x: number;
    readonly z: number;
    /**
     * How far out to look, in rings of placement regions, which is how Java's `/locate` and eye
     * of ender count their radius of 100. A village set spaced 34 chunks apart is reached 3400
     * chunks out; a concentric ring placement such as the strongholds' is searched whole.
     */
    readonly radius: number;
    /**
     * Whether a structure identifier is one the caller wants.
     *
     * A predicate so a caller naming a tag does not have to flatten it first, and so a search
     * for "any village" costs the same as one for a single identifier.
     */
    readonly wanted: (structure: string) => boolean;
    readonly seed?: bigint;
}

/** Where a structure search found something. */
export interface StructureSearchResult {
    /** The structure identifier, for example `minecraft:village_plains`. */
    readonly structure: string;
    /**
     * Java's locate position, in blocks: the start chunk's corner moved by the structure set's
     * `locate_offset`. It is what `/locate` reports and what an eye of ender flies toward, and
     * its y is the offset's own, 0 for every vanilla set, which Java prints as `~`.
     */
    readonly x: number;
    readonly y: number;
    readonly z: number;
    /** The generation point, where the structure's layout started and its biome was checked. */
    readonly origin: { readonly x: number; readonly y: number; readonly z: number };
}

/** What a biome search asks a generator; see {@link Generator.locateBiome}. */
export interface BiomeSearchRequest {
    /** Where to search from, in blocks. */
    readonly x: number;
    readonly y: number;
    readonly z: number;
    /** How far out to look, in blocks, as a square around the origin. Java's `/locate biome` uses 6400. */
    readonly radius: number;
    /** Blocks between two columns of the sampling grid; Java's 32. */
    readonly horizontalStep: number;
    /** Blocks between two samples of a column; Java's 64. */
    readonly verticalStep: number;
    /** Whether a biome identifier is one the caller wants, so a tag costs the same as one biome. */
    readonly wanted: (biome: string) => boolean;
    readonly seed?: bigint;
}

/** Where a biome search found a cell; see {@link Generator.locateBiome}. */
export interface BiomeSearchResult {
    /** The biome identifier, for example `minecraft:plains`. */
    readonly biome: string;
    /** The sampled position, in blocks. */
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/** The tag registries a `/locate` name may draw on; see {@link Generator.membersOfTag}. */
export type LocateTagRegistry = 'worldgen/structure' | 'worldgen/biome';

/** A block position in a generator's world. */
export interface GeneratorPosition {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/** How a chunk request is scheduled against every other outstanding one. */
export interface ChunkRequestOptions {
    /**
     * How badly the chunk is wanted, which decides its turn when the generator is busy.
     *
     * Defaults to `immediate`, so a caller that has not thought about it waits the way it
     * always did. See {@link GenerationPriority}.
     */
    readonly urgency?: GenerationPriority;
}

export interface Generator {
    /**
     * This function should return the generated chunk by given parameters.
     *
     * @param options - How the request is scheduled. A generator that answers one at a time
     * may ignore it; a pooled one orders its backlog by it.
     */
    generateChunk(
        cx: number,
        cz: number,
        seed?: bigint,
        config?: WorldConfig,
        options?: ChunkRequestOptions
    ): Promise<Chunk>;

    /**
     * The topmost block of one column, without generating the chunk it is in.
     *
     * The answer comes from the bare terrain: no surface rule has run and nothing has decorated,
     * so a flooded column reads as water and a wooded one reads as the ground under the trees
     * rather than as a canopy. That is Java's `ChunkGenerator.getBaseHeight`, and it is what a
     * spawn search wants - whether a player can stand here is a question about the land, and
     * answering it by generating a finished chunk costs four orders of magnitude more.
     *
     * Optional, because a generator with no cheaper answer than its own chunks has nothing to
     * add here and a caller falls back to generating one.
     */
    surfaceAt?(x: number, z: number, seed?: bigint): SurfaceProbe;

    /**
     * The y this generator floods to, Java's `ChunkGenerator.getSeaLevel`.
     *
     * A noise generator answers its settings' `sea_level`; the flat generator answers Java's
     * -63. Optional, because a generator with no water line of its own has nothing to say and
     * the world then assumes the Overworld's 63, which is what Java's debug generator answers.
     */
    readonly seaLevel?: number;

    /**
     * Says that a chunk already asked for is wanted more than it was.
     *
     * A chunk is requested once and waited on by everybody who wants it, so the band it was
     * given is whoever asked first. A rim chunk queued as `idle` is the chunk a player is
     * standing on a moment later, and nothing else would move it up.
     *
     * Only affects a request still waiting for a worker. One already being built finishes at
     * the speed it was going to finish at either way.
     *
     * Optional, because a generator with no queue has no turn to move.
     *
     * @param cx - Chunk x of the request.
     * @param cz - Chunk z of the request.
     * @param urgency - The band to move it into. Never lowers one.
     */
    raiseUrgency?(cx: number, cz: number, urgency: GenerationPriority): void;

    /**
     * The nearest structure a search accepts, without generating anything.
     *
     * This is what `/locate` asks. A structure's position is a function of the seed and the
     * placement grid alone, so the answer comes from laying candidates out against the bare
     * noise terrain: no chunk is built, nothing is written, and a search over thousands of
     * blocks costs a few hundred layout attempts rather than thousands of chunks.
     *
     * Synchronous, like {@link Generator.surfaceAt} and for the same reason: the command layer
     * that asks is synchronous, and the work is arithmetic rather than a chunk.
     *
     * Optional, because a generator that places no structures has nothing to find.
     *
     * @param request - Where to search from, how far, and which structures count.
     * @returns The nearest match, or undefined when the radius held none.
     */
    locate?(request: StructureSearchRequest): StructureSearchResult | undefined;

    /**
     * The nearest cell of a biome a search accepts, without generating anything.
     *
     * This is what `/locate biome` asks: Java's `BiomeSource.findClosestBiome3d`, a grid laid
     * over the climate sampler and walked outward from the origin. Synchronous for the same
     * reason {@link Generator.locate} is.
     *
     * Optional, because a generator with no biome source of its own has nothing to walk.
     *
     * @returns The first grid cell met that holds a wanted biome, or undefined when the radius
     * held none or no wanted biome can occur in this dimension.
     */
    locateBiome?(request: BiomeSearchRequest): BiomeSearchResult | undefined;

    /**
     * The identifiers a `#tag` of one registry names, which is how `/locate structure
     * #minecraft:village` and an eye of ender's `#minecraft:eye_of_ender_located` are read.
     *
     * Optional, because only a generator built from Java's data carries its tags.
     *
     * @param tag - The tag's identifier without the `#`, for example `minecraft:village`.
     * @returns The members, or undefined when the generator knows no tag by that name.
     */
    membersOfTag?(registry: LocateTagRegistry, tag: string): ReadonlySet<string> | undefined;

    /**
     * Every identifier and `#tag` a `/locate` of one kind may name, for its suggestions.
     *
     * Registry-wide rather than per dimension, as Java's suggestions are: a Nether player is
     * offered `minecraft:village_plains` and told it is not nearby.
     *
     * Optional, because a generator without Java's registries has nothing to suggest beyond
     * Mojang's published list.
     */
    locatableNames?(kind: 'structure' | 'biome'): readonly string[];

    /**
     * Whether Java structure spawn overrides reserve an entity type at one position.
     *
     * Generators without Java structure data omit the query. A generator with Java data returns
     * `undefined` for an entity that also appears in Java's biome spawn tables or has no
     * structure override. Structure-only entities return `false` outside matching overrides and
     * `true` inside one.
     *
     * @param identifier - The Bedrock entity identifier used by the live spawner.
     * @param at - The entity's candidate spawn position in blocks.
     * @param seed - The world seed used to lay out structures.
     */
    structureSpawnOverrideAt?(identifier: string, at: GeneratorPosition, seed?: bigint): boolean | undefined;

    /**
     * Gives up every chunk request that has not started yet, for a server that is shutting down.
     *
     * A generator that answers one request at a time holds a queue, and a start region fills
     * that queue thirty-two chunks at a time. Waiting for it to drain means a shutdown spends
     * seconds generating terrain that the save it is about to run will not even look at. The
     * request that is already running finishes, so no half-generated chunk is handed back;
     * everything behind it rejects with {@link GenerationStopped}.
     *
     * Optional, because a generator that answers immediately has no queue to give up.
     */
    stopGenerating?(): void;
}
