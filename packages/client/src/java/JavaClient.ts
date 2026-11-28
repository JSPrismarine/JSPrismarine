import { constants, createHash, createPublicKey, publicEncrypt, randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';

import { ClientErrors } from '@jsprismarine/errors/client';
import { LevelChunkWithLight } from '@jsprismarine/protocol/java/chunk/levelChunk';
import { offlineUuid, serverHash } from '@jsprismarine/protocol/java/javaIdentity';
import {
    AcknowledgeFinishConfiguration,
    brandOf,
    ClientboundKnownPacks,
    ClientboundPluginMessage,
    ConfigurationClientboundKeepAlive,
    ConfigurationClientInformation,
    ConfigurationDisconnect,
    ConfigurationResourcePackPop,
    ConfigurationResourcePackPush,
    ConfigurationResourcePackResponse,
    ConfigurationServerboundKeepAlive,
    FinishConfiguration,
    JavaChatVisibility,
    JavaMainHand,
    JavaParticleStatus,
    JavaResourcePackAction,
    ServerboundKnownPacks
} from '@jsprismarine/protocol/java/packet/configuration';
import { ClientIntent, Intention } from '@jsprismarine/protocol/java/packet/handshake';
import type {
    JavaPacketBody,
    JavaPacketDefinition,
    JavaPayload,
    JavaPhase
} from '@jsprismarine/protocol/java/packet/JavaPacket';
import { decodeJavaPacket } from '@jsprismarine/protocol/java/packet/JavaPacket';
import { javaPacketsById } from '@jsprismarine/protocol/java/packet/javaPackets';
import {
    EncryptionRequest,
    EncryptionResponse,
    LoginAcknowledged,
    LoginDisconnect,
    LoginStart,
    LoginSuccess,
    SetCompression
} from '@jsprismarine/protocol/java/packet/login';
import {
    ChatCommand,
    ChatMessage,
    ChunkBatchFinished,
    ChunkBatchReceived,
    ClientboundKeepAlive,
    ConfirmTeleportation,
    ForgetLevelChunk,
    MOVE_ON_GROUND,
    MovePlayerPosRot,
    PlayDisconnect,
    PlayLogin,
    PlayerAction,
    PlayerActionStatus,
    PlayerInfoAction,
    PlayerInfoAdd,
    PlayerInfoUpdateGameMode,
    PlayerLoaded,
    PlayResourcePackPop,
    PlayResourcePackPush,
    PlayResourcePackResponse,
    Respawn,
    ServerboundKeepAlive,
    SetHealth,
    SynchronizePlayerPosition,
    SystemChat
} from '@jsprismarine/protocol/java/packet/play';
import { PingRequest, PongResponse, StatusRequest, StatusResponse } from '@jsprismarine/protocol/java/packet/status';
import type { JavaProtocol } from '@jsprismarine/protocol/java/versions/javaRelease';
import { NEWEST_JAVA_RELEASE } from '@jsprismarine/protocol/java/versions/javaReleases';
import type { JavaText } from '@jsprismarine/protocol/java/wire/javaTypes';

import { JavaSocket } from './JavaSocket';

/** The port a Java Edition server listens on unless it says otherwise. */
export const JAVA_DEFAULT_PORT = 25_565;

/** How a {@link JavaClient} connects. */
export interface JavaClientOptions {
    readonly host: string;
    /** Defaults to {@link JAVA_DEFAULT_PORT}. */
    readonly port?: number;
    /** The player name, one to sixteen letters, digits and underscores. */
    readonly username: string;
    /** The UUID the login names the player by; defaults to the one an offline server gives the name. */
    readonly profileId?: string;
    /** The release to speak; defaults to the newest the protocol package has. */
    readonly protocol?: JavaProtocol;
    /**
     * Tells Mojang's session server the player is joining, as an online-mode login needs: the
     * official client posts the hash with its access token to `session/minecraft/join`. Without
     * it, a server in online mode cannot be joined.
     */
    readonly joinSession?: (serverHash: string) => Promise<void>;
    /** The chunks per tick the client says it can take after each batch. Defaults to vanilla's ceiling, 64. */
    readonly chunksPerTick?: number;
    /** The language the client's settings name, such as `sv_se`. Defaults to `en_us`. */
    readonly language?: string;
    /** The view distance in the client's settings, in chunks. Defaults to vanilla's, 12. */
    readonly viewDistance?: number;
    /**
     * What the player does with a resource pack the server pushes: `accept` downloads it, checks
     * its SHA-1 and loads it, as a vanilla client whose player takes it does; `decline` refuses it.
     * Defaults to `accept`.
     */
    readonly resourcePacks?: 'accept' | 'decline';
    /** Downloads a pushed resource pack; the global `fetch` when absent, as through a proxy otherwise. */
    readonly fetch?: typeof fetch;
}

/** A resource pack the client downloaded from the server and loaded. */
export interface JavaLoadedResourcePack {
    readonly id: string;
    readonly url: string;
    /** The SHA-1 of the bytes it downloaded, in lowercase hexadecimal. */
    readonly sha1: string;
    readonly bytes: Uint8Array;
}

/** Where the player is and where it looks. */
export interface JavaPose {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly yaw: number;
    readonly pitch: number;
}

/** A clientbound packet the client read, with its fields. */
export interface JavaReceived {
    readonly definition: JavaPacketDefinition;
    readonly payload: unknown;
}

/** What a {@link JavaClient} reports. */
export interface JavaClientEvents {
    /** Every packet the server sent, after the client answered it. */
    packet: [received: JavaReceived];
    /** A chat or system message, or the action bar when `overlay` is set. */
    chat: [content: JavaText, overlay: boolean];
    /** The server moved the player, and the client accepted the move. */
    position: [pose: JavaPose];
    /** The client finished with a resource pack the server pushed, loaded or not. */
    resourcePack: [id: string, action: JavaResourcePackAction];
    /** The server ended the connection and said why. */
    disconnect: [reason: JavaText];
    /** The connection broke or the server sent what the client cannot read. */
    error: [error: Error];
    /** The connection is gone. */
    close: [];
}

/** A server list entry, as `Status Response` gives it. */
export interface JavaServerStatus {
    /** The JSON the server sent: its version, players and description. */
    readonly json: string;
    /** The JSON, parsed. */
    readonly status: unknown;
}

/** The bits of `Synchronize Player Position`'s flags that make a field relative, by Java's `Relative` ordinal. */
const RELATIVE = { x: 0x01, y: 0x02, z: 0x04, yaw: 0x08, pitch: 0x10 } as const;

/** The chunks per tick vanilla's client asks for at most. */
const MAX_CHUNKS_PER_TICK = 64;

/** The size of the AES key a Java client chooses. */
const SHARED_SECRET_BYTES = 16;

/**
 * Reads one clientbound packet. An id that two layouts share is told apart by what it carries:
 * `Player Info Update` adds players when its action set has the add bit, and otherwise changes
 * their game modes, the only other set this server sends.
 */
const read = (protocol: JavaProtocol, candidates: readonly JavaPacketDefinition[], { body }: JavaPacketBody) => {
    let definition = candidates[0]!;
    if (candidates.includes(PlayerInfoAdd)) {
        const actions = body.getBuffer()[body.getReadIndex()] ?? 0;
        definition = (actions & PlayerInfoAction.AddPlayer) !== 0 ? PlayerInfoAdd : PlayerInfoUpdateGameMode;
    }
    return { definition, payload: decodeJavaPacket(protocol, definition, body) };
};

/**
 * Whether a packet is the given definition, narrowing its payload to that definition's fields.
 * @param received - The packet.
 * @param definition - The definition to test for.
 * @returns True when the packet was read as `definition`.
 */
export const isJavaPacket = <D extends JavaPacketDefinition>(
    received: JavaReceived,
    definition: D
): received is { readonly definition: D; readonly payload: JavaPayload<D> } => received.definition === definition;

/**
 * A Minecraft: Java Edition client, with no interface attached to it.
 *
 * It does what a vanilla client does to get into a world and stay there: the handshake, the
 * login, with encryption when the server asks for it and compression when the server turns it
 * on, the configuration, then play. In play it answers keep-alives, accepts each teleport, says
 * how many chunks it can take after each batch and tells the server once it loaded the world.
 * Every packet it reads is reported, with its fields, through the `packet` event.
 *
 * @example
 * ```typescript
 * const client = new JavaClient({ host: '127.0.0.1', username: 'Steve' });
 * client.on('chat', (message) => console.log(message));
 * await client.connect();
 * client.chat('Hello');
 * ```
 */
export class JavaClient extends EventEmitter<JavaClientEvents> {
    private readonly protocol: JavaProtocol;
    private readonly host: string;
    private readonly port: number;
    private readonly clientbound: ReadonlyMap<JavaPhase, ReadonlyMap<number, readonly JavaPacketDefinition[]>>;
    private socket: JavaSocket | undefined;
    private phase: JavaPhase = 'handshake';
    private pose: JavaPose | undefined;
    private chunkBatches = 0;
    private loaded = false;
    private readonly columns = new Set<string>();
    private login: PlayLoginPayload | undefined;
    private health: JavaPayload<typeof SetHealth> | undefined;
    private brand: string | undefined;
    private readonly resourcePacks = new Map<string, JavaLoadedResourcePack>();
    /**
     * How many times each pack was removed, and every pack at once, so a download a removal
     * overtook knows to discard what it fetched.
     */
    private readonly packRemovals = new Map<string, number>();
    private allPackRemovals = 0;
    private disconnectReason: JavaText | undefined;

    public constructor(private readonly options: JavaClientOptions) {
        super();
        this.protocol = options.protocol ?? NEWEST_JAVA_RELEASE;
        this.host = options.host;
        this.port = options.port ?? JAVA_DEFAULT_PORT;
        const phases: readonly JavaPhase[] = ['login', 'configuration', 'play'];
        this.clientbound = new Map(
            phases.map((phase) => [phase, javaPacketsById(this.protocol, phase, 'clientbound')] as const)
        );
    }

    /**
     * Asks a server for its server list entry, as the multiplayer screen does. The ping that
     * follows is answered with its number, and the connection closes.
     * @param host - The server's address.
     * @param port - Its port; defaults to {@link JAVA_DEFAULT_PORT}.
     * @param protocol - The release to report; defaults to the newest the protocol package has.
     * @returns The server's status JSON, raw and parsed.
     */
    public static async status(
        host: string,
        port = JAVA_DEFAULT_PORT,
        protocol: JavaProtocol = NEWEST_JAVA_RELEASE
    ): Promise<JavaServerStatus> {
        const socket = await JavaSocket.open(host, port, protocol);
        const byId = javaPacketsById(protocol, 'status', 'clientbound');
        const next = <D extends JavaPacketDefinition>(definition: D): Promise<JavaPayload<D>> =>
            new Promise((resolve, reject) => {
                const cleanup = () => {
                    socket.off('packet', onPacket);
                    socket.off('close', onClose);
                    socket.off('error', reject);
                };
                const onPacket = (packet: JavaPacketBody) => {
                    cleanup();
                    if (byId.get(packet.id)?.includes(definition) !== true) {
                        reject(
                            new ClientErrors.UnexpectedJavaPacket({
                                expected: definition.name,
                                phase: 'status',
                                id: packet.id
                            })
                        );
                        return;
                    }
                    try {
                        resolve(decodeJavaPacket(protocol, definition, packet.body));
                    } catch (error) {
                        reject(error);
                    }
                };
                const onClose = () => {
                    cleanup();
                    reject(new ClientErrors.DisconnectedDuringLogin({ reason: 'the server closed the connection' }));
                };
                socket.on('packet', onPacket);
                socket.once('close', onClose);
                socket.once('error', reject);
            });
        try {
            socket.send(Intention, {
                protocolVersion: protocol.protocolVersion,
                serverAddress: host,
                serverPort: port,
                intent: ClientIntent.Status
            });
            const response = next(StatusResponse);
            socket.send(StatusRequest, {});
            const { json } = await response;
            const timestamp = BigInt(Date.now());
            const pong = next(PongResponse);
            socket.send(PingRequest, { timestamp });
            await pong;
            return { json, status: JSON.parse(json) };
        } finally {
            socket.close();
        }
    }

    /**
     * Joins the server: resolves once the client is in play, has accepted its first position and
     * has told the server it loaded the world around it.
     * @throws {Error} When the server refuses the login or the connection closes first.
     */
    public async connect(): Promise<void> {
        if (this.socket !== undefined) throw new ClientErrors.AlreadyConnected();
        const socket = await JavaSocket.open(this.host, this.port, this.protocol);
        this.socket = socket;

        const joined = new Promise<void>((resolve, reject) => {
            const onPacket = () => {
                if (!this.loaded) return;
                cleanup();
                resolve();
            };
            const onClose = () => {
                cleanup();
                reject(
                    this.disconnectReason === undefined
                        ? new ClientErrors.DisconnectedDuringLogin({ reason: 'the server closed the connection' })
                        : new ClientErrors.DisconnectedByServer({ reason: textOf(this.disconnectReason) })
                );
            };
            const onError = (error: Error) => {
                cleanup();
                reject(error);
            };
            const cleanup = () => {
                this.off('packet', onPacket);
                this.off('close', onClose);
                this.off('error', onError);
            };
            this.on('packet', onPacket);
            this.on('close', onClose);
            this.on('error', onError);
        });
        // Rejections surface through the returned promise; this keeps a late one from being unhandled.
        joined.catch(() => {});

        socket.on('packet', (packet) => {
            void this.received(packet).catch((error: unknown) => this.fail(error));
        });
        socket.on('error', (error) => this.fail(error));
        socket.once('close', () => {
            this.phase = 'handshake';
            this.emit('close');
        });

        socket.send(Intention, {
            protocolVersion: this.protocol.protocolVersion,
            serverAddress: this.host,
            serverPort: this.port,
            intent: ClientIntent.Login
        });
        this.phase = 'login';
        socket.send(LoginStart, {
            name: this.options.username,
            profileId: this.options.profileId ?? offlineUuid(this.options.username)
        });
        await joined;
    }

    /**
     * Writes one packet to the server.
     * @param definition - A serverbound packet of the phase the client is in.
     * @param value - Its fields.
     */
    public send<D extends JavaPacketDefinition>(definition: D, value: JavaPayload<D>): void {
        this.socket?.send(definition, value);
    }

    /**
     * Says a line in chat, or runs it as a command when it starts with a slash. Chat goes
     * unsigned, as a client without a Mojang key sends it.
     * @param line - What the player typed.
     */
    public chat(line: string): void {
        if (line.startsWith('/')) {
            this.send(ChatCommand, { command: line.slice(1) });
            return;
        }
        this.send(ChatMessage, {
            message: line,
            timestamp: BigInt(Date.now()),
            salt: 0n,
            signature: null,
            lastSeenOffset: 0,
            acknowledged: Buffer.alloc(3),
            checksum: 0
        });
    }

    /**
     * Moves the player and turns it, as one `Set Player Position and Rotation`.
     * @param to - Where the player's feet are now, and where it looks; a field left out stays.
     * @param onGround - Whether the player stands on something.
     */
    public move(to: Partial<JavaPose>, onGround = true): void {
        const from = this.pose ?? { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
        const pose = { ...from, ...to };
        this.pose = pose;
        this.send(MovePlayerPosRot, { ...pose, flags: onGround ? MOVE_ON_GROUND : 0 });
    }

    /**
     * Presses the drop key, as one `Player Action`: one item of the stack in the hand, or the
     * whole stack with `all`, as Ctrl+Q drops it. Vanilla sends a drop at the origin, facing down.
     * @param all - Whether the whole stack goes.
     */
    public dropHeldItem(all = false): void {
        this.send(PlayerAction, {
            status: all ? PlayerActionStatus.DropAllItems : PlayerActionStatus.DropItem,
            position: { x: 0, y: 0, z: 0 },
            face: 0,
            sequence: 0
        });
    }

    /** Hangs up. */
    public disconnect(): void {
        this.socket?.close();
    }

    /** The phase the conversation is in, `handshake` before it starts and after it ends. */
    public getPhase(): JavaPhase {
        return this.phase;
    }

    /** Where the player is, once the server placed it. */
    public getPose(): JavaPose | undefined {
        return this.pose;
    }

    /** What `Login (play)` and the latest `Respawn` said: the entity id, the dimension and the game mode. */
    public getLogin(): PlayLoginPayload | undefined {
        return this.login;
    }

    /** The latest `Set Health`. */
    public getHealth(): JavaPayload<typeof SetHealth> | undefined {
        return this.health;
    }

    /** The server's `minecraft:brand`. */
    public getBrand(): string | undefined {
        return this.brand;
    }

    /** The resource packs the client loaded from the server and still has, by id. */
    public getResourcePacks(): ReadonlyMap<string, JavaLoadedResourcePack> {
        return this.resourcePacks;
    }

    /** Whether the client holds the chunk column at chunk `x`, `z`: sent, and not unloaded since. */
    public hasChunk(x: number, z: number): boolean {
        return this.columns.has(`${x},${z}`);
    }

    /** How many chunk columns the client holds. */
    public getChunkCount(): number {
        return this.columns.size;
    }

    /**
     * Waits for the next packet of one kind.
     * @param definition - The packet.
     * @param accept - Which of them to wait for; any, when left out.
     * @returns Its fields.
     */
    public next<D extends JavaPacketDefinition>(
        definition: D,
        accept: (payload: JavaPayload<D>) => boolean = () => true
    ): Promise<JavaPayload<D>> {
        return new Promise((resolve, reject) => {
            const onPacket = (received: JavaReceived) => {
                if (!isJavaPacket(received, definition) || !accept(received.payload)) return;
                cleanup();
                resolve(received.payload);
            };
            const onClose = () => {
                cleanup();
                reject(new ClientErrors.DisconnectedDuringLogin({ reason: `closed before ${definition.name}` }));
            };
            const cleanup = () => {
                this.off('packet', onPacket);
                this.off('close', onClose);
            };
            this.on('packet', onPacket);
            this.once('close', onClose);
        });
    }

    /** Reports what broke the connection to whoever listens for `error`, then hangs up. */
    private fail(error: unknown): void {
        if (error instanceof Error && this.listenerCount('error') > 0) this.emit('error', error);
        this.socket?.close();
    }

    private async received(packet: JavaPacketBody): Promise<void> {
        const phase = this.phase;
        const candidates = this.clientbound.get(phase)?.get(packet.id);
        if (candidates === undefined) {
            throw new ClientErrors.UnknownJavaPacket({
                phase,
                id: packet.id,
                release: this.protocol.minecraftVersion
            });
        }
        const received = read(this.protocol, candidates, packet);
        await this.answer(received);
        this.emit('packet', received);
    }

    /** What a vanilla client does with each packet the conversation depends on. */
    private async answer(received: JavaReceived): Promise<void> {
        const socket = this.socket!;
        if (isJavaPacket(received, EncryptionRequest)) {
            const { publicKey, verifyToken, serverId, shouldAuthenticate } = received.payload;
            const secret = randomBytes(SHARED_SECRET_BYTES);
            if (shouldAuthenticate) {
                if (this.options.joinSession === undefined) throw new ClientErrors.JavaSessionJoinRequired();
                await this.options.joinSession(serverHash(serverId, secret, publicKey));
            }
            const key = createPublicKey({ key: publicKey, format: 'der', type: 'spki' });
            const encrypt = (data: Buffer) => publicEncrypt({ key, padding: constants.RSA_PKCS1_PADDING }, data);
            socket.send(EncryptionResponse, { sharedSecret: encrypt(secret), verifyToken: encrypt(verifyToken) });
            socket.encrypt(secret);
        } else if (isJavaPacket(received, SetCompression)) {
            socket.compress(received.payload.threshold);
        } else if (isJavaPacket(received, LoginSuccess)) {
            socket.send(LoginAcknowledged, {});
            this.phase = 'configuration';
            // A vanilla client's settings, which it sends as soon as it configures.
            socket.send(ConfigurationClientInformation, {
                language: this.options.language ?? 'en_us',
                viewDistance: this.options.viewDistance ?? 12,
                chatVisibility: JavaChatVisibility.Full,
                chatColors: true,
                modelCustomisation: 0x7f,
                mainHand: JavaMainHand.Right,
                textFilteringEnabled: false,
                allowsListing: true,
                particleStatus: JavaParticleStatus.All
            });
        } else if (isJavaPacket(received, ConfigurationClientboundKeepAlive)) {
            socket.send(ConfigurationServerboundKeepAlive, { id: received.payload.id });
        } else if (isJavaPacket(received, ClientboundPluginMessage)) {
            if (received.payload.channel === 'minecraft:brand') this.brand = brandOf(received.payload.data);
        } else if (isJavaPacket(received, ClientboundKnownPacks)) {
            // Every pack the server names is one a vanilla client of the same release has.
            socket.send(ServerboundKnownPacks, { packs: received.payload.packs });
        } else if (isJavaPacket(received, ConfigurationResourcePackPush)) {
            void this.takeResourcePack(received.payload, ConfigurationResourcePackResponse);
        } else if (isJavaPacket(received, PlayResourcePackPush)) {
            void this.takeResourcePack(received.payload, PlayResourcePackResponse);
        } else if (
            isJavaPacket(received, ConfigurationResourcePackPop) ||
            isJavaPacket(received, PlayResourcePackPop)
        ) {
            const { id } = received.payload;
            if (id === null) {
                this.resourcePacks.clear();
                this.allPackRemovals++;
            } else {
                this.resourcePacks.delete(id);
                this.packRemovals.set(id, (this.packRemovals.get(id) ?? 0) + 1);
            }
        } else if (isJavaPacket(received, FinishConfiguration)) {
            socket.send(AcknowledgeFinishConfiguration, {});
            this.phase = 'play';
        } else if (isJavaPacket(received, ClientboundKeepAlive)) {
            socket.send(ServerboundKeepAlive, { id: received.payload.id });
        } else if (isJavaPacket(received, PlayLogin) || isJavaPacket(received, Respawn)) {
            this.login = { ...this.login, ...received.payload };
        } else if (isJavaPacket(received, SynchronizePlayerPosition)) {
            this.teleported(received.payload);
        } else if (isJavaPacket(received, LevelChunkWithLight)) {
            this.columns.add(`${received.payload.x},${received.payload.z}`);
        } else if (isJavaPacket(received, ForgetLevelChunk)) {
            this.columns.delete(`${received.payload.x},${received.payload.z}`);
        } else if (isJavaPacket(received, ChunkBatchFinished)) {
            this.chunkBatches++;
            socket.send(ChunkBatchReceived, {
                chunksPerTick: this.options.chunksPerTick ?? MAX_CHUNKS_PER_TICK
            });
            this.loadedIfReady();
        } else if (isJavaPacket(received, SetHealth)) {
            this.health = received.payload;
        } else if (isJavaPacket(received, SystemChat)) {
            this.emit('chat', received.payload.content, received.payload.overlay);
        } else if (
            isJavaPacket(received, LoginDisconnect) ||
            isJavaPacket(received, ConfigurationDisconnect) ||
            isJavaPacket(received, PlayDisconnect)
        ) {
            const reason = received.payload.reason;
            this.disconnectReason = reason;
            this.emit('disconnect', reason);
        }
    }

    /**
     * Answers a pushed resource pack as a vanilla client does: `Accepted`, then `Downloaded` and
     * `Successfully Loaded` once the download's SHA-1 is the one the server named, or
     * `Failed Download` when it is not; `Declined` when the player refuses packs. The download
     * runs beside the conversation, as the client's own does, so the server's other packets are
     * still read while it goes.
     */
    private async takeResourcePack(
        push: JavaPayload<typeof ConfigurationResourcePackPush>,
        response: typeof ConfigurationResourcePackResponse | typeof PlayResourcePackResponse
    ): Promise<void> {
        const answer = (action: JavaResourcePackAction): void => {
            this.socket?.send(response, { id: push.id, action });
            if (action !== JavaResourcePackAction.Accepted && action !== JavaResourcePackAction.Downloaded)
                this.emit('resourcePack', push.id, action);
        };
        if ((this.options.resourcePacks ?? 'accept') === 'decline') {
            answer(JavaResourcePackAction.Declined);
            return;
        }
        answer(JavaResourcePackAction.Accepted);
        const removals = { one: this.packRemovals.get(push.id) ?? 0, all: this.allPackRemovals };
        const removed = (): boolean =>
            (this.packRemovals.get(push.id) ?? 0) !== removals.one || this.allPackRemovals !== removals.all;
        let bytes: Uint8Array | undefined;
        try {
            const download = await (this.options.fetch ?? fetch)(push.url, {
                headers: {
                    'X-Minecraft-Username': this.options.username,
                    'X-Minecraft-Pack-Format': String(this.protocol.resourcePackFormat[0])
                }
            });
            if (download.ok) bytes = new Uint8Array(await download.arrayBuffer());
            else await download.body?.cancel();
        } catch {
            // A server that does not answer is a failed download, as it is to a vanilla client.
        }
        if (bytes === undefined) {
            answer(JavaResourcePackAction.FailedDownload);
            return;
        }
        const sha1 = createHash('sha1').update(bytes).digest('hex');
        if (/^[0-9a-fA-F]{40}$/.test(push.hash) && sha1 !== push.hash.toLowerCase()) {
            answer(JavaResourcePackAction.FailedDownload);
            return;
        }
        // A pack the server removed while it downloaded is discarded, as a vanilla client does.
        if (removed()) {
            answer(JavaResourcePackAction.Discarded);
            return;
        }
        answer(JavaResourcePackAction.Downloaded);
        this.resourcePacks.set(push.id, { id: push.id, url: push.url, sha1, bytes });
        answer(JavaResourcePackAction.SuccessfullyLoaded);
    }

    /**
     * Accepts a teleport as vanilla does: confirms it with the position it arrived at, then reports
     * that position as a move.
     */
    private teleported(teleport: JavaPayload<typeof SynchronizePlayerPosition>): void {
        const from = this.pose ?? { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
        const relative = (bit: number, by: number, base: number) => ((teleport.flags & bit) !== 0 ? base + by : by);
        const pose: JavaPose = {
            x: relative(RELATIVE.x, teleport.x, from.x),
            y: relative(RELATIVE.y, teleport.y, from.y),
            z: relative(RELATIVE.z, teleport.z, from.z),
            yaw: relative(RELATIVE.yaw, teleport.yaw, from.yaw),
            pitch: relative(RELATIVE.pitch, teleport.pitch, from.pitch)
        };
        this.pose = pose;
        this.send(ConfirmTeleportation, { teleportId: teleport.teleportId, ...pose });
        this.move(pose);
        this.emit('position', pose);
        this.loadedIfReady();
    }

    /** Tells the server the world around the player is loaded, once it has a position and a batch of chunks. */
    private loadedIfReady(): void {
        if (this.loaded || this.pose === undefined || this.chunkBatches === 0) return;
        this.loaded = true;
        this.send(PlayerLoaded, {});
    }
}

/** What `Login (play)` and `Respawn` tell the client, merged. */
export type PlayLoginPayload = Partial<JavaPayload<typeof PlayLogin>> & Partial<JavaPayload<typeof Respawn>>;

/**
 * A text component as plain words, for an error message.
 * @param text - The component.
 * @returns Its text, or its translation key and arguments.
 */
export const textOf = (text: JavaText): string =>
    typeof text === 'string'
        ? text
        : text.with === undefined || text.with.length === 0
          ? text.translate
          : `${text.translate} (${text.with.map(textOf).join(', ')})`;
