/**
 * Each Java Edition connection from its handshake to the play phase
 * ([ADR 0026](../../../../../docs/adr/0026-java-is-a-second-protocol-family-over-one-world.md)):
 * a server list ping, or a login that verifies the player with Mojang when `online-mode` is on,
 * turns on encryption and compression, configures the client and joins the player to the world.
 *
 * Each frame goes to the handler of the packet its id names in the connection's phase and release,
 * as a Bedrock packet goes to the handler registered under its name; the handlers live under
 * `handler/`.
 */
import { generateKeyPairSync, randomUUID } from 'node:crypto';

import { PrismarineNetworkErrors } from '@jsprismarine/errors/prismarine/network';
import type { Logger } from '@jsprismarine/logger';
import { decodeJavaPacket, readJavaPacketId } from '@jsprismarine/protocol/java/packet/JavaPacket';
import { decompressFrame } from '@jsprismarine/protocol/java/wire/compression';

import { errorMessage } from '../../utils/errorMessage';
import type Chunk from '../../world/chunk/Chunk';
import type PlayerSession from '../PlayerSession';
import type { ConnectionId } from '../transport/ConnectionId';
import type { TcpTransportConnection } from '../transport/TcpTransport';
import type { Transport } from '../transport/Transport';
import { javaItemTranslation } from './editionTranslation';
import { CONFIGURATION_HANDLERS } from './handler/configurationHandlers';
import type { JavaServices } from './handler/JavaPacketHandler';
import { JavaPacketHandlers } from './handler/JavaPacketHandler';
import { LOGIN_HANDLERS } from './handler/loginHandlers';
import { PLAY_HANDLERS } from './handler/playHandlers';
import { STATUS_HANDLERS } from './handler/statusHandlers';
import { hasJoined } from './javaAuth';
import type { JavaChunkLight } from './javaChunk';
import { JavaChunkTranslator } from './javaChunk';
import { JavaConnection } from './JavaConnection';
import type { JavaPlayers } from './javaPlayers';

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

/** Every handler of what a Java client sends. */
const HANDLERS = new JavaPacketHandlers([
    ...STATUS_HANDLERS,
    ...LOGIN_HANDLERS,
    ...CONFIGURATION_HANDLERS,
    ...PLAY_HANDLERS
]);

/**
 * The phases in which a packet the phase has, but no handler reads, is read past: the client's
 * settings, its brand, its tick end and the like. In the others such a packet, a cookie the server
 * never asked for, has no place.
 */
const READ_PAST: ReadonlySet<JavaConnection['phase']> = new Set(['configuration', 'play']);

/** Drives each Java Edition connection from its handshake to the play phase. */
export class JavaConnections {
    private readonly connections = new Map<ConnectionId, JavaConnection>();
    private readonly services: JavaServices;

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
        this.services = {
            options,
            key: { publicDer: publicKey.export({ type: 'spki', format: 'der' }), privateKey },
            askSessionServer: options.hasJoined ?? hasJoined,
            sessionId: randomUUID(),
            chunks: new JavaChunkTranslator(),
            items: javaItemTranslation()
        };
        transport.onConnect(
            (connection) => void this.connections.set(connection.id, new JavaConnection(connection, options.log))
        );
        transport.onDisconnect(async (id) => {
            const connection = this.connections.get(id);
            if (connection?.keepAlive !== undefined) clearInterval(connection.keepAlive.timer);
            this.connections.delete(id);
            // Whether or not the join got as far as a session: one that ended early, replaced by a
            // later login or cancelled by a listener, still holds its place among the sessions.
            if (connection?.phase === 'play') await this.options.world?.players.leave(id);
        });
        transport.onFrame((frame, id) => this.receive(frame, id));
    }

    private async receive(frame: Buffer, id: ConnectionId): Promise<void> {
        const connection = this.connections.get(id);
        if (connection === undefined) return;
        try {
            const packet =
                connection.compression === undefined ? frame : decompressFrame(frame, connection.compression);
            const { id: packetId, body } = readJavaPacketId(packet);
            const found = HANDLERS.lookup(connection.protocol, connection.phase, packetId);
            if (found.kind === 'handled') {
                const payload = decodeJavaPacket(connection.protocol, found.handler.packet, body);
                return await found.handler.handle(payload, { connection, services: this.services });
            }
            if (found.kind === 'unread' && READ_PAST.has(connection.phase)) return;
            throw new PrismarineNetworkErrors.UnexpectedJavaPacket({ packetId, phase: connection.phase });
        } catch (error) {
            this.options.log.debug(
                `Java connection ${id} sent what its ${connection.phase} phase cannot read: ${errorMessage(error)}`
            );
            await connection.close();
        }
    }
}
