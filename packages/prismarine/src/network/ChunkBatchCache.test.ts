import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { BatchCodec } from '@jsprismarine/protocol';
import type { NetworkPacket } from '@jsprismarine/protocol';
import LevelChunkPacket from '@jsprismarine/protocol/packet/LevelChunkPacket';
import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import { BlockEntityRegistry } from '../blockentity/BlockEntityRegistry';
import { Dimensions } from '../world/DimensionType';
import Chunk from '../world/chunk/Chunk';
import ChunkBatchCache from './ChunkBatchCache';
import Codec2193 from './codec/Codec2193';
import Codec2225 from './codec/Codec2225';
import { encodePacketBatchAsync } from './encodePacketBatch';

const packetFor = (chunk: Chunk): NetworkPacket<unknown> =>
    new LevelChunkPacket({
        chunkX: chunk.getX(),
        chunkZ: chunk.getZ(),
        dimension: chunk.getDimension().bedrockId,
        subChunkCount: chunk.getNetworkSubChunkCount(),
        clientSubChunkRequestsEnabled: false,
        cached: false,
        payload: chunk.networkSerialize()
    });

const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

describe('network', () => {
    describe('ChunkBatchCache', () => {
        it('reuses compressed bytes and preserves the encoded LevelChunk packet', async () => {
            const cache = new ChunkBatchCache();
            const chunk = new Chunk(3, -2, new Map(), Dimensions.Overworld);
            chunk.setBlockRuntimeId(1, 70, 2, BlockRuntimeIds.getByName('minecraft:stone'));
            let packetsBuilt = 0;
            const createPacket = () => {
                packetsBuilt++;
                return [packetFor(chunk)];
            };
            const revision = chunk.getNetworkRevision();

            const first = await cache.getOrCreate(chunk, revision, Codec2193, 7, createPacket);
            const reused = await cache.getOrCreate(chunk, revision, Codec2193, 7, createPacket);
            const uncached = await encodePacketBatchAsync(createPacket(), Codec2193, { compressionLevel: 7 });
            const codec = BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB, level: 7 });

            expect(reused.content).toBe(first.content);
            expect(cache.compressionCount).toBe(1);
            expect(packetsBuilt).toBe(2); // first cached encoding and the uncached oracle only
            const cachedPacket = codec.decode(first.content)[0]!;
            const uncachedPacket = codec.decode(uncached.content)[0]!;
            expect(cachedPacket.equals(first.packetBuffers[0]!)).toBe(true);
            expect(digest(cachedPacket)).toBe(digest(uncachedPacket));
        });

        it('keys batches by protocol and compression settings', async () => {
            const cache = new ChunkBatchCache();
            const chunk = new Chunk();
            const revision = chunk.getNetworkRevision();
            const packet = () => [packetFor(chunk)];

            const old = await cache.getOrCreate(chunk, revision, Codec2193, 1, packet);
            const modern = await cache.getOrCreate(chunk, revision, Codec2225, 1, packet);
            const stronger = await cache.getOrCreate(chunk, revision, Codec2193, 7, packet);

            expect(modern.content).not.toBe(old.content);
            expect(stronger.content).not.toBe(old.content);
            expect(cache.compressionCount).toBe(3);
        });

        it('keeps cached bytes separate for each negotiated compression algorithm', async () => {
            const cache = new ChunkBatchCache();
            const chunk = new Chunk();
            const revision = chunk.getNetworkRevision();
            const packet = () => [packetFor(chunk)];

            const zlib = await cache.getOrCreate(
                chunk,
                revision,
                Codec2193,
                1,
                packet,
                PacketCompressionAlgorithm.ZLIB
            );
            const snappy = await cache.getOrCreate(
                chunk,
                revision,
                Codec2193,
                1,
                packet,
                PacketCompressionAlgorithm.SNAPPY
            );

            expect(snappy.content).not.toBe(zlib.content);
            expect(cache.compressionCount).toBe(2);
            expect(
                BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.SNAPPY }).decode(snappy.content)
            ).toHaveLength(1);
        });

        it('keeps cached and uncached chunk packet variants in separate entries', async () => {
            const cache = new ChunkBatchCache();
            const chunk = new Chunk();
            const revision = chunk.getNetworkRevision();
            const uncached = await cache.getOrCreate(chunk, revision, Codec2193, 1, () => [packetFor(chunk)]);
            const prepared = chunk.networkSerializeBlobs();
            const cached = await cache.getOrCreate(
                chunk,
                revision,
                Codec2193,
                1,
                () => [
                    new LevelChunkPacket({
                        chunkX: chunk.getX(),
                        chunkZ: chunk.getZ(),
                        dimension: chunk.getDimension().bedrockId,
                        subChunkCount: chunk.getNetworkSubChunkCount(),
                        clientSubChunkRequestsEnabled: false,
                        cached: true,
                        blobHashes: [1n],
                        payload: prepared.cachedPayload
                    })
                ],
                PacketCompressionAlgorithm.ZLIB,
                1,
                'client-cache'
            );
            const cachedAgain = await cache.getOrCreate(
                chunk,
                revision,
                Codec2193,
                1,
                () => [
                    new LevelChunkPacket({
                        chunkX: chunk.getX(),
                        chunkZ: chunk.getZ(),
                        dimension: chunk.getDimension().bedrockId,
                        subChunkCount: chunk.getNetworkSubChunkCount(),
                        clientSubChunkRequestsEnabled: false,
                        cached: true,
                        blobHashes: [1n],
                        payload: prepared.cachedPayload
                    })
                ],
                PacketCompressionAlgorithm.ZLIB,
                1,
                'client-cache'
            );

            expect(cached.content).not.toBe(uncached.content);
            expect(cachedAgain.content).toBe(cached.content);
            expect(cache.compressionCount).toBe(2);
        });

        it('invalidates cached batches after block, block entity, and biome edits', async () => {
            const cache = new ChunkBatchCache();
            const chunk = new Chunk();
            const getBatch = () =>
                cache.getOrCreate(chunk, chunk.getNetworkRevision(), Codec2193, 7, () => [packetFor(chunk)]);
            const first = await getBatch();

            chunk.setBlockRuntimeId(1, 70, 2, BlockRuntimeIds.getByName('minecraft:stone'));
            const afterBlock = await getBatch();
            expect(afterBlock.content).not.toBe(first.content);

            const tag = new NBTTagCompound('');
            tag.addValue('id', new Types.StringVal('Chest'));
            tag.addValue('x', new Types.NumberVal(1));
            tag.addValue('y', new Types.NumberVal(70));
            tag.addValue('z', new Types.NumberVal(2));
            chunk.setBlockEntity(BlockEntityRegistry.fromNBT(tag));
            const afterBlockEntity = await getBatch();
            expect(afterBlockEntity.content).not.toBe(afterBlock.content);

            chunk.getBiomes().set(1, 70, 2, 2);
            const afterBiome = await getBatch();
            expect(afterBiome.content).not.toBe(afterBlockEntity.content);
            expect(cache.compressionCount).toBe(4);

            for (const batch of [first, afterBlock, afterBlockEntity, afterBiome]) {
                const packetBytes = BatchCodec.compressed({
                    algorithm: PacketCompressionAlgorithm.ZLIB,
                    level: 7
                }).decode(batch.content)[0]!;
                expect(packetBytes.equals(batch.packetBuffers[0]!)).toBe(true);
            }
        });

        it('evicts least-recently used chunks at the configured byte limit', async () => {
            const chunk = new Chunk();
            const packet = () => [packetFor(chunk)];
            const estimate = await new ChunkBatchCache().getOrCreate(
                chunk,
                chunk.getNetworkRevision(),
                Codec2193,
                1,
                packet
            );
            const cache = new ChunkBatchCache(estimate.memoryBytes + 1);
            const first = await cache.getOrCreate(chunk, chunk.getNetworkRevision(), Codec2193, 1, packet);
            const secondChunk = new Chunk(1, 0);
            await cache.getOrCreate(secondChunk, secondChunk.getNetworkRevision(), Codec2193, 1, () => [
                packetFor(secondChunk)
            ]);
            expect(cache.compressionCount).toBe(2);

            await cache.getOrCreate(chunk, chunk.getNetworkRevision(), Codec2193, 1, packet);

            expect(cache.memoryBytes).toBeLessThanOrEqual(estimate.memoryBytes + 1);
            expect(first.content.byteLength).toBeGreaterThan(0);
            expect(cache.compressionCount).toBe(3);
        });
    });
});
