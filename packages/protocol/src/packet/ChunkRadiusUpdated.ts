import type NetworkBinaryStream from '../NetworkBinaryStream';
import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

export interface PacketData {
    chunkRadius: number;
}

/**
 * Sent when the world is loading. We don't know why it is sent four times. Defines the tick distance.
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/ChunkRadiusUpdatedPacket.html}
 */
export class ChunkRadiusUpdatedPacket extends NetworkPacket<PacketData> {
    get id(): number {
        return PacketIdentifier.CHUNK_RADIUS_UPDATED;
    }

    protected serializePayload(stream: NetworkBinaryStream, packetData: PacketData): void {
        stream.writeVarInt(packetData.chunkRadius);
    }

    protected deserializePayload(stream: NetworkBinaryStream): PacketData {
        return {
            chunkRadius: stream.readVarInt()
        };
    }
}
