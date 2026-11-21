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
import { ConfigurationDisconnect } from '@jsprismarine/protocol/java/packet/configuration';
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
import { NEWEST_JAVA_RELEASE } from '@jsprismarine/protocol/java/versions/javaReleases';

import { errorMessage } from '../../utils/errorMessage';
import type { ConnectionId } from '../transport/ConnectionId';
import type { TcpTransportConnection } from '../transport/TcpTransport';
import type { Transport } from '../transport/Transport';
import type { JavaProfile } from './javaAuth';
import { hasJoined, offlineUuid, serverHash } from './javaAuth';
import { compressFrame, decompressFrame } from './javaCompression';

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
    /** Whether a player must prove to Mojang's session server that they own their name. */
    onlineMode(): boolean;
    /** Asks the session server; {@link hasJoined} against Mojang unless a test gives another. */
    readonly hasJoined?: typeof hasJoined;
    readonly log: Pick<Logger, 'debug' | 'info'>;
}

/**
 * The smallest packet a connection compresses, which the vanilla server's
 * `network-compression-threshold` defaults to.
 */
const COMPRESSION_THRESHOLD = 256;

/** The reason the configuration phase gives, until Java Edition players can join. */
const JOIN_REFUSAL = 'This server does not take Java Edition players yet.';

/** A player name the vanilla server accepts: one to sixteen letters, digits and underscores. */
const VALID_NAME = /^[A-Za-z0-9_]{1,16}$/;

/** Where one connection is, and what its login has agreed so far. */
interface JavaConnectionState {
    readonly connection: TcpTransportConnection;
    phase: 'handshake' | 'status' | 'login' | 'configuration';
    /** The threshold once `Set Compression` has gone, after which every frame is compressed. */
    compression?: number;
    /** The name and token of a login waiting for its encryption response. */
    pending?: { readonly name: string; readonly verifyToken: Buffer };
    profile?: JavaProfile;
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
        transport.onDisconnect((id) => void this.connections.delete(id));
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
                    // Until the configuration phase is written, a join ends here.
                    this.send(state, ConfigurationDisconnect, { reason: JOIN_REFUSAL });
                    return await state.connection.close();
                case 'configuration':
                    return;
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
