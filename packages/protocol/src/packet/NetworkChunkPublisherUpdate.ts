import type { NetworkBinaryStream } from '../';
import { BlockPos, ChunkPos, NetworkPacket, PacketIdentifier } from '../';

interface PacketData {
    newViewPosition: BlockPos;
    newViewRadius: number;
    // serverBuiltChunksSize: number;
    serverBuilChunksList: Array<ChunkPos>;
}

export class NetworkChunkPublisherUpdatePacket extends NetworkPacket<PacketData> {
    get id(): number {
        return PacketIdentifier.NETWORK_CHUNK_PUBLISHER_UPDATE;
    }

    protected serializePayload(stream: NetworkBinaryStream, packetData: PacketData): void {
        packetData.newViewPosition.serialize(stream);
        stream.writeUnsignedVarInt(packetData.newViewRadius);
        stream.writeUnsignedIntLE(packetData.serverBuilChunksList.length);
        for (const chunkPos of packetData.serverBuilChunksList) {
            chunkPos.serialize(stream);
        }
    }

    protected deserializePayload(stream: NetworkBinaryStream): PacketData {
        return {
            newViewPosition: BlockPos.deserialize(stream),
            newViewRadius: stream.readUnsignedVarInt(),
            serverBuilChunksList: Array.from({ length: stream.readUnsignedIntLE() }, () => ChunkPos.deserialize(stream))
        };
    }
}
