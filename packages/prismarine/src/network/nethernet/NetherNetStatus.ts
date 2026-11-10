import { getGametypeId } from '@jsprismarine/minecraft';
import type { ServerNameSnapshot } from '@jsprismarine/raknet';

/**
 * What a NetherNet client is told about a server before it joins: the LAN advertisement on UDP
 * 7551 and the `GET /v1/join` answer on the game port both carry these.
 */
export interface NetherNetStatus {
    readonly motd: string;
    readonly levelName: string;
    readonly protocol: number;
    /** The game version, such as `1.26.51`. */
    readonly version: string;
    readonly playerCount: number;
    readonly maxPlayers: number;
    /** The `Gametype` id: 0 survival, 1 creative, 2 adventure. */
    readonly gameType: number;
}

/**
 * The status, from the server name every transport advertises.
 * @param snapshot - The server name's snapshot: MOTD, version and player counts.
 * @param levelName - The level players join.
 */
export const netherNetStatusOf = (snapshot: ServerNameSnapshot, levelName: string): NetherNetStatus => ({
    motd: snapshot.motd,
    levelName,
    protocol: snapshot.protocol,
    version: snapshot.version,
    playerCount: snapshot.onlinePlayers,
    maxPlayers: snapshot.maxPlayers,
    gameType: getGametypeId(snapshot.gamemode)
});

/**
 * The `GET /v1/join` body: the status under the field names Bedrock Dedicated Server 1.26.51
 * answers with, in its order.
 */
export const joinStatusJson = (status: NetherNetStatus): string =>
    JSON.stringify({
        name: status.motd,
        protocol: status.protocol,
        version: status.version,
        level: status.levelName,
        players: status.playerCount,
        maxPlayers: status.maxPlayers,
        gameType: status.gameType
    });
