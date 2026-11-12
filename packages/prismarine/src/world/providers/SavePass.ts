import type { WorldPlayerData } from '../../config/JsonConfigTypes';
import type Chunk from '../chunk/Chunk';
import type { WorldPersistenceData } from '../WorldPersistence';
import type { ChunkSaveContext } from './ChunkSaveContext';

/** What one save pass wrote, in keys and bytes; see {@link ProviderSavePass.stats}. */
export interface SavePassStats {
    /** Keys put or deleted. */
    readonly keys: number;
    /** The batch's approximate size, keys and values together. */
    readonly bytes: number;
    /** Sub chunks encoded after the cut, whether on the pass's own schedule or before a write. */
    readonly subChunkEncodes: number;
    /** Sub chunks a write made the pass encode before their turn. */
    readonly forcedSubChunkEncodes: number;
    /**
     * Sub chunks that had changed when their turn came although no write told the cut, which
     * means something wrote through a live `SubChunk` and the pass saved a later tick's content.
     */
    readonly bypassedWrites: number;
}

/**
 * One save pass's writes to a provider (ADR 0018).
 *
 * The level takes the cut at one tick boundary: it hands every chunk that changed or holds
 * entities, every player record and the level record to the pass in one synchronous run. The
 * pass encodes what it can right away and holds back each chunk's changed sub chunks, which it
 * encodes on {@link ProviderSavePass.encode} or first when a write is about to reach one. Once
 * nothing is held back, {@link ProviderSavePass.commit} writes the pass as one atomic write where
 * the provider can, and marks each chunk saved as it was at the cut.
 */
export interface ProviderSavePass {
    /**
     * Plans a chunk's write as the chunk is now. The chunk then reports writes to the pass until
     * the pass has encoded it.
     */
    cutChunk(chunk: Chunk, context: ChunkSaveContext): void;
    /**
     * Holds a player record.
     * @returns False when the provider keeps no player records, and the level writes it elsewhere.
     */
    putPlayer(key: string, record: WorldPlayerData): boolean;
    /** Holds the level record, merged over the one the save holds. */
    putLevelRecord(data: WorldPersistenceData): void;
    /** How many sub chunks are still to encode. */
    readonly pendingEncodes: number;
    /**
     * Encodes up to `budget` held-back sub chunks.
     * @returns How many it encoded.
     */
    encode(budget: number): number;
    /**
     * Writes the pass, once nothing is held back. A pass that holds nothing writes nothing.
     * @param options - `sync` to have the write on disk, not only handed to the operating system.
     * @throws When the write fails. Every chunk stays dirty, and the next pass writes it again.
     */
    commit(options: { readonly sync: boolean }): Promise<void>;
    /** Lets go of every chunk without writing, so they stay dirty for the next pass. */
    abandon(): void;
    readonly stats: SavePassStats;
}
