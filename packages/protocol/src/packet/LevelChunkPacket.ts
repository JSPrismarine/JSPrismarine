import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

export interface LevelChunk {
    chunkX: number;
    chunkZ: number;
    dimension: number;
    subChunkCount: number;
    clientSubChunkRequestsEnabled: boolean;
    cached: boolean;
    /**
     * The chunk's block data, left as bytes.
     *
     * Deliberately not parsed: a bot that is measuring a server does not need to know what
     * is in the terrain, and the parsing is the expensive half. Anything that does want the
     * blocks decodes this itself - the length is right here, so nothing is lost by waiting.
     */
    payload: Buffer;
}

/**
 * Terrain.
 *
 * By volume this is almost all of what a server sends, which makes it the packet a load
 * test most needs to be able to *skip*. Reading the envelope and leaving the payload alone
 * costs nothing and still gives a bot what it wants to know: which chunk arrived, when, and
 * how big it was.
 */
export default class LevelChunkPacket extends NetworkPacket<LevelChunk> {
    public get id(): number {
        return PacketIdentifier.LEVEL_CHUNK;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: LevelChunk): void {
        stream.writeVarInt(data.chunkX);
        stream.writeVarInt(data.chunkZ);
        stream.writeVarInt(data.dimension);

        if (data.clientSubChunkRequestsEnabled) {
            stream.writeUnsignedVarInt(0);
            stream.writeBoolean(true);
            stream.writeVarInt(data.subChunkCount);
        } else {
            stream.writeUnsignedVarInt(data.subChunkCount);
            stream.writeBoolean(false);
        }

        stream.writeBoolean(data.cached);
        stream.writeUnsignedVarInt(0); // Blob hashes, always present and empty without a cache
        stream.writeLengthPrefixed(data.payload);
    }

    protected deserializePayload(stream: NetworkBinaryStream): LevelChunk {
        const chunkX = stream.readVarInt();
        const chunkZ = stream.readVarInt();
        const dimension = stream.readVarInt();

        // A count, and then an optional limit. The count used to double as a flag - a
        // sentinel meaning "the client will request the sub chunks itself", followed by the
        // highest one it may ask for. At 2168 the sentinel is gone and the limit is a field
        // of its own, present or absent.
        const count = stream.readUnsignedVarInt();
        const clientSubChunkRequestsEnabled = stream.readBoolean();
        const subChunkCount = clientSubChunkRequestsEnabled ? stream.readVarInt() : count;
        const cached = stream.readBoolean();

        // The blob hashes, now always on the wire rather than only when the cache is on.
        // Read and dropped: a client that does not cache has no use for them, and one that
        // skipped them would take the first of them for the payload's length.
        let hashes = stream.readUnsignedVarInt();
        while (hashes-- > 0) stream.readUnsignedLongLE();

        return {
            chunkX,
            chunkZ,
            dimension,
            subChunkCount,
            clientSubChunkRequestsEnabled,
            cached,
            payload: stream.readLengthPrefixed()
        };
    }
}
