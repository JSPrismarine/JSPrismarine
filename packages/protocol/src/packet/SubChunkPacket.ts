import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { HeightMapDataType } from '../structure/SubChunkHeightmapData';
import { SubChunkRequestResult, subChunkPacket } from '../wire/definitions/subChunk';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type SubChunkPos from '../structure/SubChunkPos';
import type { SubChunkEntry } from '../wire/definitions/subChunk';
import type { SINCE_2207_SUB_CHUNK_RESULTS } from '../wire/wireGates';

export { HeightMapDataType, SubChunkRequestResult };
export type { SubChunkEntry };

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
 * Protocol 2193 uses request results 0 through 5. Protocol 2225 uses 1 through 6 and reserves
 * 0 for `UNDEFINED`; see {@link SINCE_2207_SUB_CHUNK_RESULTS}. Both supported versions use the
 * optional fields introduced at protocol 2168.
 *
 * Until protocol 2168 the optionals were implied by their neighbors: the sub chunk string was
 * skipped for `SuccessAllAir` with the cache on, each heightmap existed only when its type
 * byte said `HasData`, and the blob id existed only when `Cache Enabled` was set. A reader of
 * that layout takes the presence byte for the first byte of what follows it.
 *
 * The layout lives in the `subChunkPacket` definition, which this class walks at the protocol
 * version stamped on it.
 *
 * The client ignores this packet for any sub chunk it has not marked as needing a request,
 * which happens only after a `LevelChunkPacket` in request mode for that column.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/sub-chunk-packet/}
 */
export default class SubChunkPacket extends NetworkPacket<SubChunk> {
    public get id(): number {
        return PacketIdentifier.SUB_CHUNK;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: SubChunk): void {
        // The layout writes whichever of the two gated fields the stamped version admits.
        layoutAt(subChunkPacket, this.codecProtocol).encode(stream, {
            cacheEnabled: data.cacheEnabled,
            dimension: data.dimension,
            centerPos: data.centerPos,
            entriesUntil2207: data.entries,
            entriesSince2207: data.entries
        });
    }

    protected deserializePayload(stream: NetworkBinaryStream): SubChunk {
        const { cacheEnabled, dimension, centerPos, entriesUntil2207, entriesSince2207 } = layoutAt(
            subChunkPacket,
            this.codecProtocol
        ).decode(stream);

        // The gated field the version leaves off the wire decodes as its empty fallback.
        return { cacheEnabled, dimension, centerPos, entries: [...entriesUntil2207, ...entriesSince2207] };
    }
}
