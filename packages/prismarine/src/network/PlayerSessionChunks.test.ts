import { beforeEach, describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type { SessionPlayer } from './sessionPlayers';
import type Server from '../Server';
import type { Config } from '../config/Config';
import { stub } from '../testing/stub.test.helper';
import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import type { NetworkPacket } from '@jsprismarine/protocol';
import ClientCacheBlobStatusPacket from '@jsprismarine/protocol/packet/ClientCacheBlobStatusPacket';
import ClientCacheMissResponsePacket from '@jsprismarine/protocol/packet/ClientCacheMissResponsePacket';
import LevelChunkPacket from '@jsprismarine/protocol/packet/LevelChunkPacket';
import SubChunkPacket, { SubChunkRequestResult } from '@jsprismarine/protocol/packet/SubChunkPacket';
import SubChunkRequestPacket from '@jsprismarine/protocol/packet/SubChunkRequestPacket';
import { Dimensions } from '../world/Dimension';
import Chunk from '../world/chunk/Chunk';
import type { World } from '../world/World';
import type { ChunkScheduler } from '../world/ChunkScheduler';
import { Position } from '../world/Position';
import type ClientConnection from './ClientConnection';
import type PlayerSession from './PlayerSession';
import { sessionFor } from '../testing/playerSession.test.helper';
import Codec2193 from './codec/Codec2193';
import Codec2225 from './codec/Codec2225';
import { xxHash64 } from './xxHash64';

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
        const playerAt = (x: number, z: number) => {
            const walkable: { position: { x: number; z: number }; player: SessionPlayer } = {
                position: { x, z },
                player: stub<SessionPlayer>({
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
            getLogger: () => stub<Logger>({ warn: () => {}, debug: () => {} }),
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
            session = sessionFor(server, stub<ClientConnection>(), player.player);
            // The radius the client asked for, which is the session's own.
            session['viewDistance'] = 2;
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

        it('forgets a chunk in the corner of the view, which the client has dropped, and sends it again', async () => {
            // Chunk 1, 1 is inside a radius of two around 0, 0. From -1, -1 it is two chunks off
            // on each axis: still inside a square of that size, outside the circle the client
            // keeps. Counting it as held left a hole when the player walked back.
            await session.needNewChunks();
            expect(session.sender.has(1, 1)).toBe(true);

            player.position = { x: -16, z: -16 };
            await session.needNewChunks();
            expect(session.sender.has(1, 1)).toBe(false);

            player.position = { x: 0, z: 0 };
            await session.needNewChunks();
            expect(session.sender.has(1, 1)).toBe(true);
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
            const playerWithWorld = stub<SessionPlayer>({
                getPosition: () => stub<Position>({ getX: () => 0, getZ: () => 0 })
            });
            const residentSession = sessionFor(server, stub<ClientConnection>({ codec: Codec2225 }), playerWithWorld, {
                world,
                joined: true
            });
            const payloadBytes = chunk.networkSerialize().byteLength;

            expect(residentSession.tryDeliverLoaded(1, 2)).toEqual({ kind: 'queued', queuedBytes: payloadBytes });
            expect(Reflect.get(residentSession, 'queuedChunkBytes')).toBe(payloadBytes);

            const byteLimit = Reflect.get(residentSession, 'queuedChunkBytesLimit');
            if (typeof byteLimit !== 'number') throw new Error('Player session chunk byte limit is unavailable');
            Reflect.set(residentSession, 'queuedChunkBytes', byteLimit);

            expect(residentSession.tryDeliverLoaded(2, 2)).toEqual({ kind: 'backpressure' });
            expect(Reflect.get(residentSession, 'chunkSendQueue')).toHaveLength(1);
        });

        it('queues request-mode skeleton bytes regardless of cache status', () => {
            const chunk = new Chunk(1, 2, new Map(), Dimensions.Overworld);
            chunk.setBlockRuntimeId(1, 70, 2, BlockRuntimeIds.getByName('minecraft:stone'));
            const world = stub<World>({ getLoadedChunk: () => chunk });
            const cachePlayer = stub<SessionPlayer>({
                getPosition: () => stub<Position>({ getX: () => 0, getZ: () => 0 })
            });
            const cacheSession = sessionFor(server, stub<ClientConnection>({ codec: Codec2225 }), cachePlayer, {
                world
            });
            const payload = chunk.networkSerializeRequestSkeleton();
            cacheSession.setClientCacheEnabled(true);

            const delivered = cacheSession.tryDeliverLoaded(1, 2);
            const queued = Reflect.get(cacheSession, 'chunkSendQueue');

            expect(delivered).toEqual({ kind: 'queued', queuedBytes: payload.byteLength });
            expect(queued).toMatchObject([
                {
                    payload,
                    memoryBytes: payload.byteLength
                }
            ]);
            expect(Reflect.get(cacheSession, 'queuedChunkBytes')).toBe(payload.byteLength);

            cacheSession.setClientCacheEnabled(false);

            expect(queued).toMatchObject([{ payload, memoryBytes: payload.byteLength }]);
            expect(queued).not.toMatchObject([{ blobs: expect.any(Array), blobHashes: expect.any(Array) }]);
            expect(Reflect.get(cacheSession, 'queuedChunkBytes')).toBe(payload.byteLength);
        });

        // A 2225 client is sent a skeleton and fetches the sub chunks itself, told how many it may
        // request. A 2193 client is sent whole chunks: asked to fetch them it never finishes
        // joining a world with more than one sub chunk.
        it.each([
            ['2193', Codec2193, false],
            ['2225', Codec2225, true]
        ] as const)(
            'sends a %s client its chunk the way that protocol is verified',
            async (_protocol, codec, requests) => {
                const chunk = new Chunk(1, 2, new Map(), Dimensions.Overworld);
                chunk.setBlockRuntimeId(1, 70, 2, BlockRuntimeIds.getByName('minecraft:stone'));
                const world = stub<World>({ getLoadedChunk: () => chunk });
                const playerWithWorld = stub<SessionPlayer>({
                    getPosition: () => new Position(0, 64, 0, world)
                });
                const sentBatches: NetworkPacket<unknown>[][] = [];
                const connection = stub<ClientConnection>({
                    codec,
                    sendDataPacket: async () => {},
                    sendSharedCompressedBatchAsync: async (_content, packets) => void sentBatches.push([...packets])
                });
                const cacheSession = sessionFor(server, connection, playerWithWorld, { world, joined: true });
                cacheSession.setClientCacheEnabled(true);
                const skeleton = chunk.networkSerializeRequestSkeleton();
                cacheSession.tryDeliverLoaded(1, 2);

                await cacheSession.flush();

                const chunkPacket = sentBatches
                    .flat()
                    .find((packet): packet is LevelChunkPacket => packet instanceof LevelChunkPacket);
                const chunkData = chunkPacket?.getPacketData();
                if (chunkData === null || chunkData === undefined)
                    throw new Error('LevelChunk packet data is unavailable');
                if (!requests) {
                    expect(chunkData).toMatchObject({
                        cached: false,
                        clientSubChunkRequestsEnabled: false,
                        subChunkCount: chunk.getNetworkSubChunkCount(),
                        payload: chunk.networkSerialize()
                    });
                    expect(chunkData.blobHashes).toBeUndefined();
                    return;
                }
                // As Bedrock Dedicated Server 1.26.60 announces a chunk to a client with its blob
                // cache on: the biomes by hash, and a payload of the border block count alone.
                const biomes = skeleton.subarray(0, -1);
                expect(chunkData).toMatchObject({
                    cached: true,
                    clientSubChunkRequestsEnabled: true,
                    subChunkCount: chunk.getNetworkSubChunkRequestLimit(),
                    blobHashes: [xxHash64(biomes)],
                    payload: Buffer.from([0])
                });

                // The client asks for the biomes it lacks like any other blob.
                const missing = new ClientCacheBlobStatusPacket();
                missing.missingIds = [xxHash64(biomes)];
                const sent: NetworkPacket<unknown>[] = [];
                connection.sendDataPacket = async (packet) => void sent.push(packet);
                await cacheSession.handleClientCacheBlobStatus(missing);
                const response = sent.at(-1);
                if (!(response instanceof ClientCacheMissResponsePacket)) throw new Error('No miss response was sent');
                expect(response.blobs).toEqual([{ blobId: xxHash64(biomes), blobData: biomes }]);
            }
        );

        it('answers missing, invalid, and repeated requests with request-mode results', async () => {
            const chunk = new Chunk(1, 2, new Map(), Dimensions.Overworld);
            chunk.setBlockRuntimeId(1, -64, 2, BlockRuntimeIds.getByName('minecraft:stone'));
            const world = stub<World>({
                getDimension: () => Dimensions.Overworld,
                getLoadedChunk: (x, z) => (x === 1 && z === 2 ? chunk : null)
            });
            const playerWithWorld = stub<SessionPlayer>({});
            const sentPackets: NetworkPacket<unknown>[] = [];
            const sessionWithResponses = sessionFor(
                server,
                stub<ClientConnection>({ sendDataPacket: async (packet) => void sentPackets.push(packet) }),
                playerWithWorld,
                { world, joined: true }
            );
            const request = new SubChunkRequestPacket();
            request.dimensionType = 0;
            request.centerPos = { x: 1, y: -4, z: 2 };
            request.offsets = [
                { x: 0, y: 0, z: 0 },
                { x: 1, y: 0, z: 0 },
                { x: 0, y: 300, z: 0 }
            ];

            expect(await sessionWithResponses.handleSubChunkRequest(request)).toBe(3);
            const first = sentPackets.at(-1);
            expect(first).toBeInstanceOf(SubChunkPacket);
            if (!(first instanceof SubChunkPacket)) throw new Error('SubChunkPacket response was not sent');
            const firstData = first.getPacketData();
            if (firstData === null) throw new Error('First SubChunkPacket data is unavailable');
            const firstEntries = firstData.entries;
            expect(firstEntries.map(({ result }) => result)).toEqual([
                SubChunkRequestResult.SUCCESS,
                SubChunkRequestResult.LEVEL_CHUNK_DOESNT_EXIST,
                SubChunkRequestResult.INDEX_OUT_OF_BOUNDS
            ]);
            expect(firstEntries[0]?.serializedSubChunk).toEqual(chunk.networkSerializeRequestSubChunk(-4));

            request.offsets = [{ x: 0, y: 0, z: 0 }];
            await sessionWithResponses.handleSubChunkRequest(request);
            const repeated = sentPackets.at(-1);
            if (!(repeated instanceof SubChunkPacket)) throw new Error('Repeated SubChunkPacket response was not sent');
            const repeatedData = repeated.getPacketData();
            if (repeatedData === null) throw new Error('Repeated SubChunkPacket data is unavailable');
            expect(repeatedData.entries[0]?.serializedSubChunk).toEqual(firstEntries[0]?.serializedSubChunk);

            request.dimensionType = 1;
            await sessionWithResponses.handleSubChunkRequest(request);
            const wrongDimension = sentPackets.at(-1);
            if (!(wrongDimension instanceof SubChunkPacket)) throw new Error('Wrong-dimension response was not sent');
            const wrongDimensionData = wrongDimension.getPacketData();
            if (wrongDimensionData === null) throw new Error('Wrong-dimension response data is unavailable');
            expect(wrongDimensionData.entries[0]?.result).toBe(SubChunkRequestResult.WRONG_DIMENSION);
        });

        it('reads back a chunk the client was told about when the world evicted it before the request', async () => {
            // The client asks for a column's sub chunks once, and "doesn't exist" is final for
            // that column, so a chunk unloaded between the LevelChunk and the request would stay
            // a hole in the client's view for good.
            const chunk = new Chunk(1, 2, new Map(), Dimensions.Overworld);
            chunk.setBlockRuntimeId(1, -64, 2, BlockRuntimeIds.getByName('minecraft:stone'));
            let resident: Chunk | null = chunk;
            const reads: string[] = [];
            const world = stub<World>({
                getDimension: () => Dimensions.Overworld,
                getLoadedChunk: () => resident,
                getChunk: async (x, z) => {
                    reads.push(`${x},${z}`);
                    resident = chunk;
                    return chunk;
                }
            });
            const playerWithWorld = stub<SessionPlayer>({
                getPosition: () => new Position(0, 64, 0, world)
            });
            const sent: NetworkPacket<unknown>[] = [];
            const connection = stub<ClientConnection>({
                codec: Codec2225,
                sendDataPacket: async (packet) => void sent.push(packet),
                sendSharedCompressedBatchAsync: async () => {}
            });
            const announced = sessionFor(server, connection, playerWithWorld, { world, joined: true });
            announced.tryDeliverLoaded(1, 2);
            await announced.flush();
            resident = null;

            const request = new SubChunkRequestPacket();
            request.dimensionType = 0;
            request.centerPos = { x: 1, y: -4, z: 2 };
            request.offsets = [
                { x: 0, y: 0, z: 0 },
                { x: 5, y: 0, z: 0 }
            ];
            await announced.handleSubChunkRequest(request);

            const response = sent.at(-1);
            if (!(response instanceof SubChunkPacket)) throw new Error('SubChunkPacket response was not sent');
            const entries = response.getPacketData()?.entries ?? [];
            // The announced column is served; one nobody announced is not loaded on request.
            expect(entries.map(({ result }) => result)).toEqual([
                SubChunkRequestResult.SUCCESS,
                SubChunkRequestResult.LEVEL_CHUNK_DOESNT_EXIST
            ]);
            expect(reads).toEqual(['1,2']);
        });

        it('answers a cached sub chunk with its hash and block entity payload, and its terrain on a miss', async () => {
            const chunk = new Chunk(1, 2, new Map(), Dimensions.Overworld);
            const world = stub<World>({
                getDimension: () => Dimensions.Overworld,
                getLoadedChunk: () => chunk
            });
            const playerWithWorld = stub<SessionPlayer>({});
            const sentPackets: NetworkPacket<unknown>[] = [];
            const cacheSession = sessionFor(
                server,
                stub<ClientConnection>({ sendDataPacket: async (packet) => void sentPackets.push(packet) }),
                playerWithWorld,
                { world, joined: true }
            );
            cacheSession.setClientCacheEnabled(true);
            const request = new SubChunkRequestPacket();
            request.dimensionType = 0;
            request.centerPos = { x: 1, y: -3, z: 2 };
            request.offsets = [{ x: 0, y: 0, z: 0 }];
            const entryOf = async () => {
                await cacheSession.handleSubChunkRequest(request);
                const response = sentPackets.at(-1);
                if (!(response instanceof SubChunkPacket)) throw new Error('SubChunkPacket response was not sent');
                const entry = response.getPacketData()?.entries[0];
                if (entry === undefined) throw new Error('SubChunkPacket carried no entry');
                return entry;
            };

            // An all-air section is its result alone, as a vanilla server answers: a client
            // caches nothing for it and reads no payload.
            const air = await entryOf();
            expect(air.result).toBe(SubChunkRequestResult.SUCCESS_ALL_AIR);
            expect(air.serializedSubChunk).toBeUndefined();
            expect(air.blobId).toBeUndefined();

            chunk.setBlockRuntimeId(1, -64, 2, BlockRuntimeIds.getByName('minecraft:stone'));
            request.centerPos = { x: 1, y: -4, z: 2 };
            const terrain = await entryOf();
            const { terrain: terrainBytes, blockEntities } = chunk.networkSerializeRequestSubChunkParts(-4);
            expect(terrain.result).toBe(SubChunkRequestResult.SUCCESS);
            // The payload is present and holds the block entities, none here; the terrain is not in it.
            expect(terrain.serializedSubChunk).toEqual(blockEntities);
            expect(terrain.serializedSubChunk).toHaveLength(0);
            const blobId = terrain.blobId;
            if (blobId === undefined) throw new Error('Cached terrain response did not include a blob id');

            const missing = new ClientCacheBlobStatusPacket();
            missing.missingIds = [blobId];
            expect(await cacheSession.handleClientCacheBlobStatus(missing)).toBe(1);
            const missResponse = sentPackets.at(-1);
            if (!(missResponse instanceof ClientCacheMissResponsePacket)) {
                throw new Error('ClientCacheMissResponsePacket was not sent');
            }
            expect(missResponse.blobs).toEqual([{ blobId, blobData: terrainBytes }]);

            // A client that confirmed the blob is answered the same way: the payload stays.
            // A status that misses nothing is still answered, with no blobs: the answer is what
            // closes the client's cache transaction.
            const found = new ClientCacheBlobStatusPacket();
            found.foundIds = [blobId];
            expect(await cacheSession.handleClientCacheBlobStatus(found)).toBe(0);
            const empty = sentPackets.at(-1);
            if (!(empty instanceof ClientCacheMissResponsePacket)) throw new Error('No empty miss response was sent');
            expect(empty.blobs).toEqual([]);
            const repeated = await entryOf();
            expect(repeated.blobId).toBe(blobId);
            expect(repeated.serializedSubChunk).toHaveLength(0);
        });
    });
});
