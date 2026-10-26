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
    /** How far out to look, in chunks. */
    readonly radiusInChunks: number;
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
    /** The generation point, in blocks. */
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

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
