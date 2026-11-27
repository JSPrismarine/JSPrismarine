import { getGametypeId } from '@jsprismarine/minecraft';
import type { NetherNetStatus } from '@jsprismarine/nethernet';

import type { ServerStatusSnapshot } from '../ServerStatus';

/**
 * NetherNet's status, from the status every transport advertises. The `level` field carries the
 * status's second name, which RakNet's pong carries in the same position.
 * @param status - What a server list shows now: MOTD, names, version and player counts.
 */
export const netherNetStatusOf = (status: ServerStatusSnapshot): NetherNetStatus => ({
    motd: status.motd,
    levelName: status.levelName,
    protocol: status.protocol,
    version: status.version,
    playerCount: status.onlinePlayers,
    maxPlayers: status.maxPlayers,
    gameType: getGametypeId(status.gamemode)
});
