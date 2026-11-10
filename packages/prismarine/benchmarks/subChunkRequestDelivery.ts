/** Measures request-mode chunk delivery CPU and compressed bytes for a first join and a walk back. */
import ClientCacheMissResponsePacket from '@jsprismarine/protocol/packet/ClientCacheMissResponsePacket';
import LevelChunkPacket from '@jsprismarine/protocol/packet/LevelChunkPacket';
import SubChunkPacket, { SubChunkRequestResult } from '@jsprismarine/protocol/packet/SubChunkPacket';
import SubChunkPos from '@jsprismarine/protocol/structure/SubChunkPos';
import SubChunkPosOffset from '@jsprismarine/protocol/structure/SubChunkPosOffset';
import { performance } from 'node:perf_hooks';

import { BlockRuntimeIds } from '../src/block/state/BlockRuntimeIds';
import { ClientBlobCache } from '../src/network/ClientBlobCache';
import Codec2193 from '../src/network/codec/Codec2193';
import { encodePacketBatchAsync } from '../src/network/encodePacketBatch';
import { Dimensions, maxSubChunk, minSubChunk } from '../src/world/Dimension';
import Chunk from '../src/world/chunk/Chunk';

const COMPRESSION_LEVEL = 7;
const SAMPLE_COUNT = 3;
const CHUNK_COUNT = 12;
const center = new SubChunkPos(Math.floor(CHUNK_COUNT / 2), minSubChunk(Dimensions.Overworld), 0);
const stone = BlockRuntimeIds.getByName('minecraft:stone');
const grass = BlockRuntimeIds.getByName('minecraft:grass_block');

const makeChunks = (): Chunk[] =>
    Array.from({ length: CHUNK_COUNT }, (_unused, index) => {
        const chunk = new Chunk(index, 0, new Map(), Dimensions.Overworld);
        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                chunk.fillColumn(x, z, -64, -49, stone);
                if ((x + z + index) % 3 !== 0) chunk.setBlockRuntimeId(x, 64, z, grass);
            }
        }
        return chunk;
    });

interface PhaseMeasurement {
    readonly serverCpuMs: number;
    readonly wallMs: number;
    readonly compressedBytes: number;
    readonly levelChunkBytes: number;
    readonly subChunkResponseBytes: number;
    readonly cacheMissResponseBytes: number;
    readonly levelChunks: number;
    readonly subChunkEntries: number;
    readonly uniqueBlobIds: number;
}

const measurePhase = async (
    chunks: readonly Chunk[],
    cache: ClientBlobCache,
    walkBack: boolean
): Promise<PhaseMeasurement> => {
    const cpuStarted = process.cpuUsage();
    const started = performance.now();
    const levelChunks = chunks.map(
        (chunk) =>
            new LevelChunkPacket({
                chunkX: chunk.getX(),
                chunkZ: chunk.getZ(),
                dimension: chunk.getDimension().bedrockId,
                subChunkCount: chunk.getNetworkSubChunkRequestLimit(),
                clientSubChunkRequestsEnabled: true,
                cached: false,
                payload: chunk.networkSerializeRequestSkeleton()
            })
    );
    const entries = [];
    const missingIds: bigint[] = [];
    const foundIds: bigint[] = [];
    for (const chunk of chunks) {
        const highestY = Math.min(
            maxSubChunk(chunk.getDimension()),
            minSubChunk(chunk.getDimension()) + chunk.getNetworkSubChunkRequestLimit()
        );
        for (let y = minSubChunk(chunk.getDimension()); y <= highestY; y++) {
            const blob = cache.prepareRequestSubChunk(chunk, y);
            const offset = new SubChunkPosOffset(chunk.getX() - center.x, y - center.y, chunk.getZ() - center.z);
            const heightMaps = chunk.networkSubChunkHeightmaps(y);
            // An all-air section goes without bytes or a blob id, as `PlayerSession` answers it.
            if (blob.data.byteLength === 2 && blob.data[0] === 8 && blob.data[1] === 0) {
                entries.push({ offset, result: SubChunkRequestResult.SUCCESS_ALL_AIR, heightMaps });
                continue;
            }
            cache.track([blob]);
            const hasClientBlob = cache.hasClientBlob(blob.id);
            const entry = { offset, result: SubChunkRequestResult.SUCCESS, heightMaps, blobId: blob.id };

            if (!walkBack) {
                foundIds.push(blob.id);
                Object.assign(entry, { serializedSubChunk: blob.data });
            } else if (!hasClientBlob) {
                throw new Error(`Walk-back cache did not retain subchunk blob ${blob.id}`);
            }
            entries.push(entry);
        }
    }

    const subChunkResponse = new SubChunkPacket({
        cacheEnabled: true,
        dimension: Dimensions.Overworld.bedrockId,
        centerPos: center,
        entries
    });
    const missBlobs = walkBack ? [] : cache.respond(missingIds, foundIds);
    const missResponse = new ClientCacheMissResponsePacket();
    missResponse.blobs = missBlobs;

    let levelChunkBytes = 0;
    for (const packet of levelChunks) {
        const encoded = await encodePacketBatchAsync([packet], Codec2193, { compressionLevel: COMPRESSION_LEVEL });
        levelChunkBytes += encoded.content.byteLength;
    }
    const encodedSubChunks = await encodePacketBatchAsync([subChunkResponse], Codec2193, {
        compressionLevel: COMPRESSION_LEVEL
    });
    let cacheMissResponseBytes = 0;
    if (missBlobs.length > 0) {
        const encodedMisses = await encodePacketBatchAsync([missResponse], Codec2193, {
            compressionLevel: COMPRESSION_LEVEL
        });
        cacheMissResponseBytes = encodedMisses.content.byteLength;
    }

    if (!walkBack) cache.respond([], missingIds);
    const cpu = process.cpuUsage(cpuStarted);
    const wallMs = performance.now() - started;
    return {
        serverCpuMs: Number(((cpu.user + cpu.system) / 1000).toFixed(3)),
        compressedBytes: levelChunkBytes + encodedSubChunks.content.byteLength + cacheMissResponseBytes,
        levelChunkBytes,
        subChunkResponseBytes: encodedSubChunks.content.byteLength,
        cacheMissResponseBytes,
        levelChunks: levelChunks.length,
        subChunkEntries: entries.length,
        uniqueBlobIds: new Set(entries.flatMap((entry) => ('blobId' in entry ? [entry.blobId] : []))).size,
        wallMs: Number(wallMs.toFixed(3))
    };
};

const median = (values: readonly number[]): number => {
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.floor(sorted.length / 2)]!;
};

const summarize = (values: readonly PhaseMeasurement[]): PhaseMeasurement => ({
    serverCpuMs: median(values.map(({ serverCpuMs }) => serverCpuMs)),
    compressedBytes: median(values.map(({ compressedBytes }) => compressedBytes)),
    levelChunkBytes: median(values.map(({ levelChunkBytes }) => levelChunkBytes)),
    subChunkResponseBytes: median(values.map(({ subChunkResponseBytes }) => subChunkResponseBytes)),
    cacheMissResponseBytes: median(values.map(({ cacheMissResponseBytes }) => cacheMissResponseBytes)),
    levelChunks: median(values.map(({ levelChunks }) => levelChunks)),
    subChunkEntries: median(values.map(({ subChunkEntries }) => subChunkEntries)),
    uniqueBlobIds: median(values.map(({ uniqueBlobIds }) => uniqueBlobIds)),
    wallMs: median(values.map(({ wallMs }) => wallMs))
});

const initialJoin: PhaseMeasurement[] = [];
const walkingBack: PhaseMeasurement[] = [];
for (let sample = 0; sample < SAMPLE_COUNT; sample++) {
    const chunks = makeChunks();
    const cache = new ClientBlobCache();
    initialJoin.push(await measurePhase(chunks, cache, false));
    walkingBack.push(await measurePhase(chunks, cache, true));
}

process.stdout.write(
    `${JSON.stringify(
        {
            protocol: Codec2193.protocolVersion,
            compressionLevel: COMPRESSION_LEVEL,
            chunks: CHUNK_COUNT,
            samples: SAMPLE_COUNT,
            measured:
                'compressed packet batch bytes before RakNet framing and encryption; process CPU time for serialization and compression',
            phases: {
                initialJoin: summarize(initialJoin),
                walkingBack: summarize(walkingBack)
            }
        },
        null,
        2
    )}\n`
);
