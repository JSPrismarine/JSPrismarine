import type { ChunkStatus } from '../src/ChunkStatus';
import { isOrAfter } from '../src/ChunkStatus';
import { ChunkStatusRegressionError } from '../src/StagedChunk';
import type { StagedChunk } from '../src/StagedChunk';

/**
 * The smallest chunk the ladder can drive: a position, a rung, and two maps the fake status
 * bodies write into. The tests read one block and one biome per chunk, so a map keyed by world
 * position is all the storage they need.
 */
export class TestChunk implements StagedChunk {
    private persistedStatus: ChunkStatus = 'empty';
    private readonly blocks = new Map<string, string>();
    private readonly biomes = new Map<string, string>();

    public constructor(
        public readonly chunkX: number,
        public readonly chunkZ: number
    ) {}

    public get status(): ChunkStatus {
        return this.persistedStatus;
    }

    public advanceTo(status: ChunkStatus): void {
        if (isOrAfter(this.persistedStatus, status)) throw new ChunkStatusRegressionError(this.persistedStatus, status);
        this.persistedStatus = status;
    }

    public setBlock(x: number, y: number, z: number, state: string): void {
        this.blocks.set(`${x},${y},${z}`, state);
    }

    /** The state at a world position, or `minecraft:air` where nothing was written. */
    public blockAt(x: number, y: number, z: number): string {
        return this.blocks.get(`${x},${y},${z}`) ?? 'minecraft:air';
    }

    public setBiome(x: number, y: number, z: number, biome: string): void {
        this.biomes.set(`${x},${y},${z}`, biome);
    }

    /** The biome at a world position, or `minecraft:plains` where nothing was written. */
    public biomeAt(x: number, y: number, z: number): string {
        return this.biomes.get(`${x},${y},${z}`) ?? 'minecraft:plains';
    }
}

/** Builds a {@link TestChunk}, in the shape a `ChunkHolderMap` takes. */
export const newTestChunk = (chunkX: number, chunkZ: number): TestChunk => new TestChunk(chunkX, chunkZ);
