import type { WorldConfig, WorldPlayerData } from '../World';
import type { Service } from '../../utils';
import type { ChunkRequestOptions, Generator } from '../Generator';
import type Chunk from '../chunk/Chunk';
import type { WorldPersistenceData } from '../WorldPersistence';

export default interface Provider extends Service {
    /** True only when `writeChunk` persists terrain, block entities, and actors for later reload. */
    readonly supportsChunkUnload?: boolean;

    /**
     * Returns the path to the world folder.
     */
    getPath(): string;

    /**
     * Returns the chunk decoded from the provider.
     * @param cx - chunk x.
     * @param cz - chunk z.
     * @param seed - world seed.
     * @param generator - chunk generator.
     * @param config - config object.
     * @param options - how the request is scheduled, for a generator that queues.
     */
    readChunk(
        cx: number,
        cz: number,
        seed: bigint,
        generator: Generator,
        config?: WorldConfig,
        options?: ChunkRequestOptions
    ): Promise<Chunk>;

    /**
     * Writes a chunk
     * @param chunk - chunk x
     */
    writeChunk(chunk: Chunk): Promise<void>;

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
