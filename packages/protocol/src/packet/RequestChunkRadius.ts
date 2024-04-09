import { PacketIdentifier } from '../PacketIdentifier';
import NetworkPacket from '../NetworkPacket';
import NetworkBinaryStream from '../NetworkBinaryStream';

export interface PacketData {
    chunkRadius: number;
    maxChunkRadius: number;
}

/**
 * The client can't just change the view radius without the server's approval, otherwise there could be holes on unrendered area.
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/RequestChunkRadiusPacket.html}
 */
export class RequestChunkRadiusPacket extends NetworkPacket<PacketData> {
    get id(): number {
        return PacketIdentifier.REQUEST_CHUNK_RADIUS;
    }

    protected serializePayload(stream: NetworkBinaryStream, packetData: PacketData): void {
        stream.writeVarInt(packetData.chunkRadius);
        stream.writeSignedByte(packetData.maxChunkRadius);
    }

    protected deserializePayload(stream: NetworkBinaryStream): PacketData {
        return {
            chunkRadius: stream.readVarInt(),
            maxChunkRadius: stream.readSignedByte()
        };
    }
}
