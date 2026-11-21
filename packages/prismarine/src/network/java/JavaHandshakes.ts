/**
 * The first exchange on a Java Edition connection: the handshake, then a server list ping, or a
 * join that the server refuses until Java players can join
 * ([ADR 0026](../../../../../docs/adr/0026-java-is-a-second-protocol-family-over-one-world.md)).
 */
import { PrismarineNetworkErrors } from '@jsprismarine/errors/prismarine/network';
import type { Logger } from '@jsprismarine/logger';
import { ClientIntent, Intention } from '@jsprismarine/protocol/java/packet/handshake';
import type { JavaPacketDefinition } from '@jsprismarine/protocol/java/packet/JavaPacket';
import { decodeJavaPacket, encodeJavaPacket, readJavaPacketId } from '@jsprismarine/protocol/java/packet/JavaPacket';
import { LoginDisconnect } from '@jsprismarine/protocol/java/packet/login';
import { PingRequest, PongResponse, StatusRequest, StatusResponse } from '@jsprismarine/protocol/java/packet/status';
import { NEWEST_JAVA_RELEASE } from '@jsprismarine/protocol/java/versions/javaReleases';

import type { ConnectionId } from '../transport/ConnectionId';
import type { Transport, TransportConnection } from '../transport/Transport';
import { errorMessage } from '../../utils/errorMessage';

/** What a server list ping shows, read when the ping arrives: the RakNet pong's server name. */
export interface JavaStatusSource {
    getMotd(): string;
    /** Players of both editions. */
    getOnlinePlayerCount(): number;
    getMaxPlayerCount(): number;
}

/** Where a connection is in its first exchange. */
type Phase = 'handshake' | 'status' | 'login';

/** The reason a refused join shows, until Java Edition players can join. */
const JOIN_REFUSAL = 'This server does not take Java Edition players yet.';

/**
 * The JSON a `Status Response` carries.
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

/** Answers each Java Edition connection's handshake, server list ping and join. */
export class JavaHandshakes {
    private readonly connections = new Map<ConnectionId, { connection: TransportConnection; phase: Phase }>();

    /**
     * Subscribes to the transport's connections.
     * @param transport - The Java Edition transport.
     * @param status - What a server list ping shows.
     * @param log - Where a connection that breaks the protocol is reported.
     */
    public constructor(
        transport: Transport,
        private readonly status: JavaStatusSource,
        private readonly log: Pick<Logger, 'debug'>
    ) {
        transport.onConnect(
            (connection) => void this.connections.set(connection.id, { connection, phase: 'handshake' })
        );
        transport.onDisconnect((id) => void this.connections.delete(id));
        transport.onFrame((frame, id) => this.receive(frame, id));
    }

    private async receive(frame: Buffer, id: ConnectionId): Promise<void> {
        const entry = this.connections.get(id);
        if (entry === undefined) return;
        const { connection } = entry;
        try {
            const { id: packetId, body } = readJavaPacketId(frame);
            const expect = <T>(definition: JavaPacketDefinition<T>): T => {
                if (packetId !== definition.id)
                    throw new PrismarineNetworkErrors.UnexpectedJavaPacket({ packetId, phase: entry.phase });
                return decodeJavaPacket(definition, body);
            };
            switch (entry.phase) {
                case 'handshake': {
                    const { intent } = expect(Intention);
                    entry.phase = intent === ClientIntent.Status ? 'status' : 'login';
                    return;
                }
                case 'status': {
                    if (packetId === StatusRequest.id) {
                        expect(StatusRequest);
                        this.send(connection, StatusResponse, { json: statusJson(this.status) });
                        return;
                    }
                    const { timestamp } = expect(PingRequest);
                    this.send(connection, PongResponse, { timestamp });
                    // The ping is the last thing a server list asks, and a vanilla server hangs
                    // up after answering it.
                    await connection.close();
                    return;
                }
                case 'login': {
                    this.send(connection, LoginDisconnect, { reason: JSON.stringify({ text: JOIN_REFUSAL }) });
                    await connection.close();
                    return;
                }
            }
        } catch (error) {
            this.log.debug(
                `Java connection ${id} sent what its ${entry.phase} phase cannot read: ${errorMessage(error)}`
            );
            await connection.close();
        }
    }

    private send<T>(connection: TransportConnection, definition: JavaPacketDefinition<T>, value: T): void {
        connection.sendFrame(encodeJavaPacket(definition, value));
    }
}
