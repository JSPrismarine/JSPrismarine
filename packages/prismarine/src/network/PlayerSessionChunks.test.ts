import { beforeEach, describe, expect, it } from 'vitest';

import type Player from '../Player';
import type Server from '../Server';
import type { Config } from '../config/Config';
import { stub } from '../testing/stub.test.helper';
import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import type { NetworkPacket } from '@jsprismarine/protocol';
import ClientCacheBlobStatusPacket from '@jsprismarine/protocol/packet/ClientCacheBlobStatusPacket';
import ClientCacheMissResponsePacket from '@jsprismarine/protocol/packet/ClientCacheMissResponsePacket';
import LevelChunkPacket from '@jsprismarine/protocol/packet/LevelChunkPacket';
import { Dimensions } from '../world/Dimension';
import Chunk from '../world/chunk/Chunk';
import type { World } from '../world/World';
import type { ChunkScheduler } from '../world/ChunkScheduler';
import { Position } from '../world/Position';
import type ClientConnection from './ClientConnection';
import PlayerSession from './PlayerSession';
import Codec2193 from './codec/Codec2193';
import { ClientBlobCache } from './ClientBlobCache';

/**
 * The chunk queue's lifecycle, which is the part of `PlayerSession` a moving player exercises
 * hardest: what gets queued, and - the half that was missing - what gets taken back out.
 *
 * `loadingChunks` and the `ChunkSender` queue are two views of the same thing. Whenever they
 * disagree the scheduler works on chunks nobody wants, or a chunk nobody will ever ask for
 * again leaves a hole in the world.
 */
describe('network', () => {
    describe('PlayerSession chunk queue', () => {
        /**
         * A player at a block position, which is all `needNewChunks` reads.
         *
         * `position` is a plain field a test walks the player by assigning to; `getPosition`,
         * which is what the session actually calls, reads it on every call.
         */
        const playerAt = (x: number, z: number, viewDistance = 2) => {
            const walkable: { position: { x: number; z: number }; player: Player } = {
                position: { x, z },
                player: stub<Player>({
                    viewDistance,
                    getPosition: () =>
                        stub<Position>({
                            getX: () => walkable.position.x,
                            getZ: () => walkable.position.z
                        })
                })
            };

            return walkable;
        };

        const server = stub<Server>({
            getChunkScheduler: () => stub<ChunkScheduler>({ add: () => {}, remove: () => {} }),
            // Read once in the constructor, to build the session's entity tracker.
            getConfig: () =>
                stub<Config>({
                    getProximityBroadcast: () => true,
                    getEntityTrackingHysteresis: () => 2,
                    getEntityTrackingInterval: () => 4,
                    getPacketCompressionLevel: () => 7
                })
        });

        let player: ReturnType<typeof playerAt>;
        let session: PlayerSession;

        beforeEach(() => {
            player = playerAt(0, 0);
            session = new PlayerSession(server, stub<ClientConnection>(), player.player);
        });

        it('queues the chunks around the player', async () => {
            await session.needNewChunks();

            expect(session.sender.size).toBeGreaterThan(0);
            expect(session.sender.has(0, 0)).toBe(true);
        });

        it('forgets chunks the player walked away from', async () => {
            // Queued but never drained - the scheduler has a budget, so this is the ordinary
            // case, not a corner one. Walking off used to drop only the bookkeeping, leaving
            // the coordinates in the queue: the scheduler then generated and sent a region
            // the player had already left, ahead of the one in front of them.
            await session.needNewChunks();
            expect(session.sender.has(0, 0)).toBe(true);
            const queuedNear = session.sender.size;

            player.position = { x: 16 * 400, z: 16 * 400 };
            await session.needNewChunks();

            expect(session.sender.has(0, 0)).toBe(false);
            expect(session.sender.has(400, 400)).toBe(true);
            // The old region is gone rather than added to: the queue is the new one's size,
            // not both. Pacing back and forth used to grow it without bound.
            expect(session.sender.size).toBe(queuedNear);
        });

        it('does not requeue a chunk it is already sending', async () => {
            await session.needNewChunks();
            const size = session.sender.size;

            await session.needNewChunks();

            expect(session.sender.size).toBe(size);
        });

        it('drops everything in flight when the chunks are cleared', async () => {
            // A dimension or world change. What is queued belongs to the world being left.
            await session.needNewChunks();
            expect(session.sender.isEmpty()).toBe(false);

            await session.clearChunks();

            expect(session.sender.isEmpty()).toBe(true);
            expect(session.sender.has(0, 0)).toBe(false);
        });

        it('queues afresh for the new world after a clear', async () => {
            await session.needNewChunks();
            await session.clearChunks();

            player.position = { x: 16 * 50, z: 16 * 50 };
            await session.needNewChunks();

            expect(session.sender.has(50, 50)).toBe(true);
            expect(session.sender.has(0, 0)).toBe(false);
        });

        it('limits resident chunk payload bytes for one connection', () => {
            const chunk = new Chunk(1, 2, new Map(), Dimensions.Overworld);
            const secondChunk = new Chunk(2, 2, new Map(), Dimensions.Overworld);
            const world = stub<World>({
                getLoadedChunk: (x, z) => (x === 1 && z === 2 ? chunk : x === 2 && z === 2 ? secondChunk : null)
            });
            const playerWithWorld = stub<Player>({
                viewDistance: 2,
                getPosition: () => stub<Position>({ getX: () => 0, getZ: () => 0 }),
                getWorld: () => world
            });
            const residentSession = new PlayerSession(server, stub<ClientConnection>(), playerWithWorld);
            const payloadBytes = chunk.networkSerialize().byteLength;

            expect(residentSession.tryDeliverLoaded(1, 2)).toEqual({ kind: 'queued', queuedBytes: payloadBytes });
            expect(Reflect.get(residentSession, 'queuedChunkBytes')).toBe(payloadBytes);

            const byteLimit = Reflect.get(residentSession, 'queuedChunkBytesLimit');
            if (typeof byteLimit !== 'number') throw new Error('Player session chunk byte limit is unavailable');
            Reflect.set(residentSession, 'queuedChunkBytes', byteLimit);

            expect(residentSession.tryDeliverLoaded(2, 2)).toEqual({ kind: 'backpressure' });
            expect(Reflect.get(residentSession, 'chunkSendQueue')).toHaveLength(1);
        });

        it('queues cache metadata while accounting for the complete chunk bytes', () => {
            const chunk = new Chunk(1, 2, new Map(), Dimensions.Overworld);
            chunk.setBlockRuntimeId(1, 70, 2, BlockRuntimeIds.getByName('minecraft:stone'));
            const world = stub<World>({ getLoadedChunk: () => chunk });
            const cachePlayer = stub<Player>({
                viewDistance: 2,
                getPosition: () => stub<Position>({ getX: () => 0, getZ: () => 0 }),
                getWorld: () => world
            });
            const cacheSession = new PlayerSession(server, stub<ClientConnection>(), cachePlayer);
            const prepared = chunk.networkSerializeBlobs();
            cacheSession.setClientCacheEnabled(true);

            const delivered = cacheSession.tryDeliverLoaded(1, 2);
            const queued = Reflect.get(cacheSession, 'chunkSendQueue');

            expect(delivered).toEqual({ kind: 'queued', queuedBytes: prepared.payload.byteLength });
            expect(queued).toMatchObject([
                {
                    payload: prepared.cachedPayload,
                    memoryBytes: prepared.payload.byteLength,
                    blobs: prepared.subChunks
                        .map(({ bytes }) => ({ data: bytes }))
                        .concat({ data: prepared.biomes.bytes }),
                    blobHashes: expect.any(Array)
                }
            ]);
            expect(Reflect.get(cacheSession, 'queuedChunkBytes')).toBe(prepared.payload.byteLength);

            cacheSession.setClientCacheEnabled(false);

            expect(queued).toMatchObject([{ payload: prepared.payload, memoryBytes: prepared.payload.byteLength }]);
            expect(queued).not.toMatchObject([{ blobs: expect.any(Array), blobHashes: expect.any(Array) }]);
            expect(Reflect.get(cacheSession, 'queuedChunkBytes')).toBe(prepared.payload.byteLength);
        });

        it('sends cached chunk metadata and answers only requested blobs until they are acknowledged', async () => {
            const chunk = new Chunk(1, 2, new Map(), Dimensions.Overworld);
            chunk.setBlockRuntimeId(1, 70, 2, BlockRuntimeIds.getByName('minecraft:stone'));
            const world = stub<World>({ getLoadedChunk: () => chunk });
            const playerWithWorld = stub<Player>({
                viewDistance: 2,
                getPosition: () => new Position(0, 64, 0, world),
                getWorld: () => world
            });
            const sentPackets: NetworkPacket<unknown>[] = [];
            const sentBatches: NetworkPacket<unknown>[][] = [];
            const connection = stub<ClientConnection>({
                codec: Codec2193,
                sendDataPacket: async (packet) => void sentPackets.push(packet),
                sendSharedCompressedBatchAsync: async (_content, packets) => void sentBatches.push([...packets])
            });
            const cacheSession = new PlayerSession(server, connection, playerWithWorld);
            cacheSession.setClientCacheEnabled(true);
            const prepared = new ClientBlobCache().prepareChunk(chunk);
            cacheSession.tryDeliverLoaded(1, 2);

            await cacheSession.flush();

            const chunkPacket = sentBatches
                .flat()
                .find((packet): packet is LevelChunkPacket => packet instanceof LevelChunkPacket);
            expect(chunkPacket?.getPacketData()).toMatchObject({
                cached: true,
                blobHashes: prepared.blobHashes,
                payload: prepared.cachedPayload
            });

            const missing = new ClientCacheBlobStatusPacket();
            missing.missingIds = [...prepared.blobHashes];
            const sentCount = await cacheSession.handleClientCacheBlobStatus(missing);

            expect(sentCount).toBe(new Set(prepared.blobHashes).size);
            const response = sentPackets.find(
                (packet): packet is ClientCacheMissResponsePacket => packet instanceof ClientCacheMissResponsePacket
            );
            expect(response?.blobs).toEqual(
                [...new Map(prepared.blobs.map(({ id, data }) => [id, data]))].map(([blobId, blobData]) => ({
                    blobId,
                    blobData
                }))
            );

            const acknowledged = new ClientCacheBlobStatusPacket();
            acknowledged.foundIds = [...prepared.blobHashes];
            await cacheSession.handleClientCacheBlobStatus(acknowledged);
            expect(await cacheSession.handleClientCacheBlobStatus(missing)).toBe(0);
            expect(sentPackets.filter((packet) => packet instanceof ClientCacheMissResponsePacket)).toHaveLength(1);
        });
    });
});
