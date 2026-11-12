/** Compares compressed chunk bytes for a fresh join, rejoin, and a walk back through cached terrain. */
import ClientCacheMissResponsePacket from '@jsprismarine/protocol/packet/ClientCacheMissResponsePacket';
import LevelChunkPacket from '@jsprismarine/protocol/packet/LevelChunkPacket';
import { BlockRuntimeIds } from '../src/block/state/BlockRuntimeIds';
import { ClientBlobCache } from '../src/network/ClientBlobCache';
import Codec2193 from '../src/network/codec/Codec2193';
import { encodePacketBatchAsync } from '../src/network/encodePacketBatch';
import { Dimensions } from '../src/world/DimensionType';
import Chunk from '../src/world/chunk/Chunk';

const COMPRESSION_LEVEL = 7;
const materialNames = ['minecraft:stone', 'minecraft:dirt', 'minecraft:grass_block', 'minecraft:gravel'];
const materials = materialNames.map((name) => {
    const runtimeId = BlockRuntimeIds.tryGetByName(name);
    if (runtimeId === null) throw new Error(`Missing benchmark block state ${name}`);
    return runtimeId;
});

const chunks = Array.from({ length: 16 }, (_unused, index) => {
    const chunk = new Chunk(index, 0, new Map(), Dimensions.Overworld);
    const material = materials[index % materials.length]!;
    for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
            if ((x + z + index) % 3 !== 0) chunk.setBlockRuntimeId(x, 64, z, material);
        }
    }
    return chunk;
});

const cache = new ClientBlobCache();
const prepared = chunks.map((chunk) => cache.prepareChunk(chunk));
const packetFor = (index: number, cached: boolean): LevelChunkPacket => {
    const chunk = chunks[index]!;
    const chunkBlobs = prepared[index]!;
    return new LevelChunkPacket({
        chunkX: chunk.getX(),
        chunkZ: chunk.getZ(),
        dimension: chunk.getDimension().bedrockId,
        subChunkCount: chunk.getNetworkSubChunkCount(),
        clientSubChunkRequestsEnabled: false,
        cached,
        ...(cached ? { blobHashes: [...chunkBlobs.blobHashes] } : {}),
        payload: cached ? chunkBlobs.cachedPayload : chunkBlobs.payload
    });
};

const uniqueBlobs = (indices: readonly number[]): Array<{ blobId: bigint; blobData: Buffer }> => {
    const byId = new Map<bigint, Buffer>();
    for (const index of indices) {
        for (const blob of prepared[index]!.blobs) {
            const previous = byId.get(blob.id);
            if (previous !== undefined && !previous.equals(blob.data)) {
                throw new Error(`XXHash64 collision for blob ${blob.id}`);
            }
            byId.set(blob.id, blob.data);
        }
    }
    return [...byId].map(([blobId, blobData]) => ({ blobId, blobData }));
};

const encodedBytes = async (packets: readonly LevelChunkPacket[]): Promise<number> => {
    let total = 0;
    for (const packet of packets) {
        const batch = await encodePacketBatchAsync([packet], Codec2193, { compressionLevel: COMPRESSION_LEVEL });
        total += batch.content.byteLength;
    }
    return total;
};

const cacheEnabledBytes = async (indices: readonly number[], missingIndices: readonly number[]): Promise<object> => {
    const levelChunkBytes = await encodedBytes(indices.map((index) => packetFor(index, true)));
    const blobs = uniqueBlobs(missingIndices);
    let missResponseBytes = 0;
    if (blobs.length > 0) {
        const response = new ClientCacheMissResponsePacket();
        response.blobs = blobs;
        const batch = await encodePacketBatchAsync([response], Codec2193, { compressionLevel: COMPRESSION_LEVEL });
        missResponseBytes = batch.content.byteLength;
    }
    return {
        levelChunkBytes,
        missResponseBytes,
        totalBytes: levelChunkBytes + missResponseBytes,
        uniqueMissBlobs: blobs.length
    };
};

const cacheDisabledBytes = async (indices: readonly number[]): Promise<object> => {
    const totalBytes = await encodedBytes(indices.map((index) => packetFor(index, false)));
    return { levelChunkBytes: totalBytes, missResponseBytes: 0, totalBytes, uniqueMissBlobs: 0 };
};

const initialIndices = chunks.slice(0, 12).map((_chunk, index) => index);
const returningIndices = [...initialIndices];
const walkingBackIndices = [...initialIndices.slice(0, 8), 12, 13, 14, 15];
const initialMisses = initialIndices;
const returnMisses: number[] = [];
const walkingBackMisses = [12, 13, 14, 15];

process.stdout.write(
    `${JSON.stringify(
        {
            protocol: Codec2193.protocolVersion,
            compressionLevel: COMPRESSION_LEVEL,
            bytesMeasured: 'compressed Minecraft batch frames before RakNet framing and encryption',
            phases: {
                join: {
                    cacheDisabled: await cacheDisabledBytes(initialIndices),
                    cacheEnabled: await cacheEnabledBytes(initialIndices, initialMisses)
                },
                leave: { cacheDisabled: { totalBytes: 0 }, cacheEnabled: { totalBytes: 0 } },
                rejoin: {
                    cacheDisabled: await cacheDisabledBytes(returningIndices),
                    cacheEnabled: await cacheEnabledBytes(returningIndices, returnMisses)
                },
                walkingBack: {
                    cacheDisabled: await cacheDisabledBytes(walkingBackIndices),
                    cacheEnabled: await cacheEnabledBytes(walkingBackIndices, walkingBackMisses)
                }
            }
        },
        null,
        2
    )}\n`
);
