import type { WorldConfig, WorldPlayerData } from '../World';
import type { Service } from '../../utils/Service';
import type { ChunkRequestOptions, Generator } from '../Generator';
import type Chunk from '../chunk/Chunk';
import type { DimensionType } from '../DimensionType';
import type { WorldPersistenceData } from '../WorldPersistence';
import type { LevelStem } from '@jsprismarine/worldgen';
import type { ChunkSaveContext } from './ChunkSaveContext';

/**
 * What a provider writes into the save's level metadata, `level.dat` for the LevelDB format.
 *
 * Every field is per save rather than per dimension: Bedrock keeps one spawn, one clock and one
 * `Generator` for the whole world. A field left out keeps whatever the file already holds.
 */
export interface LevelDatInputs {
    /** The world spawn, which Bedrock always places in the Overworld. */
    readonly spawn?: { x: number; y: number; z: number };
    /** The clock in ticks, Bedrock's `Time`. */
    readonly time?: number;
    /**
     * The resolved level stems by Java dimension id. The `minecraft:overworld` stem decides
     * `Generator` (2 for a flat generator, 1 otherwise) and `FlatWorldLayers`.
     */
    readonly stems?: Readonly<Record<string, LevelStem>>;
    /** The Nether's `coordinate_scale`, written as `NetherScale`. Defaults to Java's 8. */
    readonly netherScale?: number;
}

/**
 * Where a save keeps its chunks, players and metadata.
 *
 * One provider serves one save folder, and a Bedrock save holds every dimension in one database,
 * so the chunk calls name the dimension they address while the player and level calls do not.
 */
export default interface Provider extends Service {
    /** True only when `writeChunk` persists terrain, block entities, and actors for later reload. */
    readonly supportsChunkUnload?: boolean;

    /** Captures the provider's persisted state for replay, or leaves replay snapshots unsupported. */
    captureReplaySnapshot?(): Uint8Array;

    /**
     * Restores a provider snapshot before the provider is enabled and its worlds are loaded.
     *
     * @param snapshot - Bytes returned by {@link Provider.captureReplaySnapshot}.
     * @throws {Error} When the snapshot is invalid or this provider is already enabled.
     */
    restoreReplaySnapshot?(snapshot: Uint8Array): Promise<void>;

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
    writeChunk(chunk: Chunk, saveContext?: ChunkSaveContext): Promise<void>;

    /** Every chunk coordinate the save holds for one dimension, when the format can list them. */
    listChunks?(dimension: DimensionType): IterableIterator<{ x: number; z: number }>;

    /** Reads world state outside the chunk records, or null when the provider has none. */
    readWorldData(): Promise<WorldPersistenceData | null>;

    /** Writes world state outside the chunk records. */
    writeWorldData(data: WorldPersistenceData): Promise<void>;

    /** Imports the one-time world state written by older versions to `level.json`. */
    migrateLegacyWorldData(data: WorldPersistenceData): Promise<void>;

    /** Persists provider-specific level metadata: the spawn, the clock, the generator and its layers. */
    saveLevelData?(level: LevelDatInputs): void;

    /**
     * Reads back the level metadata {@link Provider.saveLevelData} wrote, or null when the format
     * keeps none. The clock is the field the level needs from here: the spawn, the rules and the
     * stems reach it through {@link Provider.readWorldData}.
     */
    readLevelData?(): LevelDatInputs | null;

    /** Reads player data from provider-specific storage, if the format supports it. */
    readPlayerData?(key: string): Promise<Partial<WorldPlayerData> | null>;

    /** Writes player data to provider-specific storage, if the format supports it. */
    writePlayerData?(key: string, data: WorldPlayerData): Promise<void>;
}
