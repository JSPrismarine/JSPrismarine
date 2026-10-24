import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import SubChunkHeightmapData, { HeightMapDataType } from '../structure/SubChunkHeightmapData';
import SubChunkPos from '../structure/SubChunkPos';
import SubChunkPosOffset from '../structure/SubChunkPosOffset';

import type NetworkBinaryStream from '../NetworkBinaryStream';

export { HeightMapDataType };

/**
 * The docs enum `SubChunkRequestResult`: how the server answered one requested sub chunk.
 *
 * The 1.26.51 page renders these from 0, but that is the display artifact the brief warns
 * about; the standalone enum schema begins with `Undefined`, gophertunnel and Mojang's own
 * guide number `Success` as 1, and the 1.26.60 preview changelog "changes" them back to these.
 */
export enum SubChunkRequestResult {
    /** No result; never sent on purpose. */
    UNDEFINED = 0,
    /** `Serialized Sub Chunk` holds the sub chunk. */
    SUCCESS = 1,
    /** The server has no chunk at that column. */
    LEVEL_CHUNK_DOESNT_EXIST = 2,
    /** The player was in another dimension when the request arrived. */
    WRONG_DIMENSION = 3,
    /** The requesting player is unknown, for example already logged off. */
    PLAYER_DOESNT_EXIST = 4,
    /** The sub chunk y lies outside the dimension's range. */
    INDEX_OUT_OF_BOUNDS = 5,
    /** The sub chunk is all air, so no `Serialized Sub Chunk` is needed. */
    SUCCESS_ALL_AIR = 6
}

/** One `SubChunkPacketData` entry of the `SubChunk Data` list. */
export interface SubChunkEntry {
    /** `SubChunk Pos Offset` from `Center Pos`, in sub chunks. */
    offset: SubChunkPosOffset;
    /** `SubChunk Request Result`. */
    result: SubChunkRequestResult;
    /**
     * `Serialized Sub Chunk`, left as bytes: the sub chunk's block storage followed by its block
     * entities, in the same form `LevelChunkPacket` carries. Absent when the cache is on and the
     * result is `SUCCESS_ALL_AIR`; the blob then stands in for it.
     */
    serializedSubChunk?: Buffer;
    /** `Height Map Data`. */
    heightMaps: SubChunkHeightmapData;
    /**
     * `Blob Id`, the hash the client fetches the sub chunk by when `Cache Enabled` is set. The
     * blob covers the whole `Serialized Sub Chunk`, block entities included, so it differs from
     * the id the same terrain would have in a `LevelChunkPacket`.
     */
    blobId?: bigint;
}

/** The fields of a `SubChunkPacket`, in wire order. */
export interface SubChunk {
    /** `Cache Enabled`: the client agreed to blob caching and each entry may carry a `Blob Id`. */
    cacheEnabled: boolean;
    /** `Dimension Type`: 0 for the Overworld, 1 for the Nether, 2 for the End. */
    dimension: number;
    /** `Center Pos`, the absolute sub chunk position every entry's offset is relative to. */
    centerPos: SubChunkPos;
    /** `SubChunk Data`, one entry per answered sub chunk. */
    entries: SubChunkEntry[];
}

/**
 * A batch of sub chunks answering a `SubChunkRequestPacket`.
 *
 * Protocol 2193 layout, in wire order: `Cache Enabled` as one byte, `Dimension Type` as a
 * ZigZag varint32, `Center Pos` as a {@link SubChunkPos} (three little-endian int32), then
 * `SubChunk Data` as a varuint32 count followed by one {@link SubChunkEntry} per sub chunk.
 * Each entry is its `SubChunk Pos Offset` as a {@link SubChunkPosOffset} (three signed
 * bytes), `SubChunk Request Result` as one byte, `Serialized Sub Chunk` as an optional
 * varuint32-length byte string (a presence byte, then the string only when present), `Height
 * Map Data` as a {@link SubChunkHeightmapData}, then `Blob Id` as an optional little-endian
 * uint64.
 *
 * Until protocol 2168 the optionals were implied by their neighbors: the sub chunk string was
 * skipped for `SuccessAllAir` with the cache on, each heightmap existed only when its type
 * byte said `HasData`, and the blob id existed only when `Cache Enabled` was set. A reader of
 * that layout takes the presence byte for the first byte of what follows it.
 *
 * The client ignores this packet for any sub chunk it has not marked as needing a request,
 * which happens only after a `LevelChunkPacket` in request mode for that column.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/sub-chunk-packet/}
 */
export default class SubChunkPacket extends NetworkPacket<SubChunk> {
    public get id(): number {
        return PacketIdentifier.SUB_CHUNK;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: SubChunk): void {
        stream.writeBoolean(data.cacheEnabled);
        stream.writeVarInt(data.dimension);
        data.centerPos.serialize(stream);

        stream.writeUnsignedVarInt(data.entries.length);
        for (const entry of data.entries) {
            entry.offset.serialize(stream);
            stream.writeByte(entry.result);

            stream.writeBoolean(entry.serializedSubChunk !== undefined);
            if (entry.serializedSubChunk !== undefined) stream.writeLengthPrefixed(entry.serializedSubChunk);

            entry.heightMaps.serialize(stream);

            stream.writeBoolean(entry.blobId !== undefined);
            if (entry.blobId !== undefined) stream.writeUnsignedLongLE(entry.blobId);
        }
    }

    protected deserializePayload(stream: NetworkBinaryStream): SubChunk {
        const cacheEnabled = stream.readBoolean();
        const dimension = stream.readVarInt();
        const centerPos = SubChunkPos.deserialize(stream);

        const entries: SubChunkEntry[] = [];
        let count = stream.readUnsignedVarInt();
        while (count-- > 0) {
            const offset = SubChunkPosOffset.deserialize(stream);
            const result = stream.readByte();
            const serializedSubChunk = stream.readBoolean() ? stream.readLengthPrefixed() : undefined;
            const heightMaps = SubChunkHeightmapData.deserialize(stream);
            const blobId = stream.readBoolean() ? stream.readUnsignedLongLE() : undefined;

            const entry: SubChunkEntry = { offset, result, heightMaps };
            if (serializedSubChunk !== undefined) entry.serializedSubChunk = serializedSubChunk;
            if (blobId !== undefined) entry.blobId = blobId;
            entries.push(entry);
        }

        return { cacheEnabled, dimension, centerPos, entries };
    }
}
