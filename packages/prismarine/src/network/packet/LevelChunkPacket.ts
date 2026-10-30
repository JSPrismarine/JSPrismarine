import { layoutAt, levelChunkPacket } from '@jsprismarine/protocol';

import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

import type { SubChunkRequestMode } from '@jsprismarine/protocol';

/**
 * Sends one chunk column to the client.
 *
 * The wire layout lives in `@jsprismarine/protocol`'s declarative definition, which this class
 * walks at the protocol version stamped on it: the seven documented 2193 fields, plus the
 * trailing `Is Client Biome Update` boolean from 2225 on. One class serves every version;
 * which fields travel is the layout's decision, not this file's.
 */
export default class LevelChunkPacket extends FieldNetworkPacket {
    /** Chunk Position X, in chunks. */
    public chunkX = 0;

    /** Chunk Position Z, in chunks. */
    public chunkZ = 0;

    /** Dimension Id of the chunk. 0 is the Overworld, 1 the Nether, 2 the End. */
    public dimension = 0;

    /**
     * Sub-chunks Count in plain mode. In request mode this is the Client Request SubChunk
     * Limit instead, the highest sub-chunk the client may ask for, and the count goes out as 0.
     */
    public subChunkCount = 0;

    /**
     * Whether the client fetches the sub-chunks itself through `SubChunkRequestPacket`.
     * Controls whether the Client Request SubChunk Limit is present.
     */
    public clientSubChunkRequestsEnabled = false;

    /** Cache Enabled. The server does not use the client blob cache, so it sends false. */
    public cacheEnabled = false;

    /**
     * Cache Metadata Blob Ids. The list is on the wire even when the cache is off - an empty
     * list is still a count byte, and leaving it out makes the client read the payload length
     * as a count. The server sends it empty.
     */
    public cacheBlobIds: bigint[] = [];

    /** Serialized Chunk Data, the bytes `Chunk.networkSerialize` produces. */
    public data: Buffer = Buffer.alloc(0);

    /** Is Client Biome Update, from 2225 on; earlier versions leave it at the default. */
    public isClientBiomeUpdate = false;

    /** The sub-chunk fields under the one key the layout carries them as. */
    public get subChunkRequest(): SubChunkRequestMode {
        return { clientRequestsEnabled: this.clientSubChunkRequestsEnabled, count: this.subChunkCount };
    }

    public set subChunkRequest(mode: SubChunkRequestMode) {
        this.clientSubChunkRequestsEnabled = mode.clientRequestsEnabled;
        this.subChunkCount = mode.count;
    }

    /** Writes the fields the stamped protocol version puts on the wire, in layout order. */
    public encodePayload(): void {
        layoutAt(levelChunkPacket, this.codecProtocol).encode(this, this);
    }

    /** Reads them back in the same order, filling version-absent fields with their fallbacks. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(levelChunkPacket, this.codecProtocol).decode(this));
    }
}
