import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { levelChunkPacket } from '../wire/definitions/levelChunk';
import { layoutAt } from '../wire/WireLayout';
import { SINCE_2225 } from '../wire/wireGates';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The fields of a `LevelChunkPacket`, in wire order. */
export interface LevelChunk {
    /** `Chunk Position` X, in chunks. */
    chunkX: number;
    /** `Chunk Position` Z, in chunks. */
    chunkZ: number;
    /** `Dimension Id`: 0 for the Overworld, 1 for the Nether, 2 for the End. */
    dimension: number;
    /**
     * `Sub-chunks Count` in plain mode. In request mode this is the `Client Request SubChunk
     * Limit` instead, the highest sub chunk the client may ask for, and the count goes out as 0.
     */
    subChunkCount: number;
    /** Whether the `Client Request SubChunk Limit` is present, which puts the chunk in request mode. */
    clientSubChunkRequestsEnabled: boolean;
    /** `Cache Enabled`: the payload holds only border blocks and block entities and the sub chunks come by blob. */
    cached: boolean;
    /** `Cache Metadata`, one `Blob Id` per sub chunk and one for the biomes. Empty when the cache is off. */
    blobHashes?: bigint[];
    /**
     * `Serialized Chunk Data`, left as bytes.
     *
     * Deliberately not parsed: a bot that is measuring a server does not need to know what
     * is in the terrain, and the parsing is the expensive half. Anything that does want the
     * blocks decodes this itself; the length is right here, so nothing is lost by waiting.
     */
    payload: Buffer;
    /** Whether server biome data overrides the client's, present from protocol 2225. */
    isClientBiomeUpdate?: boolean;
}

/**
 * One chunk column of terrain.
 *
 * Protocol 2193 layout, in wire order: `Chunk Position` as a `ChunkPos` (X then Z, ZigZag
 * varint32), `Dimension Id` (ZigZag varint32), `Sub-chunks Count` (varuint32), `Client Request
 * SubChunk Limit` as an optional ZigZag varint32 (a presence byte, then the value only when
 * present), `Cache Enabled` (one byte), `Cache Metadata` as a varuint32 count of little-endian
 * uint64 `Blob Id`s that is written even when empty, then `Serialized Chunk Data` as a varuint32
 * byte length followed by the bytes.
 *
 * Until protocol 2168 the count doubled as a flag: 0xFFFFFFFF or 0xFFFFFFFE meant request mode,
 * the latter followed by a uint16 limit, and the blob list existed only when the cache was on. A
 * reader of that layout takes the presence byte for `Cache Enabled` and the real `Cache Enabled`
 * for an empty payload.
 *
 * By volume this is almost all of what a server sends, which makes it the packet a load test
 * most needs to be able to skip. Reading the envelope and leaving the payload alone costs
 * nothing and still says which chunk arrived, when, and how big it was.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/level-chunk-packet/
 */
export default class LevelChunkPacket extends NetworkPacket<LevelChunk> {
    public get id(): number {
        return PacketIdentifier.LEVEL_CHUNK;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: LevelChunk): void {
        layoutAt(levelChunkPacket, this.codecProtocol).encode(stream, {
            chunkX: data.chunkX,
            chunkZ: data.chunkZ,
            dimension: data.dimension,
            subChunkRequest: { clientRequestsEnabled: data.clientSubChunkRequestsEnabled, count: data.subChunkCount },
            cacheEnabled: data.cached,
            cacheBlobIds: data.blobHashes ?? [],
            data: data.payload,
            isClientBiomeUpdate: data.isClientBiomeUpdate ?? false
        });
    }

    protected deserializePayload(stream: NetworkBinaryStream): LevelChunk {
        const decoded = layoutAt(levelChunkPacket, this.codecProtocol).decode(stream);
        const data: LevelChunk = {
            chunkX: decoded.chunkX,
            chunkZ: decoded.chunkZ,
            dimension: decoded.dimension,
            subChunkCount: decoded.subChunkRequest.count,
            clientSubChunkRequestsEnabled: decoded.subChunkRequest.clientRequestsEnabled,
            cached: decoded.cacheEnabled,
            blobHashes: decoded.cacheBlobIds,
            payload: decoded.data
        };

        if (SINCE_2225.includedAt(this.codecProtocol)) data.isClientBiomeUpdate = decoded.isClientBiomeUpdate;

        return data;
    }
}
