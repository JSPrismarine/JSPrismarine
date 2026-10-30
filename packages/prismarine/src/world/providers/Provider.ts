import type { WorldConfig, WorldPlayerData } from '../World';
import type { Service } from '../../utils';
import type { ChunkRequestOptions, Generator } from '../Generator';
import type Chunk from '../chunk/Chunk';
import type { DimensionType } from '../Dimension';
import type { WorldPersistenceData } from '../WorldPersistence';

/**
 * Where a save keeps its chunks, players and metadata.
 *
 * One provider serves one save folder, and a Bedrock save holds every dimension in one database,
 * so the chunk calls name the dimension they address while the player and level calls do not.
 */
export default interface Provider extends Service {
    /** True only when `writeChunk` persists terrain, block entities, and actors for later reload. */
    readonly supportsChunkUnload?: boolean;

    /**
     * Returns the path to the world folder.
     */
    getPath(): string;

    /**
     * Returns the chunk decoded from the provider, generating it when the save has none.
     * @param dimension - the dimension the chunk belongs to.
     * @param cx - chunk x.
     * @param cz - chunk z.
     * @param seed - world seed.
     * @param generator - chunk generator.
     * @param config - config object.
     * @param options - how the request is scheduled, for a generator that queues.
     */
    readChunk(
        dimension: DimensionType,
        cx: number,
        cz: number,
        seed: bigint,
        generator: Generator,
        config?: WorldConfig,
        options?: ChunkRequestOptions
    ): Promise<Chunk>;

    /**
     * Writes a chunk into the dimension `chunk.getDimension()` names.
     * @param chunk - the chunk to write.
     */
    writeChunk(chunk: Chunk): Promise<void>;

    /** Every chunk coordinate the save holds for one dimension, when the format can list them. */
    listChunks?(dimension: DimensionType): IterableIterator<{ x: number; z: number }>;

    /** Reads world state outside the chunk records, or null when the provider has none. */
    readWorldData(): Promise<WorldPersistenceData | null>;

    /** Writes world state outside the chunk records. */
    writeWorldData(data: WorldPersistenceData): Promise<void>;

    /** Imports the one-time world state written by older versions to `level.json`. */
    migrateLegacyWorldData(data: WorldPersistenceData): Promise<void>;

    /** Persists provider-specific world metadata, such as the spawn position. */
    saveLevelData?(spawn: { x: number; y: number; z: number }): void;

    /** Reads player data from provider-specific storage, if the format supports it. */
    readPlayerData?(key: string): Promise<Partial<WorldPlayerData> | null>;

    /** Writes player data to provider-specific storage, if the format supports it. */
    writePlayerData?(key: string, data: WorldPlayerData): Promise<void>;
}
