import type { MissingBlobData } from '@jsprismarine/protocol/packet/ClientCacheMissResponsePacket';

import type Chunk from '../world/chunk/Chunk';
import type SubChunk from '../world/chunk/SubChunk';
import { xxHash64 } from './xxHash64';

/** One content-addressed byte range named by a cached LevelChunk packet. */
export interface ClientBlob {
    /** XXHash64 content id written into the chunk packet. */
    readonly id: bigint;
    /** Exact subchunk or biome bytes covered by `id`. */
    readonly data: Buffer;
}

/** Cache-enabled and uncached payloads for one chunk revision. */
export interface PreparedClientChunkBlobs {
    /** The complete payload sent when blob caching is disabled. */
    readonly payload: Buffer;
    /** The border-and-block-entity tail sent in a cached LevelChunk packet. */
    readonly cachedPayload: Buffer;
    /** Subchunk blobs followed by the complete biome blob. */
    readonly blobs: readonly ClientBlob[];
    /** Blob ids in the same order as `blobs`. */
    readonly blobHashes: readonly bigint[];
}

interface CachedSubChunkBlob extends ClientBlob {
    readonly source: SubChunk;
    readonly revision: number;
}

interface CachedRequestSubChunkBlob extends ClientBlob {
    readonly revision: number;
}

interface CachedChunkBlobs extends PreparedClientChunkBlobs {
    readonly subChunks: readonly CachedSubChunkBlob[];
    readonly biomeIdentity: object;
    readonly biomeRevision: number;
    readonly biome: ClientBlob;
}

const cachedByChunk = new WeakMap<Chunk, CachedChunkBlobs>();
const requestBlobsByChunk = new WeakMap<Chunk, Map<number, CachedRequestSubChunkBlob>>();

/** Keeps missed chunk blobs for one connection until the client acknowledges them. */
export class ClientBlobCache {
    private readonly pending = new Map<bigint, Buffer>();
    private readonly found = new Set<bigint>();

    /** Total blob payload bytes held while waiting for client acknowledgements. */
    public get pendingBytes(): number {
        let bytes = 0;
        for (const data of this.pending.values()) bytes += data.byteLength;
        return bytes;
    }

    /**
     * Whether this client has confirmed it holds a subchunk blob.
     * @param blobId - The content hash reported by the client.
     */
    public hasClientBlob(blobId: bigint): boolean {
        return this.found.has(blobId);
    }

    /**
     * Serializes and hashes one request-mode subchunk, reusing an unchanged revision.
     * @param chunk - The requested chunk column.
     * @param y - Absolute subchunk index.
     */
    public prepareRequestSubChunk(chunk: Chunk, y: number): ClientBlob {
        let cachedByY = requestBlobsByChunk.get(chunk);
        if (cachedByY === undefined) {
            cachedByY = new Map();
            requestBlobsByChunk.set(chunk, cachedByY);
        }

        const revision = chunk.getNetworkRevision();
        const previous = cachedByY.get(y);
        if (previous?.revision === revision) return previous;

        const data = chunk.networkSerializeRequestSubChunk(y);
        const blob: CachedRequestSubChunkBlob = { id: xxHash64(data), data, revision };
        cachedByY.set(y, blob);
        return blob;
    }

    /**
     * Returns per-subchunk and biome bytes for a chunk, reusing blobs whose source revisions match.
     *
     * @param chunk - The chunk revision being prepared for a client cache packet.
     */
    public prepareChunk(chunk: Chunk): PreparedClientChunkBlobs {
        const serialized = chunk.networkSerializeBlobs();
        const previous = cachedByChunk.get(chunk);
        if (previous?.blobs.length === serialized.subChunks.length + 1 && previous.payload === serialized.payload) {
            return previous;
        }

        const subChunks = serialized.subChunks.map((part, index): CachedSubChunkBlob => {
            const cached = previous?.subChunks[index];
            if (cached?.source === part.subChunk && cached.revision === part.revision) return cached;

            return {
                id: xxHash64(part.bytes),
                data: part.bytes,
                source: part.subChunk,
                revision: part.revision
            };
        });
        const cachedBiome = previous?.biome;
        const biome =
            previous?.biomeIdentity === serialized.biomes.identity &&
            previous.biomeRevision === serialized.biomes.revision &&
            cachedBiome !== undefined
                ? cachedBiome
                : { id: xxHash64(serialized.biomes.bytes), data: serialized.biomes.bytes };
        const blobs: ClientBlob[] = [...subChunks, biome];
        const result: CachedChunkBlobs = {
            payload: serialized.payload,
            cachedPayload: serialized.cachedPayload,
            blobs,
            blobHashes: blobs.map(({ id }) => id),
            subChunks,
            biomeIdentity: serialized.biomes.identity,
            biomeRevision: serialized.biomes.revision,
            biome
        };

        cachedByChunk.set(chunk, result);
        return result;
    }

    /** Adds the blobs named by a chunk packet before that packet enters the send chain. */
    public track(blobs: readonly ClientBlob[]): void {
        for (const blob of blobs) this.pending.set(blob.id, blob.data);
    }

    /** Drops this session's pending byte copies after cache use has been disabled. */
    public clear(): void {
        this.pending.clear();
        this.found.clear();
    }

    /**
     * Selects requested missing bytes and drops only hashes the client acknowledges as present.
     *
     * Missing wins if a malformed report lists the same id as both found and missing, since the
     * response data must remain available until the client confirms it stored the blob.
     *
     * @param missingIds - Blob ids the client needs in full.
     * @param foundIds - Blob ids the client confirms it already has.
     * @returns Requested blobs that this session still has bytes for.
     */
    public respond(missingIds: readonly bigint[], foundIds: readonly bigint[]): MissingBlobData[] {
        const missing = new Set(missingIds);
        const included = new Set<bigint>();
        const blobs: MissingBlobData[] = [];
        for (const blobId of missingIds) {
            const data = this.pending.get(blobId);
            if (data === undefined || included.has(blobId)) continue;

            included.add(blobId);
            blobs.push({ blobId, blobData: data });
        }

        for (const blobId of foundIds) {
            if (missing.has(blobId)) continue;
            this.pending.delete(blobId);
            this.found.add(blobId);
        }

        for (const blobId of missingIds) {
            this.found.delete(blobId);
        }

        return blobs;
    }
}
