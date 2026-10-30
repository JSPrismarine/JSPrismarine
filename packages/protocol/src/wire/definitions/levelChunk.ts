/**
 * `LevelChunkPacket`: one chunk column, sent to the client.
 *
 * Field names and order follow the docs' packet page: Chunk Position (X then Z, ZigZag),
 * Dimension Id, the sub-chunk count with its optional request limit, the client blob cache
 * fields, then the serialized chunk data. `Is Client Biome Update` was appended at protocol
 * 2225 as a plain trailing boolean, verified against the v1.26.60 `metadata.zip`
 * (`LevelChunkPacketPayload.json`, ordinal 7, after the serialized chunk data) and
 * gophertunnel's `LevelChunk.Marshal` at v1.63.0 (`io.Bool(&pk.ClientBiomeUpdate)` last),
 * which agree. Nothing before it changed.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/LevelChunk.html}
 */
import { definePacket, gated } from '../define';
import * as t from '../fieldTypes';
import { SINCE_2225 } from '../wireGates';

import type { PayloadOf } from '../define';

/**
 * The sub-chunk count and the optional `Client Request SubChunk Limit` behind it.
 *
 * A plain count, then a separate optional limit. The count used to double as a signal: -2
 * meant the client would ask for sub-chunks itself and was followed by the highest one it
 * could ask for. Since 2168 a count is only a count, and the limit is an optional field of
 * its own, present only in request mode, where the count on the wire is 0 and the payload's
 * `count` is the limit.
 */
export interface SubChunkRequestMode {
    /** Whether the client fetches the sub-chunks itself through `SubChunkRequestPacket`. */
    clientRequestsEnabled: boolean;
    /** Sub-chunk count in plain mode; the highest requestable sub-chunk in request mode. */
    count: number;
}

/** `Sub-chunks Count` plus the optional `Client Request SubChunk Limit`, as one value. */
const subChunkRequestMode = t.custom<SubChunkRequestMode>(
    'SubChunkRequestMode',
    (s, v) => {
        if (v.clientRequestsEnabled) {
            s.writeUnsignedVarInt(0);
            s.writeBoolean(true);
            s.writeVarInt(v.count);
        } else {
            s.writeUnsignedVarInt(v.count);
            s.writeBoolean(false);
        }
    },
    (s) => {
        const count = s.readUnsignedVarInt();
        const clientRequestsEnabled = s.readBoolean();
        return { clientRequestsEnabled, count: clientRequestsEnabled ? s.readVarInt() : count };
    }
);

/** The `LevelChunkPacket` field list; the module doc carries the wire provenance. */
export const levelChunkPacket = definePacket('LevelChunkPacket', {
    /** `Chunk Position` X, in chunks, ZigZag. */
    chunkX: t.varint32,
    /** `Chunk Position` Z, in chunks, ZigZag. */
    chunkZ: t.varint32,
    /** `Dimension Id`: 0 is the Overworld, 1 the Nether, 2 the End. */
    dimension: t.varint32,
    /** `Sub-chunks Count` and the optional request limit; see {@link SubChunkRequestMode}. */
    subChunkRequest: subChunkRequestMode,
    /** `Cache Enabled`: whether the payload refers to client blob cache entries. */
    cacheEnabled: t.bool,
    /** `Cache Metadata`: one Blob Id per entry. Always on the wire, empty when the cache is off. */
    cacheBlobIds: t.list(t.lu64),
    /** `Serialized Chunk Data`, the bytes `Chunk.networkSerialize` produces. */
    data: t.byteArray,
    /** `Is Client Biome Update`: whether the server's biome data overrides the client's. */
    isClientBiomeUpdate: gated<boolean>(SINCE_2225, t.bool, false)
});

/** Sends a chunk column, its cache metadata, and serialized block data to the client. */
export type LevelChunkPayload = PayloadOf<typeof levelChunkPacket>;
