import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

export interface ChunkRadiusUpdated {
    /** What the server actually granted, which may be less than was asked for. */
    radius: number;
}

/** The server's answer to {@link RequestChunkRadiusPacket}, and the radius that binds. */
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
