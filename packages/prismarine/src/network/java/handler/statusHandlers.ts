/**
 * The handshake and the server list ping: what the client wants, then the server's description and
 * the pong.
 */
import { ClientIntent, Intention } from '@jsprismarine/protocol/java/packet/handshake';
import { PingRequest, PongResponse, StatusRequest, StatusResponse } from '@jsprismarine/protocol/java/packet/status';
import { JAVA_RELEASES, NEWEST_JAVA_RELEASE } from '@jsprismarine/protocol/java/versions/javaReleases';

import { translated } from '../JavaConnection';
import type { JavaStatusSource } from '../JavaConnections';
import { refuseLogin } from './loginHandlers';
import type { JavaPacketHandler } from './JavaPacketHandler';
import { javaHandler } from './JavaPacketHandler';

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

/** The handshake, the status request and the ping. */
export const STATUS_HANDLERS: readonly JavaPacketHandler[] = [
    javaHandler(Intention, async ({ protocolVersion, intent }, { connection }) => {
        if (intent === ClientIntent.Status) {
            connection.phase = 'status';
            return;
        }
        connection.phase = 'login';
        const release = JAVA_RELEASES.find((each) => each.protocolVersion === protocolVersion);
        if (release !== undefined) {
            connection.protocol = release;
            return;
        }
        const key =
            protocolVersion < NEWEST_JAVA_RELEASE.protocolVersion
                ? 'multiplayer.disconnect.outdated_client'
                : 'multiplayer.disconnect.outdated_server';
        await refuseLogin(connection, translated(key, NEWEST_JAVA_RELEASE.minecraftVersion));
    }),
    javaHandler(StatusRequest, (_request, { connection, services }) =>
        connection.send(StatusResponse, { json: statusJson(services.options.status) })
    ),
    javaHandler(PingRequest, async (ping, { connection }) => {
        connection.send(PongResponse, ping);
        // The ping is the last thing a server list asks, and a vanilla server hangs up after
        // answering it.
        await connection.close();
    })
];
