import { getGametypeId } from '@jsprismarine/minecraft';
import type { NetherNetStatus } from '@jsprismarine/nethernet';
import type { ServerNameSnapshot } from '@jsprismarine/raknet';

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
