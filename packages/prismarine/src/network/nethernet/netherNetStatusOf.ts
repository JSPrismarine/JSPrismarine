import { getGametypeId } from '@jsprismarine/minecraft';
import type { NetherNetStatus } from '@jsprismarine/nethernet';
import type { ServerNameSnapshot } from '@jsprismarine/raknet';

/**
 * The status, from the server name every transport advertises. The `level` field carries the
 * server name's software name, as RakNet's pong does in the same position, the way other
 * third-party servers fill it, rather than the level players join.
 * @param snapshot - The server name's snapshot: MOTD, name, version and player counts.
 */
export const netherNetStatusOf = (snapshot: ServerNameSnapshot): NetherNetStatus => ({
    motd: snapshot.motd,
    levelName: snapshot.name,
    protocol: snapshot.protocol,
    version: snapshot.version,
    playerCount: snapshot.onlinePlayers,
    maxPlayers: snapshot.maxPlayers,
    gameType: getGametypeId(snapshot.gamemode)
});
