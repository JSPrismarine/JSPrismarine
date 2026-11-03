import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import type { ProtocolCodec } from '@jsprismarine/protocol';
import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';

import { encodePacketBatchAsync } from './encodePacketBatch';
import type { EncodedPacketBatch } from './encodePacketBatch';
import type Chunk from '../world/chunk/Chunk';

/** Compressed bytes and the encoded packets used for logging and packet dumps. */
export interface CachedChunkBatch extends EncodedPacketBatch {
    /** Approximate retained bytes, including the encoded packet buffers. */
    readonly memoryBytes: number;
}

interface CacheEntry extends CachedChunkBatch {
    readonly revision: number;
}

const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;

/** Shares identical one-chunk compressed batches while keeping retained memory bounded. */
export class ChunkBatchCache {
    private readonly entries = new Map<Chunk, Map<string, CacheEntry>>();
    private readonly pending = new Map<Chunk, Map<string, Promise<CachedChunkBatch>>>();
    private retainedBytes = 0;
    private compressions = 0;

    public constructor(private readonly maxBytes: number = DEFAULT_MAX_BYTES) {
        if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
            throw new RangeError(`Chunk batch cache limit must be a non-negative integer, got ${maxBytes}`);
        }
    }

    /** Approximate retained cache bytes. Pending results are not included. */
    public get memoryBytes(): number {
        return this.retainedBytes;
    }

    /** Number of times this cache has asked the batch codec to encode a batch. */
    public get compressionCount(): number {
        return this.compressions;
    }

    /**
     * Returns a compressed batch for one chunk revision and protocol/compression configuration.
     *
     * @param chunk - The immutable identity whose payload revision is being sent.
     * @param revision - Revision captured with the payload.
     * @param codec - The negotiated packet layout used to encode the chunk packet.
     * @param compressionLevel - The negotiated server compression level.
     * @param packets - Builds packets only on a cache miss.
     * @param compressionAlgorithm - The negotiated packet compression algorithm.
     * @param compressionThreshold - The smallest batch payload size that is compressed.
     * @param variant - Packet payload form, such as cached or uncached chunk data.
     * @returns The shared compressed batch, or a newly encoded batch when it cannot be retained.
     */
    public async getOrCreate(
        chunk: Chunk,
        revision: number,
        codec: ProtocolCodec,
        compressionLevel: number,
        packets: () => readonly NetworkPacket<unknown>[],
        compressionAlgorithm: PacketCompressionAlgorithm = PacketCompressionAlgorithm.ZLIB,
        compressionThreshold = 1,
        variant = 'default'
    ): Promise<CachedChunkBatch> {
        const settings = `${codec.protocolVersion}:${compressionAlgorithm}:${compressionLevel}:${compressionThreshold}:${variant}`;
        const cacheForChunk = this.entries.get(chunk);
        const cached = cacheForChunk?.get(settings);
        if (cached !== undefined && cacheForChunk !== undefined && cached.revision === revision) {
            this.touch(chunk, cacheForChunk);
            return {
                content: cached.content,
                packets: cached.packets,
                packetBuffers: cached.packetBuffers,
                memoryBytes: cached.memoryBytes
            };
        }
        if (cached !== undefined && cacheForChunk !== undefined) {
            cacheForChunk.delete(settings);
            this.retainedBytes -= cached.memoryBytes;
            if (cacheForChunk.size === 0) this.entries.delete(chunk);
        }

        const pendingKey = `${settings}:${revision}`;
        let pendingForChunk = this.pending.get(chunk);
        const existing = pendingForChunk?.get(pendingKey);
        if (existing !== undefined) return existing;
        if (pendingForChunk === undefined) {
            pendingForChunk = new Map();
            this.pending.set(chunk, pendingForChunk);
        }

        const encoding = (async (): Promise<CachedChunkBatch> => {
            this.compressions++;
            const batch = await encodePacketBatchAsync(packets(), codec, {
                compressionAlgorithm,
                compressionLevel,
                compressionThreshold
            });
            const memoryBytes =
                batch.content.byteLength +
                batch.packetBuffers.reduce((total, packetBuffer) => total + packetBuffer.byteLength, 0);
            const result = { ...batch, memoryBytes };

            // A payload can finish compression after its chunk has changed; that snapshot still
            // belongs to its caller, but retaining it would make future viewers hit stale data.
            if (chunk.getNetworkRevision() === revision) this.retain(chunk, settings, { ...result, revision });

            return result;
        })();
        pendingForChunk.set(pendingKey, encoding);
        try {
            return await encoding;
        } finally {
            pendingForChunk.delete(pendingKey);
            if (pendingForChunk.size === 0) this.pending.delete(chunk);
        }
    }

    private touch(chunk: Chunk, cacheForChunk: Map<string, CacheEntry>): void {
        this.entries.delete(chunk);
        this.entries.set(chunk, cacheForChunk);
    }

    private retain(chunk: Chunk, settings: string, entry: CacheEntry): void {
        if (entry.memoryBytes > this.maxBytes) return;

        let cacheForChunk = this.entries.get(chunk);
        if (cacheForChunk === undefined) {
            cacheForChunk = new Map();
            this.entries.set(chunk, cacheForChunk);
        }
        const replaced = cacheForChunk.get(settings);
        if (replaced !== undefined) this.retainedBytes -= replaced.memoryBytes;
        cacheForChunk.set(settings, entry);
        this.retainedBytes += entry.memoryBytes;
        this.touch(chunk, cacheForChunk);

        while (this.retainedBytes > this.maxBytes) {
            const oldest = this.entries.entries().next().value;
            if (oldest === undefined) break;
            this.removeChunk(oldest[0], oldest[1]);
        }
    }

    private removeChunk(chunk: Chunk, cacheForChunk: Map<string, CacheEntry>): void {
        for (const entry of cacheForChunk.values()) this.retainedBytes -= entry.memoryBytes;
        this.entries.delete(chunk);
    }
}

export default ChunkBatchCache;
