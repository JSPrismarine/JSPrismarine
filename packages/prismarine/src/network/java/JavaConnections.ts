/**
 * Each Java Edition connection from its handshake to the configuration phase
 * ([ADR 0026](../../../../../docs/adr/0026-java-is-a-second-protocol-family-over-one-world.md)):
 * a server list ping, or a login that verifies the player with Mojang when `online-mode` is on,
 * turns on encryption and compression, and names the profile the player joins with.
 */
import type { KeyObject } from 'node:crypto';
import { generateKeyPairSync, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

import { PrismarineNetworkErrors } from '@jsprismarine/errors/prismarine/network';
import type { Logger } from '@jsprismarine/logger';
import {
    AcknowledgeFinishConfiguration,
    brandPayload,
    ClientboundKnownPacks,
    ClientboundPluginMessage,
    ConfigurationDisconnect,
    FeatureFlags,
    FinishConfiguration,
    RegistryData,
    ServerboundKnownPacks,
    UpdateTags
} from '@jsprismarine/protocol/java/packet/configuration';
import { ClientIntent, Intention } from '@jsprismarine/protocol/java/packet/handshake';
import type { JavaPacketDefinition } from '@jsprismarine/protocol/java/packet/JavaPacket';
import { decodeJavaPacket, encodeJavaPacket, readJavaPacketId } from '@jsprismarine/protocol/java/packet/JavaPacket';
import {
    EncryptionRequest,
    EncryptionResponse,
    LoginAcknowledged,
    LoginDisconnect,
    LoginStart,
    LoginSuccess,
    SetCompression
} from '@jsprismarine/protocol/java/packet/login';
import { PingRequest, PongResponse, StatusRequest, StatusResponse } from '@jsprismarine/protocol/java/packet/status';
import { LevelChunkWithLight } from '@jsprismarine/protocol/java/chunk/levelChunk';
import {
    ChatCommand,
    BlockChangedAck,
    ChatMessage,
    ChunkBatchFinished,
    ChunkBatchStart,
    ClientCommand,
    ClientCommandAction,
    ClientboundKeepAlive,
    ConfirmTeleportation,
    GameEvent,
    MOVE_ON_GROUND,
    MovePlayerPos,
    MovePlayerPosRot,
    MovePlayerRot,
    MovePlayerStatusOnly,
    PlayDisconnect,
    PlayerAction,
    PlayerLoaded,
    SetCarriedItem,
    SetCreativeModeSlot,
    UseItemOn,
    PlayLogin,
    ServerboundKeepAlive,
    SetCenterChunk,
    START_WAITING_FOR_LEVEL_CHUNKS,
    SynchronizePlayerPosition
} from '@jsprismarine/protocol/java/packet/play';
import { CONFIGURATION } from '@jsprismarine/protocol/java/versions/26.3/configuration';
import { PACKETS } from '@jsprismarine/protocol/java/versions/26.3/packets';
import { NEWEST_JAVA_RELEASE } from '@jsprismarine/protocol/java/versions/javaReleases';

import { errorMessage } from '../../utils/errorMessage';
import type { ConnectionId } from '../transport/ConnectionId';
import type { TcpTransportConnection } from '../transport/TcpTransport';
import type { Transport } from '../transport/Transport';
import type { JavaProfile } from './javaAuth';
import { decryptFromClient, hasJoined, offlineUuid, serverHash } from './javaAuth';
import { compressFrame, decompressFrame } from '@jsprismarine/protocol/java/wire/compression';

import { Vector3 } from '@jsprismarine/math';

import { EYE_HEIGHT } from '../../entity/playerEyes';
import type Chunk from '../../world/chunk/Chunk';
import type PlayerSession from '../PlayerSession';
import { javaItemTranslation } from './editionTranslation';
import { javaCreativeSlotIntentOf, javaHotbarIntentOf } from './javaInventory';
import { isBlockStatus, javaMiningIntentOf } from './javaMining';
import { javaUseItemOnIntentOf } from './javaUseItemOn';
import type { JavaPlayers } from './javaPlayers';
import { javaSpawnInfoOf } from './JavaPresenter';
import type { JavaChunkLight } from './javaChunk';
import { JavaChunkTranslator } from './javaChunk';

/** What a server list ping shows, read when the ping arrives: the RakNet pong's server name. */
export interface JavaStatusSource {
    getMotd(): string;
    /** Players of both editions. */
    getOnlinePlayerCount(): number;
    getMaxPlayerCount(): number;
}

/** What the login reads of the server. */
export interface JavaLoginOptions {
    readonly status: JavaStatusSource;
    /** The server's name, which the client's debug screen shows as the brand. */
    readonly brand: string;
    /** Whether a player must prove to Mojang's session server that they own their name. */
    onlineMode(): boolean;
    /** Asks the session server; {@link hasJoined} against Mojang unless a test gives another. */
    readonly hasJoined?: typeof hasJoined;
    readonly log: Pick<Logger, 'debug' | 'info'>;
    /** The world a player who reaches play is shown; without one, the join ends there. */
    readonly world?: JavaWorldHost;
}

/** The world a Java player in play joins, and the chunks they are shown of it. */
export interface JavaWorldHost {
    /** The world's Java players, which a player who reaches play joins. */
    readonly players: JavaPlayers;
    /** One chunk of the world the session's player is in, generated or loaded when it has to be. */
    chunk(session: PlayerSession, x: number, z: number): Promise<Chunk>;
    /** The light of the world the session's player is in, which a chunk carries to a Java client, settled before it is read. */
    light(session: PlayerSession): JavaChunkLight;
    /** How many chunks out from the player the client is sent. */
    viewDistance(): number;
    maxPlayers(): number;
}

/** How often the server sends a keep-alive, as vanilla does; a client that misses two is dropped. */
const KEEP_ALIVE_INTERVAL_MS = 15_000;

/**
 * The smallest packet a connection compresses, which the vanilla server's
 * `network-compression-threshold` defaults to.
 */
const COMPRESSION_THRESHOLD = 256;

/** Every packet a client may send in the configuration phase. */
const CONFIGURATION_SERVERBOUND: ReadonlySet<number> = new Set(Object.values(PACKETS.configuration.serverbound));

/** Every packet a client may send in the play phase. */
const PLAY_SERVERBOUND: ReadonlySet<number> = new Set(Object.values(PACKETS.play.serverbound));

/** The reason the join ends with as it reaches play, when the server shows Java clients no world. */
const JOIN_REFUSAL = 'This server does not take Java Edition players yet.';

/** A player name the vanilla server accepts: one to sixteen letters, digits and underscores. */
const VALID_NAME = /^[A-Za-z0-9_]{1,16}$/;

/** The shared secret's length: an AES-128 key, which is what a Java client sends. */
const SHARED_SECRET_BYTES = 16;

/** Where one connection is, and what its login has agreed so far. */
interface JavaConnectionState {
    readonly connection: TcpTransportConnection;
    phase: 'handshake' | 'status' | 'login' | 'configuration' | 'play';
    /** The threshold once `Set Compression` has gone, after which every frame is compressed. */
    compression?: number;
    /** The name and token of a login waiting for its encryption response. */
    pending?: { readonly name: string; readonly verifyToken: Buffer };
    profile?: JavaProfile;
    /** Whether Mojang vouched for the profile, which makes the player a `java` subject rather than `offline`. */
    verified?: boolean;
    /** The player's session, once they are in the world. */
    session?: PlayerSession;
    /**
     * Where the last move put the player's feet, and its facing and footing, for the moves that
     * leave some of it out. Kept here rather than read off the player, whose earlier moves may
     * still wait in the input queue.
     */
    pose?: { x: number; y: number; z: number; yaw: number; pitch: number; onGround: boolean };
    /** The chunk sends queued for the connection, one after another, which its packets do not wait on. */
    streaming?: Promise<void>;
    /** Whether the client confirmed a teleport since its last move, as Bedrock's `HandledTeleport` says. */
    teleportHandled?: boolean;
    /**
     * The chunk the client's view centers on, and every chunk it has been sent. A respawn
     * replaces it, and a batch that sees its view replaced stops.
     */
    view?: { x: number; z: number; readonly sent: Set<string> };
    /** The keep-alive timer, and the id the client has not yet answered, once the player is in play. */
    keepAlive?: { readonly timer: NodeJS.Timeout; awaiting: bigint | undefined };
}

/**
 * The JSON of `status` as a `Status Response` carries it.
 * @param status - The server's name, MOTD and counts.
 * @returns The JSON.
 */
export const statusJson = (status: JavaStatusSource): string =>
    JSON.stringify({
        version: { name: NEWEST_JAVA_RELEASE.minecraftVersion, protocol: NEWEST_JAVA_RELEASE.protocolVersion },
        players: { max: status.getMaxPlayerCount(), online: status.getOnlinePlayerCount() },
        description: { text: status.getMotd() },
        enforcesSecureChat: false
    });

/** A translated reason, as the login phase's JSON text component. */
const translated = (key: string, ...args: string[]): string =>
    JSON.stringify(args.length === 0 ? { translate: key } : { translate: key, with: args });

/** Drives each Java Edition connection through its handshake, status and login. */
export class JavaConnections {
    private readonly connections = new Map<ConnectionId, JavaConnectionState>();
    private readonly key: { readonly publicDer: Buffer; readonly privateKey: KeyObject };
    private readonly askSessionServer: typeof hasJoined;
    /** The session id every `Login Success` carries, one for as long as the server runs, as vanilla's is. */
    private readonly sessionId = randomUUID();
    /** The world's chunks as Java clients are sent them. */
    private readonly chunks = new JavaChunkTranslator();
    /** Java item ids to the world's items, for the stacks a creative client sends. */
    private readonly items = javaItemTranslation();

    /**
     * Subscribes to the transport's connections and makes the RSA key the logins encrypt with.
     * @param transport - The Java Edition transport.
     * @param options - The status, the online mode and the log.
     */
    public constructor(
        transport: Transport<TcpTransportConnection>,
        private readonly options: JavaLoginOptions
    ) {
        // 1024 bits, as the vanilla server and every client expect.
        const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 });
        this.key = { publicDer: publicKey.export({ type: 'spki', format: 'der' }), privateKey };
        this.askSessionServer = options.hasJoined ?? hasJoined;
        transport.onConnect(
            (connection) => void this.connections.set(connection.id, { connection, phase: 'handshake' })
        );
        transport.onDisconnect(async (id) => {
            const state = this.connections.get(id);
            if (state?.keepAlive !== undefined) clearInterval(state.keepAlive.timer);
            this.connections.delete(id);
            if (state?.session !== undefined) await this.options.world?.players.leave(id);
        });
        transport.onFrame((frame, id) => this.receive(frame, id));
    }

    private async receive(frame: Buffer, id: ConnectionId): Promise<void> {
        const state = this.connections.get(id);
        if (state === undefined) return;
        try {
            const packet = state.compression === undefined ? frame : decompressFrame(frame, state.compression);
            const { id: packetId, body } = readJavaPacketId(packet);
            const expect = <T>(definition: JavaPacketDefinition<T>): T => {
                if (packetId !== definition.id) {
                    throw new PrismarineNetworkErrors.UnexpectedJavaPacket({ packetId, phase: state.phase });
                }
                return decodeJavaPacket(definition, body);
            };
            switch (state.phase) {
                case 'handshake':
                    return await this.handshake(state, expect(Intention));
                case 'status':
                    if (packetId === StatusRequest.id) {
                        expect(StatusRequest);
                        return this.send(state, StatusResponse, { json: statusJson(this.options.status) });
                    }
                    this.send(state, PongResponse, expect(PingRequest));
                    // The ping is the last thing a server list asks, and a vanilla server hangs
                    // up after answering it.
                    return await state.connection.close();
                case 'login':
                    if (state.pending === undefined && state.profile === undefined) {
                        return await this.loginStart(state, expect(LoginStart).name);
                    }
                    if (state.pending !== undefined)
                        return await this.encryptionResponse(state, expect(EncryptionResponse));
                    expect(LoginAcknowledged);
                    state.phase = 'configuration';
                    return this.beginConfiguration(state);
                case 'configuration':
                    if (packetId === ServerboundKnownPacks.id) {
                        return await this.knownPacks(state, expect(ServerboundKnownPacks).packs);
                    }
                    if (packetId === AcknowledgeFinishConfiguration.id) {
                        expect(AcknowledgeFinishConfiguration);
                        state.phase = 'play';
                        if (this.options.world === undefined) {
                            this.send(state, PlayDisconnect, { reason: JOIN_REFUSAL });
                            return await state.connection.close();
                        }
                        return await this.beginPlay(state, this.options.world);
                    }
                    // The client's settings, its brand and the like, which nothing reads yet.
                    if (CONFIGURATION_SERVERBOUND.has(packetId)) return;
                    throw new PrismarineNetworkErrors.UnexpectedJavaPacket({ packetId, phase: state.phase });
                case 'play':
                    if (packetId === ServerboundKeepAlive.id) {
                        const { id: answered } = expect(ServerboundKeepAlive);
                        if (state.keepAlive?.awaiting === answered) state.keepAlive.awaiting = undefined;
                        return;
                    }
                    if (packetId === ConfirmTeleportation.id) {
                        expect(ConfirmTeleportation);
                        state.teleportHandled = true;
                        return;
                    }
                    return await this.play(state, packetId, expect);
            }
        } catch (error) {
            this.options.log.debug(
                `Java connection ${id} sent what its ${state.phase} phase cannot read: ${errorMessage(error)}`
            );
            await state.connection.close();
        }
    }

    private async handshake(
        state: JavaConnectionState,
        { protocolVersion, intent }: { protocolVersion: number; intent: number }
    ): Promise<void> {
        if (intent === ClientIntent.Status) {
            state.phase = 'status';
            return;
        }
        state.phase = 'login';
        const supported = NEWEST_JAVA_RELEASE.protocolVersion;
        if (protocolVersion !== supported) {
            const key =
                protocolVersion < supported
                    ? 'multiplayer.disconnect.outdated_client'
                    : 'multiplayer.disconnect.outdated_server';
            await this.refuse(state, translated(key, NEWEST_JAVA_RELEASE.minecraftVersion));
        }
    }

    private async loginStart(state: JavaConnectionState, name: string): Promise<void> {
        if (!VALID_NAME.test(name)) return this.refuse(state, translated('multiplayer.disconnect.invalid_player_data'));
        if (!this.options.onlineMode()) {
            return this.finishLogin(state, { id: offlineUuid(name), name, properties: [] }, false);
        }
        const verifyToken = randomBytes(4);
        state.pending = { name, verifyToken };
        this.send(state, EncryptionRequest, {
            serverId: '',
            publicKey: this.key.publicDer,
            verifyToken,
            shouldAuthenticate: true
        });
    }

    private async encryptionResponse(
        state: JavaConnectionState,
        response: { sharedSecret: Buffer; verifyToken: Buffer }
    ): Promise<void> {
        const pending = state.pending!;
        state.pending = undefined;
        const token = decryptFromClient(this.key.privateKey, response.verifyToken, pending.verifyToken.byteLength);
        if (!timingSafeEqual(token, pending.verifyToken)) {
            throw new PrismarineNetworkErrors.JavaVerifyTokenMismatch();
        }
        const secret = decryptFromClient(this.key.privateKey, response.sharedSecret, SHARED_SECRET_BYTES);
        state.connection.encrypt(secret);

        const profile = await this.askSessionServer(pending.name, serverHash('', secret, this.key.publicDer));
        if (profile === undefined) return this.refuse(state, translated('multiplayer.disconnect.unverified_username'));
        await this.finishLogin(state, profile, true);
    }

    private async finishLogin(state: JavaConnectionState, profile: JavaProfile, verified: boolean): Promise<void> {
        state.verified = verified;
        this.send(state, SetCompression, { threshold: COMPRESSION_THRESHOLD });
        state.compression = COMPRESSION_THRESHOLD;
        state.profile = profile;
        this.send(state, LoginSuccess, {
            uuid: profile.id,
            username: profile.name,
            properties: [...profile.properties],
            sessionId: this.sessionId
        });
        this.options.log.info(`Java Edition player ${profile.name} (${profile.id}) logged in`);
    }

    /**
     * Opens the configuration phase as a vanilla server does: the brand, the feature flags, and
     * the packs the registries come from, whose answer {@link JavaConnections.knownPacks} waits for.
     */
    private beginConfiguration(state: JavaConnectionState): void {
        this.send(state, ClientboundPluginMessage, {
            channel: 'minecraft:brand',
            data: brandPayload(this.options.brand)
        });
        this.send(state, FeatureFlags, { features: CONFIGURATION.features });
        this.send(state, ClientboundKnownPacks, { packs: CONFIGURATION.knownPacks });
    }

    /**
     * Sends the registries and tags vanilla sends, once the client says it has the packs they come
     * from. Each entry goes without its data, which the client takes from its own copy of the pack;
     * a client without the pack, such as one of another release, could not read the world, so its
     * join ends here.
     */
    private async knownPacks(
        state: JavaConnectionState,
        packs: readonly { namespace: string; id: string; version: string }[]
    ): Promise<void> {
        const missing = CONFIGURATION.knownPacks.find(
            (needed) =>
                !packs.some(
                    (pack) =>
                        pack.namespace === needed.namespace && pack.id === needed.id && pack.version === needed.version
                )
        );
        if (missing !== undefined) {
            this.send(state, ConfigurationDisconnect, {
                reason: `Your client lacks the ${missing.namespace}:${missing.id} ${missing.version} pack this server's world comes from.`
            });
            return state.connection.close();
        }
        for (const { registry, entries } of CONFIGURATION.registries) {
            this.send(state, RegistryData, { registry, entries: entries.map((id) => ({ id, data: null })) });
        }
        this.send(state, UpdateTags, { registries: CONFIGURATION.tags });
        this.send(state, FinishConfiguration, {});
    }

    /**
     * Shows a player who reached play the world around spawn, in the order vanilla sends it: the
     * login, the position, the event that tells the client to wait for chunks, the chunk its view
     * centers on, then the chunks around it as one batch. Keep-alives start, and a client that
     * leaves one unanswered for a whole interval is dropped, as vanilla drops it.
     */
    private async beginPlay(state: JavaConnectionState, world: JavaWorldHost): Promise<void> {
        const { session, feet, dimension } = await world.players.join(
            state.profile!,
            state.verified ?? false,
            state.connection.id,
            (definition, value) => this.send(state, definition, value),
            async (reason) => {
                this.send(state, PlayDisconnect, { reason });
                await state.connection.close();
            },
            (at) => this.respawned(state, world, at)
        );
        state.session = session;
        const player = session.getPlayer();
        state.pose = { ...feet, yaw: player.yaw, pitch: player.pitch, onGround: true };
        const radius = world.viewDistance();
        this.send(state, PlayLogin, {
            entityId: Number(session.runtimeId),
            hardcore: false,
            dimensions: ['minecraft:overworld', 'minecraft:the_nether', 'minecraft:the_end'],
            maxPlayers: world.maxPlayers(),
            viewDistance: radius,
            simulationDistance: radius,
            reducedDebugInfo: false,
            showDeathScreen: true,
            doLimitedCrafting: false,
            ...javaSpawnInfoOf(dimension, player.gamemode),
            onlineMode: this.options.onlineMode(),
            enforcesSecureChat: false
        });
        this.send(state, SynchronizePlayerPosition, {
            teleportId: 1,
            x: feet.x,
            y: feet.y,
            z: feet.z,
            velocityX: 0,
            velocityY: 0,
            velocityZ: 0,
            yaw: player.yaw,
            pitch: player.pitch,
            flags: 0
        });
        this.send(state, GameEvent, { event: START_WAITING_FOR_LEVEL_CHUNKS, value: 0 });
        state.view = { x: Math.floor(feet.x) >> 4, z: Math.floor(feet.z) >> 4, sent: new Set() };
        this.streamChunks(state, world);

        const keepAlive = {
            awaiting: undefined as bigint | undefined,
            timer: setInterval(() => {
                if (keepAlive.awaiting !== undefined) {
                    this.options.log.debug(`Java connection ${state.connection.id} missed a keep-alive; closing it`);
                    void state.connection.close();
                    return;
                }
                keepAlive.awaiting = BigInt(Date.now());
                this.send(state, ClientboundKeepAlive, { id: keepAlive.awaiting });
            }, KEEP_ALIVE_INTERVAL_MS)
        };
        keepAlive.timer.unref();
        state.keepAlive = keepAlive;
    }

    /**
     * Starts the client's view again where a respawn put the player: a client spawned again,
     * into the same dimension or another, is sent every chunk around it afresh, as vanilla's
     * new player is.
     */
    private respawned(state: JavaConnectionState, world: JavaWorldHost, feet: { x: number; y: number; z: number }) {
        // Before play begins, the login's own position and first batch come next anyway.
        const pose = state.pose;
        if (pose === undefined) return;
        pose.x = feet.x;
        pose.y = feet.y;
        pose.z = feet.z;
        state.view = { x: Math.floor(feet.x) >> 4, z: Math.floor(feet.z) >> 4, sent: new Set() };
        this.streamChunks(state, world);
    }

    /**
     * Centers the client's view on its chunk and sends every chunk around it the client has not
     * had, nearest first, as one batch, from the world the player is in. A respawn meanwhile
     * ends the batch, whose chunks may be of the world the player left.
     */
    private async sendChunksAround(state: JavaConnectionState, world: JavaWorldHost): Promise<void> {
        const view = state.view!;
        const session = state.session!;
        const radius = world.viewDistance();
        this.send(state, SetCenterChunk, { x: view.x, z: view.z });
        const missing: { x: number; z: number }[] = [];
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) {
                const key = `${view.x + dx},${view.z + dz}`;
                if (!view.sent.has(key)) missing.push({ x: view.x + dx, z: view.z + dz });
            }
        }
        if (missing.length === 0) return;
        missing.sort((a, b) => Math.hypot(a.x - view.x, a.z - view.z) - Math.hypot(b.x - view.x, b.z - view.z));
        this.send(state, ChunkBatchStart, {});
        let sent = 0;
        for (const { x, z } of missing) {
            const chunk = await world.chunk(session, x, z);
            if (state.view !== view) break;
            view.sent.add(`${x},${z}`);
            this.send(state, LevelChunkWithLight, this.chunks.columnOf(chunk, world.light(session)));
            sent++;
        }
        this.send(state, ChunkBatchFinished, { batchSize: sent });
    }

    /**
     * A packet of a player in the world. A loaded client, chat and commands decode into the
     * intents a Bedrock client's packets decode into, and a move goes through the movement a
     * Bedrock input applies; the rest waits for the slices that bring it.
     */
    private async play(
        state: JavaConnectionState,
        packetId: number,
        expect: <T>(definition: JavaPacketDefinition<T>) => T
    ): Promise<void> {
        const session = state.session;
        const world = this.options.world;
        if (session === undefined || world === undefined || !PLAY_SERVERBOUND.has(packetId)) {
            throw new PrismarineNetworkErrors.UnexpectedJavaPacket({ packetId, phase: state.phase });
        }
        const { players } = world;
        // Each input is queued for the input step and the next packet is read at once, as a
        // Bedrock client's are: waiting a tick on each one let a lagging server fall further
        // behind the client with every packet.
        const queue = (applied: Promise<void>) => void applied.catch((error: unknown) => this.failed(state, error));
        switch (packetId) {
            case PlayerLoaded.id:
                expect(PlayerLoaded);
                return queue(players.intent(session, { kind: 'playerInitialized' }));
            case ChatMessage.id:
                return queue(players.intent(session, { kind: 'chat', message: expect(ChatMessage).message }));
            case ChatCommand.id:
                return queue(players.intent(session, { kind: 'runCommand', command: expect(ChatCommand).command }));
            case MovePlayerPos.id:
            case MovePlayerPosRot.id:
            case MovePlayerRot.id:
            case MovePlayerStatusOnly.id:
                return this.move(state, session, world, packetId, expect);
            case SetCarriedItem.id: {
                const intent = javaHotbarIntentOf(expect(SetCarriedItem).slot);
                return intent === undefined ? undefined : queue(players.intent(session, intent));
            }
            case SetCreativeModeSlot.id: {
                const intent = javaCreativeSlotIntentOf(expect(SetCreativeModeSlot), this.items);
                return intent === undefined ? undefined : queue(players.intent(session, intent));
            }
            case ClientCommand.id:
                // The death screen's button; statistics are not kept.
                if (expect(ClientCommand).action !== ClientCommandAction.PerformRespawn) return;
                return queue(players.intent(session, { kind: 'pressRespawn' }));
            case UseItemOn.id: {
                const use = expect(UseItemOn);
                const intent = javaUseItemOnIntentOf(use);
                const applied = intent === undefined ? Promise.resolve() : players.intent(session, intent);
                // Answered after the tick's block changes, as a dig is; see below.
                return queue(applied.then(() => this.send(state, BlockChangedAck, { sequence: use.sequence })));
            }
            case PlayerAction.id: {
                const action = expect(PlayerAction);
                const intent = javaMiningIntentOf(action, session.getPlayer().gamemode);
                const applied = intent === undefined ? Promise.resolve() : players.intent(session, intent);
                // The input step applies the intent and the same synchronous tick sends the blocks
                // it changed (ADR 0015), so this answer follows them, as vanilla's does. An answer
                // before them would put the predicted block back on the client's screen for a tick.
                if (isBlockStatus(action.status)) {
                    return queue(applied.then(() => this.send(state, BlockChangedAck, { sequence: action.sequence })));
                }
                return queue(applied);
            }
            default:
                // Packets the milestone does not read yet, such as the client's tick end.
                return;
        }
    }

    /** One move packet, as the movement a Bedrock input reports, and the chunks it brings into view. */
    private async move(
        state: JavaConnectionState,
        session: PlayerSession,
        world: JavaWorldHost,
        packetId: number,
        expect: <T>(definition: JavaPacketDefinition<T>) => T
    ): Promise<void> {
        const pose = state.pose!;
        let { x, y, z } = pose;
        let flags: number;
        if (packetId === MovePlayerPos.id) {
            ({ x, y, z, flags } = expect(MovePlayerPos));
        } else if (packetId === MovePlayerPosRot.id) {
            const move = expect(MovePlayerPosRot);
            ({ x, y, z, flags } = move);
            pose.yaw = move.yaw;
            pose.pitch = move.pitch;
        } else if (packetId === MovePlayerRot.id) {
            const move = expect(MovePlayerRot);
            flags = move.flags;
            pose.yaw = move.yaw;
            pose.pitch = move.pitch;
        } else flags = expect(MovePlayerStatusOnly).flags;
        pose.onGround = (flags & MOVE_ON_GROUND) !== 0;
        pose.x = x;
        pose.y = y;
        pose.z = z;
        const handledTeleport = state.teleportHandled === true;
        state.teleportHandled = false;
        const applied = world.players.move(session, {
            position: new Vector3(x, y + EYE_HEIGHT, z),
            pitch: pose.pitch,
            yaw: pose.yaw,
            headYaw: pose.yaw,
            onGround: pose.onGround,
            handledTeleport
        });
        void applied.catch((error: unknown) => this.failed(state, error));

        const view = state.view!;
        const chunkX = Math.floor(x) >> 4;
        const chunkZ = Math.floor(z) >> 4;
        if (chunkX !== view.x || chunkZ !== view.z) {
            view.x = chunkX;
            view.z = chunkZ;
            this.streamChunks(state, world);
        }
    }

    /**
     * Sends the chunks the view lacks after any sends already queued, without holding up the
     * connection's packets: a join's first batch takes as long as the world takes to load it,
     * and the client keeps moving, answering keep-alives and loading in meanwhile.
     */
    private streamChunks(state: JavaConnectionState, world: JavaWorldHost): void {
        state.streaming = (state.streaming ?? Promise.resolve())
            .then(() => this.sendChunksAround(state, world))
            .catch((error: unknown) => this.failed(state, error));
    }

    /** Closes a connection whose queued work failed, as a packet it could not read closes it. */
    private async failed(state: JavaConnectionState, error: unknown): Promise<void> {
        this.options.log.debug(`Java connection ${state.connection.id} failed in play: ${errorMessage(error)}`);
        await state.connection.close();
    }

    /** Ends a login with a reason the client shows. */
    private async refuse(state: JavaConnectionState, reason: string): Promise<void> {
        this.send(state, LoginDisconnect, { reason });
        await state.connection.close();
    }

    private send<T>(state: JavaConnectionState, definition: JavaPacketDefinition<T>, value: T): void {
        const packet = encodeJavaPacket(definition, value);
        state.connection.sendFrame(state.compression === undefined ? packet : compressFrame(packet, state.compression));
    }
}
