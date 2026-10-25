/**
 * What one chunk carries as it climbs the generation ladder.
 *
 * `@jsprismarine/chunkgen` drives the ladder and holds one of these per chunk. It is this
 * generator's answer to Java's `ProtoChunk`, and it keeps the region rather than a flat palette
 * because every stage above the chunk storage speaks Java block states with properties: the noise
 * fill, the surface rules, the carvers, the structure pieces and the features. Encoding those into
 * a string palette on the way into each status and decoding them on the way out would cost two
 * translations per status to buy a representation nothing on this thread reads.
 */
import type { ChunkStatus, StagedChunk } from '@jsprismarine/chunkgen';
import { isOrAfter } from '@jsprismarine/chunkgen';

import type Chunk from '../../chunk/Chunk';
import type { GenerationRegion, RegionChunkPatch } from './GenerationRegion';

/** Raised when a status body reads a part of the chunk the status below it never wrote. */
export class MissingGenerationStateError extends Error {
    public override name = 'MissingGenerationStateError';

    public constructor(chunkX: number, chunkZ: number, what: string, status: ChunkStatus) {
        super(`The chunk at ${chunkX}, ${chunkZ} has no ${what} at ${status}, so a status body ran out of order.`);
    }
}

/** Raised when a chunk is asked to move to a status at or below the one it already holds. */
export class GenerationChunkRegressionError extends Error {
    public override name = 'GenerationChunkRegressionError';

    public constructor(
        public readonly from: ChunkStatus,
        public readonly to: ChunkStatus
    ) {
        super(`A chunk at ${from} cannot advance to ${to}: a status body runs once and never runs backward.`);
    }
}

/**
 * The state the statuses of one chunk hand each other.
 *
 * Three things live here and each belongs to exactly one status.
 *
 * `terrain` leaves the terrain tile, which is a radius-0 region holding the noise fill, the surface
 * materials and the carvers. Nothing ever writes into it again. That is the whole of the fix: the
 * old generator replayed cross-border feature output into terrain it had cached, so a tile's
 * contents depended on which chunks had been decorated since it was built.
 *
 * `features` leaves the writes the decoration pass made, split by the chunk each one landed in.
 * Its own chunk's share is {@link GenerationChunk.ownFeatureWrites}; the other eight are collected
 * by whichever neighbor is being promoted, through {@link GenerationChunk.featureWritesInto}.
 *
 * `full` leaves the Bedrock chunk. Once it exists the generator hands out that object and never
 * changes it again, which is the other half of what the old generator got wrong.
 */
export class GenerationChunk implements StagedChunk {
    private persistedStatus: ChunkStatus = 'empty';
    private terrainTile: GenerationRegion | undefined;
    private ownWrites: RegionChunkPatch | undefined;
    private outbound: ReadonlyMap<string, RegionChunkPatch> = new Map();
    private finished: Chunk | undefined;

    public constructor(
        public readonly chunkX: number,
        public readonly chunkZ: number
    ) {}

    /** @inheritDoc */
    public get status(): ChunkStatus {
        return this.persistedStatus;
    }

    /** @inheritDoc */
    public advanceTo(status: ChunkStatus): void {
        if (isOrAfter(this.persistedStatus, status)) {
            throw new GenerationChunkRegressionError(this.persistedStatus, status);
        }
        this.persistedStatus = status;
    }

    /**
     * The terrain tile, which is what a neighbor's feature pass reads.
     *
     * @throws MissingGenerationStateError when `terrain` has not run on this chunk.
     */
    public get terrain(): GenerationRegion {
        if (this.terrainTile === undefined) {
            throw new MissingGenerationStateError(this.chunkX, this.chunkZ, 'terrain tile', this.persistedStatus);
        }
        return this.terrainTile;
    }

    /** The Bedrock chunk `full` built, or undefined before it has run. */
    public get bedrockChunk(): Chunk | undefined {
        return this.finished;
    }

    /** What the chunk's own feature pass wrote into its own columns, or undefined when nothing did. */
    public get ownFeatureWrites(): RegionChunkPatch | undefined {
        return this.ownWrites;
    }

    /** Records the finished terrain tile. Called once, by the `terrain` body. */
    public recordTerrain(tile: GenerationRegion): void {
        this.terrainTile = tile;
    }

    /**
     * Records what the decoration pass wrote, split by the chunk each write landed in.
     *
     * @param patches - One patch per chunk written to, keyed `<chunkX>,<chunkZ>`. The entry for
     * this chunk becomes {@link GenerationChunk.ownFeatureWrites} and the rest wait for their
     * target to be promoted.
     */
    public recordFeatures(patches: ReadonlyMap<string, RegionChunkPatch>): void {
        this.ownWrites = patches.get(`${this.chunkX},${this.chunkZ}`);
        this.outbound = patches;
    }

    /**
     * What this chunk's feature pass wrote into another chunk, or undefined when it wrote nothing.
     *
     * The caller is the other chunk's `full` body, which collects all eight of these and applies
     * them in a fixed order rather than in the order its neighbors happened to finish.
     */
    public featureWritesInto(chunkX: number, chunkZ: number): RegionChunkPatch | undefined {
        return this.outbound.get(`${chunkX},${chunkZ}`);
    }

    /** Records the finished Bedrock chunk. Called once, by the `full` body. */
    public recordChunk(chunk: Chunk): void {
        this.finished = chunk;
    }
}
