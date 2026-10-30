import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The view distance the server granted to the client, measured in chunks. */
export interface ChunkRadiusUpdated {
    /** What the server actually granted, which may be less than was asked for. */
    radius: number;
}

/**
 * The server's answer to `RequestChunkRadiusPacket`, and the radius that binds.
 *
 * Protocol 2193 carries one field, `Chunk Radius`, a ZigZag varint32 counted in chunks. It may be
 * smaller than what the client asked for, and until it arrives a client discards every
 * `LevelChunkPacket` it is sent.
 */
export default class ChunkRadiusUpdatedPacket extends NetworkPacket<ChunkRadiusUpdated> {
    public get id(): number {
        return PacketIdentifier.CHUNK_RADIUS_UPDATED;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ChunkRadiusUpdated): void {
        stream.writeVarInt(data.radius);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ChunkRadiusUpdated {
        return { radius: stream.readVarInt() };
    }
}
