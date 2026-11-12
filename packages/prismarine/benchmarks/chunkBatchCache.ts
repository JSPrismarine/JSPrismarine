/** Compares one four-chunk batch per viewer with revision-cached one-chunk batches. */
import { performance } from 'node:perf_hooks';

import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { BatchCodec } from '@jsprismarine/protocol';
import LevelChunkPacket from '@jsprismarine/protocol/packet/LevelChunkPacket';
import { BlockRuntimeIds } from '../src/block/state/BlockRuntimeIds';
import ChunkBatchCache from '../src/network/ChunkBatchCache';
import Codec2193 from '../src/network/codec/Codec2193';
import { Dimensions } from '../src/world/DimensionType';
import Chunk from '../src/world/chunk/Chunk';
import { encodePacketBatchAsync } from '../src/network/encodePacketBatch';

const COMPRESSION_LEVEL = 7;
const materialNames = [
    'minecraft:stone',
    'minecraft:dirt',
    'minecraft:grass_block',
    'minecraft:sand',
    'minecraft:gravel',
    'minecraft:oak_planks',
    'minecraft:glass',
    'minecraft:cobblestone',
    'minecraft:andesite',
    'minecraft:diorite',
    'minecraft:granite',
    'minecraft:coal_ore',
    'minecraft:iron_ore',
    'minecraft:oak_log',
    'minecraft:netherrack',
    'minecraft:obsidian'
];
const materials = materialNames.flatMap((name) => {
    const runtimeId = BlockRuntimeIds.tryGetByName(name);
    return runtimeId === null ? [] : [runtimeId];
});
if (materials.length < 16) throw new Error(`Expected 16 benchmark block states, found ${materials.length}`);

const chunks = Array.from({ length: 4 }, (_unused, index) => {
    const chunk = new Chunk(index, 0, new Map(), Dimensions.Overworld);
    let random = (index + 1) * 0x9e3779b1;
    for (let y = -64; y < 64; y++) {
        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) {
                random ^= random << 13;
                random ^= random >>> 17;
                random ^= random << 5;
                chunk.setBlockRuntimeId(x, y, z, materials[random & 0xf]!);
            }
        }
    }
    return chunk;
});

const packetFor = (chunk: Chunk): LevelChunkPacket =>
    new LevelChunkPacket({
        chunkX: chunk.getX(),
        chunkZ: chunk.getZ(),
        dimension: chunk.getDimension().bedrockId,
        subChunkCount: chunk.getNetworkSubChunkCount(),
        clientSubChunkRequestsEnabled: false,
        cached: false,
        payload: chunk.networkSerialize()
    });

const measureMainThreadMs = (before: ReturnType<typeof performance.eventLoopUtilization>): number =>
    performance.eventLoopUtilization(before).active;

const run = async (viewers: number): Promise<void> => {
    const batchCodec = BatchCodec.compressed({
        algorithm: PacketCompressionAlgorithm.ZLIB,
        level: COMPRESSION_LEVEL
    });
    const baselineBefore = performance.eventLoopUtilization();
    let baselineWireBytes = 0;
    let lastBaselineFrame: Buffer = Buffer.alloc(0);
    for (let viewer = 0; viewer < viewers; viewer++) {
        const batch = await encodePacketBatchAsync(chunks.map(packetFor), Codec2193, {
            compressionLevel: COMPRESSION_LEVEL
        });
        lastBaselineFrame = batch.content;
        baselineWireBytes += batch.content.byteLength;
    }
    const baselineRssBytes = process.memoryUsage().rss;
    const baselineMainThreadMs = measureMainThreadMs(baselineBefore);

    const cache = new ChunkBatchCache();
    const cachedBefore = performance.eventLoopUtilization();
    let cachedWireBytes = 0;
    for (let viewer = 0; viewer < viewers; viewer++) {
        for (const chunk of chunks) {
            const batch = await cache.getOrCreate(
                chunk,
                chunk.getNetworkRevision(),
                Codec2193,
                COMPRESSION_LEVEL,
                () => [packetFor(chunk)]
            );
            cachedWireBytes += batch.content.byteLength;
        }
    }
    const cachedRssBytes = process.memoryUsage().rss;
    const cachedMainThreadMs = measureMainThreadMs(cachedBefore);

    process.stdout.write(
        `${JSON.stringify({
            viewers,
            compressionLevel: COMPRESSION_LEVEL,
            baseline: {
                batchChunks: 4,
                mainThreadMs: Number(baselineMainThreadMs.toFixed(2)),
                compressionCount: viewers,
                memoryBytes: baselineRssBytes,
                wireBytes: baselineWireBytes
            },
            cached: {
                batchChunks: 1,
                mainThreadMs: Number(cachedMainThreadMs.toFixed(2)),
                compressionCount: cache.compressionCount,
                memoryBytes: cachedRssBytes,
                retainedCacheBytes: cache.memoryBytes,
                wireBytes: cachedWireBytes
            },
            decodedPacketCount: batchCodec.decode(lastBaselineFrame).length
        })}\n`
    );
};

for (const viewers of [1, 4, 16]) await run(viewers);
