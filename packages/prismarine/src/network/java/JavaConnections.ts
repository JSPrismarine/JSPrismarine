/**
 * Each Java Edition connection from its handshake to the configuration phase
 * ([ADR 0026](../../../../../docs/adr/0026-java-is-a-second-protocol-family-over-one-world.md)):
 * a server list ping, or a login that verifies the player with Mojang when `online-mode` is on,
 * turns on encryption and compression, and names the profile the player joins with.
 */
import type { KeyObject } from 'node:crypto';
import { constants, generateKeyPairSync, privateDecrypt, randomBytes, randomUUID } from 'node:crypto';

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
    ChunkBatchFinished,
    ChunkBatchStart,
    ClientboundKeepAlive,
    ConfirmTeleportation,
    GameEvent,
    PlayDisconnect,
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
import { hasJoined, offlineUuid, serverHash } from './javaAuth';
import { compressFrame, decompressFrame } from '@jsprismarine/protocol/java/wire/compression';

import type Chunk from '../../world/chunk/Chunk';
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

/** What a Java player in play is shown of the world, until they join it as a player. */
export interface JavaWorldHost {
    /** Where a joining player stands. */
    spawn(): Promise<{ readonly x: number; readonly y: number; readonly z: number }>;
    /** One chunk of the default world, generated or loaded when it has to be. */
    chunk(x: number, z: number): Promise<Chunk>;
    /** The world's light, which a chunk carries to a Java client, settled before it is read. */
    light(): JavaChunkLight;
    /** How many chunks out from the player the client is sent. */
    viewDistance(): number;
    /** The game mode a joining player has, as Java numbers it: 0 survival to 3 spectator. */
    gameMode(): number;
    maxPlayers(): number;
}

/** How often the server sends a keep-alive, as vanilla does; a client that misses two is dropped. */
const KEEP_ALIVE_INTERVAL_MS = 15_000;

/**
 * The smallest packet a connection compresses, which the vanilla server's
 * `network-compression-threshold` defaults to.
 */
const COMPRESSION_THRESHOLD = 256;

/** The dimension type registry a client was configured with, in network id order. */
const DIMENSION_TYPES: readonly string[] =
    CONFIGURATION.registries.find(({ registry }) => registry === 'minecraft:dimension_type')?.entries ?? [];

/** Every packet a client may send in the configuration phase. */
const CONFIGURATION_SERVERBOUND: ReadonlySet<number> = new Set(Object.values(PACKETS.configuration.serverbound));

/** Every packet a client may send in the play phase. */
const PLAY_SERVERBOUND: ReadonlySet<number> = new Set(Object.values(PACKETS.play.serverbound));

/** The reason the join ends with as it reaches play, when the server shows Java clients no world. */
const JOIN_REFUSAL = 'This server does not take Java Edition players yet.';

/** A player name the vanilla server accepts: one to sixteen letters, digits and underscores. */
const VALID_NAME = /^[A-Za-z0-9_]{1,16}$/;

/** Where one connection is, and what its login has agreed so far. */
interface JavaConnectionState {
    readonly connection: TcpTransportConnection;
    phase: 'handshake' | 'status' | 'login' | 'configuration' | 'play';
    /** The threshold once `Set Compression` has gone, after which every frame is compressed. */
    compression?: number;
    /** The name and token of a login waiting for its encryption response. */
    pending?: { readonly name: string; readonly verifyToken: Buffer };
    profile?: JavaProfile;
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
        transport.onDisconnect((id) => {
            const state = this.connections.get(id);
            if (state?.keepAlive !== undefined) clearInterval(state.keepAlive.timer);
            this.connections.delete(id);
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
                        return;
                    }
                    // Movement, chat and the rest wait for the player to join the world.
                    if (PLAY_SERVERBOUND.has(packetId)) return;
                    throw new PrismarineNetworkErrors.UnexpectedJavaPacket({ packetId, phase: state.phase });
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
            return this.finishLogin(state, { id: offlineUuid(name), name, properties: [] });
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
        const decrypt = (bytes: Buffer) =>
            privateDecrypt({ key: this.key.privateKey, padding: constants.RSA_PKCS1_PADDING }, bytes);
        if (!decrypt(response.verifyToken).equals(pending.verifyToken)) {
            throw new PrismarineNetworkErrors.JavaVerifyTokenMismatch();
        }
        const secret = decrypt(response.sharedSecret);
        state.connection.encrypt(secret);

        const profile = await this.askSessionServer(pending.name, serverHash('', secret, this.key.publicDer));
        if (profile === undefined) return this.refuse(state, translated('multiplayer.disconnect.unverified_username'));
        await this.finishLogin(state, profile);
    }

    private async finishLogin(state: JavaConnectionState, profile: JavaProfile): Promise<void> {
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
        const spawn = await world.spawn();
        const radius = world.viewDistance();
        this.send(state, PlayLogin, {
            // The player has no entity in the world yet; this id is the connection's own.
            entityId: state.connection.id,
            hardcore: false,
            dimensions: ['minecraft:overworld', 'minecraft:the_nether', 'minecraft:the_end'],
            maxPlayers: world.maxPlayers(),
            viewDistance: radius,
            simulationDistance: radius,
            reducedDebugInfo: false,
            showDeathScreen: true,
            doLimitedCrafting: false,
            dimensionType: Math.max(0, DIMENSION_TYPES.indexOf('minecraft:overworld')),
            dimension: 'minecraft:overworld',
            hashedSeed: 0n,
            gameMode: world.gameMode(),
            previousGameMode: null,
            isDebug: false,
            isFlat: false,
            deathLocation: null,
            portalCooldown: 0,
            seaLevel: 63,
            onlineMode: this.options.onlineMode(),
            enforcesSecureChat: false
        });
        this.send(state, SynchronizePlayerPosition, {
            teleportId: 1,
            x: spawn.x,
            y: spawn.y,
            z: spawn.z,
            velocityX: 0,
            velocityY: 0,
            velocityZ: 0,
            yaw: 0,
            pitch: 0,
            flags: 0
        });
        this.send(state, GameEvent, { event: START_WAITING_FOR_LEVEL_CHUNKS, value: 0 });
        const centerX = Math.floor(spawn.x) >> 4;
        const centerZ = Math.floor(spawn.z) >> 4;
        this.send(state, SetCenterChunk, { x: centerX, z: centerZ });

        const around: { x: number; z: number }[] = [];
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) around.push({ x: centerX + dx, z: centerZ + dz });
        }
        // Nearest first, so the client can show the ground under the player before the rest.
        around.sort((a, b) => Math.hypot(a.x - centerX, a.z - centerZ) - Math.hypot(b.x - centerX, b.z - centerZ));
        this.send(state, ChunkBatchStart, {});
        for (const { x, z } of around) {
            this.send(state, LevelChunkWithLight, this.chunks.columnOf(await world.chunk(x, z), world.light()));
        }
        this.send(state, ChunkBatchFinished, { batchSize: around.length });

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
