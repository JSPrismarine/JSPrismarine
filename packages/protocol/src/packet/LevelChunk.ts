import type { NetworkBinaryStream } from '../';
import { NetworkPacket, PacketIdentifier, ChunkPos } from '../';
import type { Dimension } from '@jsprismarine/minecraft';

interface BaseData {
    chunkPosition: ChunkPos;
    dimensionId: Dimension;
    subChunksRequested: boolean;
    cacheEnabled: boolean;
    serializedChunk: Buffer;
}

interface PacketDataWithCache extends BaseData {
    cacheEnabled: true;
    cacheBlobs: Array<{ blobId: bigint }>;
}

interface PacketDataWithoutCache extends BaseData {
    cacheEnabled: false;
}

interface PacketDataWithCacheWithoutSubRequest extends PacketDataWithCache {
    subChunksRequested: false;
    subChunkCount: number;
}

interface PacketDataWithCacheAndSubRequest extends PacketDataWithCache {
    subChunksRequested: true;
    subChunkRequestLimit: number;
    subChunkCount: number;
}

interface PacketDataWithoutCacheSubRequest extends PacketDataWithoutCache {
    subChunksRequested: true;
    subChunkRequestLimit: number;
    subChunkCount: number;
}

interface PacketDataWithoutCacheAndSubRequest extends PacketDataWithoutCache {
    subChunksRequested: false;
    subChunkCount: number;
}

interface PacketDataWithoutCacheWithSubRequest extends PacketDataWithoutCache {
    subChunksRequested: true;
    subChunkRequestLimit: number;
    subChunkCount: number;
}

type PacketData =
    | PacketDataWithoutCacheAndSubRequest
    | PacketDataWithoutCacheWithSubRequest
    | PacketDataWithCacheAndSubRequest
    | PacketDataWithCacheWithoutSubRequest
    | PacketDataWithoutCacheSubRequest;

/**
 * Used to start a chunk transaction.Used to start a Chunk Transaction - sends a list of hashes for the chunks it needs to send, followed by border blocks, block entities, and biomes.
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/LevelChunkPacket.html}
 */
export class LevelChunkPacket extends NetworkPacket<PacketData> {
    get id(): number {
        return PacketIdentifier.LEVEL_CHUNK;
    }

    protected serializePayload(stream: NetworkBinaryStream, packetData: PacketData): void {
        packetData.chunkPosition.serialize(stream);
        stream.writeVarInt(packetData.dimensionId);
        if (packetData.subChunksRequested) {
            if (packetData.subChunkRequestLimit < 0) {
                stream.writeVarInt(packetData.subChunkCount);
            } else {
                stream.writeVarInt(packetData.subChunkCount);
                stream.writeVarInt(packetData.subChunkRequestLimit);
            }
        } else {
            stream.writeVarInt(packetData.subChunkCount);
        }
        stream.writeBoolean(packetData.cacheEnabled);
        if (packetData.cacheEnabled) {
            stream.writeUnsignedVarInt(packetData.cacheBlobs.length);
            for (const cacheBlob of packetData.cacheBlobs) {
                stream.writeUnsignedLongLE(cacheBlob.blobId);
            }
        }
        stream.writeLengthPrefixed(packetData.serializedChunk);
    }

    protected deserializePayload(stream: NetworkBinaryStream): PacketData {
        const chunkPosition = ChunkPos.deserialize(stream);
        const dimensionId = stream.readVarInt();
        const subChunksRequested = stream.readBoolean();
        let subChunkCount: number;
        let subChunkRequestLimit = 0;
        if (subChunksRequested) {
            subChunkCount = stream.readVarInt();
            subChunkRequestLimit = stream.readVarInt();
        } else {
            subChunkCount = stream.readVarInt();
        }
        const cacheEnabled = stream.readBoolean();
        let cacheBlobs: Array<{ blobId: bigint }> = [];
        if (cacheEnabled) {
            const cacheBlobsCount = stream.readUnsignedVarInt();
            for (let i = 0; i < cacheBlobsCount; i++) {
                cacheBlobs.push({ blobId: stream.readUnsignedLongLE() });
            }
        }
        const serializedChunk = stream.readLengthPrefixed();

        if (cacheEnabled) {
            if (subChunksRequested) {
                return {
                    chunkPosition,
                    dimensionId,
                    subChunksRequested,
                    cacheEnabled,
                    cacheBlobs,
                    subChunkRequestLimit,
                    subChunkCount,
                    serializedChunk
                };
            } else {
                return {
                    chunkPosition,
                    dimensionId,
                    subChunksRequested,
                    cacheEnabled,
                    cacheBlobs,
                    subChunkCount,
                    serializedChunk
                };
            }
        } else {
            if (subChunksRequested) {
                return {
                    chunkPosition,
                    dimensionId,
                    subChunksRequested,
                    cacheEnabled,
                    subChunkRequestLimit,
                    subChunkCount,
                    serializedChunk
                };
            } else {
                return {
                    chunkPosition,
                    dimensionId,
                    subChunksRequested,
                    cacheEnabled,
                    subChunkCount,
                    serializedChunk
                };
            }
        }
    }
}
