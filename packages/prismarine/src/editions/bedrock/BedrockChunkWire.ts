import type ClientCacheBlobStatusPacket from '@jsprismarine/protocol/bedrock/packet/ClientCacheBlobStatusPacket';
import ChunkRadiusUpdatedPacket from '@jsprismarine/protocol/bedrock/packet/ChunkRadiusUpdatedPacket';
import ClientCacheMissResponsePacket from '@jsprismarine/protocol/bedrock/packet/ClientCacheMissResponsePacket';
import LevelChunkPacket from '@jsprismarine/protocol/bedrock/packet/LevelChunkPacket';
import NetworkChunkPublisherUpdatePacket from '@jsprismarine/protocol/bedrock/packet/NetworkChunkPublisherUpdatePacket';
import SubChunkPacket, { SubChunkRequestResult } from '@jsprismarine/protocol/bedrock/packet/SubChunkPacket';
import type { SubChunkEntry } from '@jsprismarine/protocol/bedrock/packet/SubChunkPacket';
import type SubChunkRequestPacket from '@jsprismarine/protocol/bedrock/packet/SubChunkRequestPacket';
import SubChunkHeightmapData from '@jsprismarine/protocol/bedrock/structure/SubChunkHeightmapData';
import SubChunkPos from '@jsprismarine/protocol/bedrock/structure/SubChunkPos';
import SubChunkPosOffset from '@jsprismarine/protocol/bedrock/structure/SubChunkPosOffset';

import type ClientConnection from '../../network/ClientConnection';
import { blockTranslationFor } from '../../network/codec/blockTranslation';
import type { ChunkSendProgress, ChunkWire, ChunkWireView, WireChunk } from '../../player/ChunkView';
import type Chunk from '../../world/chunk/Chunk';
import { translateChunkPayload } from '../../world/chunk/translateNetworkPalettes';
import { maxSubChunk, minSubChunk } from '../../world/Dimension';
import { dimensionByBedrockId } from '../../world/DimensionType';
import type { World } from '../../world/World';
import type PlayerSession from '../../player/PlayerSession';
import ChunkBatchCache from './ChunkBatchCache';
import { ClientBlobCache } from './ClientBlobCache';

/** One batch per chunk revision and codec, shared by every Bedrock session. */
const chunkBatchCache = new ChunkBatchCache();

/**
 * The first protocol whose clients are sent chunks in request mode, a skeleton and then the sub
 * chunks they ask for.
 *
 * A 2225 client completes its join that way. A 2193 client does not: it requests the sub chunks
 * and then never closes its loading screen, in any world tall enough to have more than one, so
 * it is sent whole chunks instead. Both measured with the e2e client built for each protocol.
 */
const SUB_CHUNK_REQUESTS_SINCE = 2225;

/** A chunk as it waits in a session's queue: serialized when it was queued. */
interface QueuedBedrockChunk {
    readonly payload: Buffer;
    readonly revision: number;
    /**
     * The sub chunk count `payload` was serialized with. Read when the chunk is queued, not when
     * it is sent: the column can grow in between, and a whole-chunk payload declared with the
     * newer count told the reader of the payload to expect sub chunks it does not hold.
     */
    readonly subChunkCount: number;
}

/** What a Bedrock chunk wire reads from the session it sends for. */
export interface BedrockChunkSession {
    /** The world the session's player is in, or undefined once the client left. */
    world(): World | undefined;
    /** Whether the client was sent a chunk and kept it. */
    holds(x: number, z: number): boolean;
    /** The player's name, for the log. */
    readonly name: string;
    /** Logs at debug. */
    debug(message: string): void;
    /** The compression level the server's config names. */
    compressionLevel(): number;
}

/**
 * How a Bedrock client is sent chunks: `NetworkChunkPublisherUpdate` around the player,
 * `LevelChunk` for each column, from one batch per chunk revision that every session of the
 * codec shares, and, from protocol 2225 on, the sub chunks and cache blobs the client asks for
 * afterwards. The session decides which chunks and when, as it does for Java's.
 */
export class BedrockChunkWire implements ChunkWire {
    /** The blobs this client was told of and has not confirmed yet. */
    private readonly blobs = new ClientBlobCache();
    private cacheEnabled = false;
    /** Each queued chunk's payload, for the send that follows. */
    private readonly queued = new WeakMap<WireChunk, QueuedBedrockChunk>();

    /**
     * @param connection - The client's connection.
     * @param session - What the wire reads from the session.
     */
    public constructor(
        private readonly connection: ClientConnection,
        private readonly session: BedrockChunkSession
    ) {}

    /** Enables or clears client blob caching for subsequent subchunk requests. */
    public setClientCacheEnabled(enabled: boolean): void {
        this.cacheEnabled = enabled;
        if (!enabled) this.blobs.clear();
    }

    /** Whether this client is sent chunks in request mode; see {@link SUB_CHUNK_REQUESTS_SINCE}. */
    private usesSubChunkRequests(): boolean {
        return this.connection.codec.context.protocolVersion >= SUB_CHUNK_REQUESTS_SINCE;
    }

    /**
     * Serializes a chunk as it is queued: a request-mode skeleton or the whole column, and the
     * revision and sub chunk count it was written at. Its bytes are what it keeps while queued.
     */
    public prepare(chunk: Chunk): WireChunk {
        const serialized = this.serialize(chunk);
        const wire: WireChunk = { chunk, memoryBytes: serialized.payload.byteLength };
        this.queued.set(wire, serialized);
        return wire;
    }

    /** A chunk as the client is sent it now. */
    private serialize(chunk: Chunk): QueuedBedrockChunk {
        return {
            payload: this.usesSubChunkRequests() ? chunk.networkSerializeRequestSkeleton() : chunk.networkSerialize(),
            revision: chunk.getNetworkRevision(),
            subChunkCount: chunk.getNetworkSubChunkCount()
        };
    }

    /**
     * The publisher update has to come first, and has to be current.
     *
     * It names the point around which chunks stay visible and how far that reaches; the
     * client ignores anything outside the radius of the most recent one, and shows
     * nothing at all if none was ever sent. Chunks now arrive spread over many ticks, so
     * a single update sent at join goes stale the moment the player walks - which is why
     * chunks stopped appearing, or appeared out of order. Vanilla servers send this
     * continuously at the player's position, and so does this.
     *
     * `saved_chunks` stays empty on purpose: the client takes that list as the set that
     * should be showing, so naming only the current batch un-rendered everything sent
     * before it. What governs visibility is the radius around the position.
     * https://github.com/PrismarineJS/minecraft-data/blob/master/data/bedrock/1.21.42/proto.yml
     */
    public async center({ block, distance }: ChunkWireView): Promise<void> {
        await this.connection.sendDataPacket(
            new NetworkChunkPublisherUpdatePacket({ position: block, radius: distance << 4, savedChunks: [] })
        );
    }

    /**
     * Sends each chunk as its own shared batch, built once per revision and codec. Shared
     * compression is safe; framing and encryption remain ordered per connection.
     */
    public async send(
        chunks: readonly WireChunk[],
        _session: PlayerSession,
        progress: ChunkSendProgress
    ): Promise<void> {
        const compressionLevel = this.session.compressionLevel();
        const requestMode = this.usesSubChunkRequests();
        // With the client's blob cache on, a request-mode chunk names its biomes by hash and
        // carries only the border block count, as protocol 2225's pinned Bedrock Dedicated
        // Server sends it. Sending the biomes inline with the cache off would be simpler and
        // one round trip shorter, but the sub chunk answers that follow use the cache, and the
        // server this was captured from never mixes the two for one client.
        const cached = requestMode && this.cacheEnabled;
        for (const [index, wire] of chunks.entries()) {
            // A world change while an earlier chunk was compressing or sending: the rest are
            // the old world's, and the client has already been told it is somewhere else.
            if (!progress.stillCurrent()) return;
            const { chunk } = wire;
            // A chunk another wire queued is serialized now.
            const queued = this.queued.get(wire) ?? this.serialize(chunk);
            const biomes = cached ? this.blobs.prepareRequestBiomes(chunk) : undefined;
            if (biomes !== undefined) this.blobs.track([biomes]);
            // A request-mode client asks for its sub chunks later and is answered from the
            // column as it is then, so it is told the current limit. A whole-chunk payload
            // carries its sub chunks, and declares the count it was serialized with.
            const subChunkCount = requestMode ? chunk.getNetworkSubChunkRequestLimit() : queued.subChunkCount;
            const batch = await chunkBatchCache.getOrCreate(
                chunk,
                queued.revision,
                this.connection.codec,
                compressionLevel,
                () => [
                    new LevelChunkPacket({
                        chunkX: chunk.getX(),
                        chunkZ: chunk.getZ(),
                        dimension: chunk.getDimension().bedrockId,
                        subChunkCount,
                        clientSubChunkRequestsEnabled: requestMode,
                        ...(biomes === undefined
                            ? {
                                  cached: false,
                                  payload: this.clientChunkPayload(queued.payload, requestMode, subChunkCount)
                              }
                            : { cached: true, blobHashes: [biomes.id], payload: biomes.tail })
                    })
                ],
                this.connection.compressionAlgorithm,
                this.connection.compressionThreshold,
                biomes !== undefined ? 'request-mode-cached' : requestMode ? 'request-mode' : 'uncached'
            );
            if (!progress.stillCurrent()) return;

            progress.sending(index);
            await this.connection.sendSharedCompressedBatchAsync(
                batch.content,
                batch.packets,
                false,
                batch.packetBuffers
            );
            progress.sent(index);
        }
    }

    /** Sends nothing: a Bedrock client drops a chunk itself once it leaves the publisher's radius. */
    public async forget(): Promise<void> {}

    /** Sends `ChunkRadiusUpdated`, which also opens the window a retail client accepts terrain in. */
    public async radius(distance: number): Promise<void> {
        await this.connection.sendDataPacket(new ChunkRadiusUpdatedPacket({ radius: distance }));
    }

    /**
     * A chunk payload with its block ids as this client's release writes them.
     *
     * Built inside the batch cache's factory, which keeps one batch per codec, so an older
     * session pays for the copy once per chunk revision. A request-mode payload carries no sub
     * chunks; those are translated as they are requested.
     */
    private clientChunkPayload(payload: Buffer, requestMode: boolean, subChunkCount: number): Buffer {
        const translation = blockTranslationFor(this.connection.codec.protocolVersion);
        if (requestMode || !translation.changes) return payload;
        return translateChunkPayload(payload, subChunkCount, translation.toClient);
    }

    /**
     * Responds to requested blob misses and applies the client's acknowledgements.
     *
     * Every status is answered, with an empty `ClientCacheMissResponse` when the client missed
     * nothing. Protocol 2225's pinned Bedrock Dedicated Server does the same, 105 answers to 105
     * statuses in the capture docs/research/sub-chunk-requests-and-blob-cache.md describes. Do not
     * skip the empty one to save a packet: the answer is what closes the client's cache
     * transaction.
     * @returns How many blobs went out.
     */
    public async answerBlobStatus(packet: ClientCacheBlobStatusPacket): Promise<number> {
        if (!this.cacheEnabled) return 0;

        const blobs = this.blobs.respond(packet.missingIds, packet.foundIds);

        const response = new ClientCacheMissResponsePacket();
        response.blobs = blobs;
        await this.connection.sendDataPacket(response);
        return blobs.length;
    }

    /**
     * Answers requested sections with their bytes, block entities, heightmaps, and cache ids.
     *
     * The shape of each entry follows a capture of protocol 2225's pinned Bedrock Dedicated Server
     * answering a retail client, recorded in docs/research/sub-chunk-requests-and-blob-cache.md.
     * With the client's blob cache on:
     *
     * - A section with blocks carries the hash of its terrain and a payload that is present even
     *   when empty. The payload holds the section's block entities only.
     * - An all-air section carries neither payload nor hash.
     * - The answer is the same whether or not the client has confirmed the blob before.
     *
     * These look like things to simplify, such as dropping an empty payload or sending the terrain
     * inline to save a round trip. A retail client leaves with a bad packet error
     * (`ClientDisconnection-90`) on either, so change them only against a new capture.
     * @param packet - The requested chunk columns and absolute subchunk center.
     */
    public async answerSubChunkRequest(packet: SubChunkRequestPacket): Promise<number> {
        if (packet.offsets.length === 0) return 0;

        const world = this.session.world();
        const online = world !== undefined;
        const dimension = world?.getDimension();
        const cacheEnabled = this.cacheEnabled;
        const entries: SubChunkEntry[] = [];
        for (const offset of packet.offsets) {
            const y = packet.centerPos.y + offset.y;
            const entry: SubChunkEntry = {
                offset: new SubChunkPosOffset(offset.x, offset.y, offset.z),
                result: SubChunkRequestResult.PLAYER_DOESNT_EXIST,
                heightMaps: new SubChunkHeightmapData()
            };

            if (!online || world === undefined || dimension === undefined) {
                entries.push(entry);
                continue;
            }
            if (packet.dimensionType !== dimension.bedrockId) {
                entry.result = SubChunkRequestResult.WRONG_DIMENSION;
                entries.push(entry);
                continue;
            }
            const clientRange = dimension.custom ? dimension : (dimensionByBedrockId(dimension.bedrockId) ?? dimension);
            if (y < minSubChunk(clientRange) || y > maxSubChunk(clientRange)) {
                entry.result = SubChunkRequestResult.INDEX_OUT_OF_BOUNDS;
                entries.push(entry);
                continue;
            }

            const x = packet.centerPos.x + offset.x;
            const z = packet.centerPos.z + offset.z;
            let chunk = world.getLoadedChunk(x, z);
            // A chunk this client was told about has to be answerable. The client asks for its
            // sub chunks only once, and a "doesn't exist" is final for that column, so one the
            // world evicted between the announcement and the request would stay a hole for as
            // long as the player stood there. Read it back instead; a chunk nobody announced is
            // not loaded on a client's say-so.
            if (chunk === null && this.session.holds(x, z)) {
                chunk = await world.getChunk(x, z, { urgency: 'immediate' });
            }
            if (chunk === null || chunk.getX() !== x || chunk.getZ() !== z) {
                // Debug: a client that has moved or changed dimension asks for columns of its old
                // view, one line per sub chunk, and there is nothing for an operator to do about it.
                this.session.debug(`${this.session.name} asked for sub chunk ${x}, ${y}, ${z}, which is not loaded`);
                entry.result = SubChunkRequestResult.LEVEL_CHUNK_DOESNT_EXIST;
                entries.push(entry);
                continue;
            }

            const translation = blockTranslationFor(this.connection.codec.protocolVersion);
            const worldData = chunk.networkSerializeRequestSubChunk(y);
            // The terrain opens the payload as one sub chunk, and the block entities after it
            // are copied as they are.
            const data = translation.changes ? translateChunkPayload(worldData, 1, translation.toClient) : worldData;
            const allAir = data.byteLength === 2 && data[0] === 8 && data[1] === 0;
            entry.result = allAir ? SubChunkRequestResult.SUCCESS_ALL_AIR : SubChunkRequestResult.SUCCESS;
            entry.heightMaps = chunk.networkSubChunkHeightmaps(y);

            if (!cacheEnabled) {
                Object.assign(entry, { serializedSubChunk: data });
                entries.push(entry);
                continue;
            }
            // Mojang's packet documentation: the payload is "absent when cache enabled and result
            // is SuccessAllAir", and such a section queues no blob either. With the cache off the
            // payload stays, which is why this check sits below the uncached branch.
            if (allAir) {
                entries.push(entry);
                continue;
            }

            // With the blob cache on, the terrain never travels in this packet. The entry names
            // its hash, the client answers which hashes it lacks, and those go out in a
            // ClientCacheMissResponse. The payload is still there and holds the section's block
            // entities, empty when it has none: a game client reads a successful entry's payload
            // whether or not it is cached, and leaves with a bad packet error when it is absent.
            const blob = this.blobs.prepareRequestSubChunk(chunk, y, translation);
            this.blobs.track([blob]);
            Object.assign(entry, { blobId: blob.id, serializedSubChunk: blob.blockEntities });
            entries.push(entry);
        }

        const response = new SubChunkPacket({
            cacheEnabled,
            dimension: packet.dimensionType,
            centerPos: new SubChunkPos(packet.centerPos.x, packet.centerPos.y, packet.centerPos.z),
            entries
        });
        await this.connection.sendDataPacket(response);
        return entries.length;
    }
}
