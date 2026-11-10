import { PlayerListEntry } from '@jsprismarine/protocol/wire/structures/PlayerListEntry';

import type { ShownPlayer } from '../world/ShownPlayer';

/**
 * A player's entry in the player list, which is how every other client learns its name, its
 * skin and the platform it plays on before it ever comes into view.
 *
 * A legacy player and a player in the entity store are both listed through this, so the two
 * cannot drift apart.
 * @param player - The player to list. Its skin is required: the login handshake always sends one.
 * @returns The entry `PlayerListPacket` carries.
 */
export const playerListEntryOf = (player: ShownPlayer): PlayerListEntry =>
    new PlayerListEntry({
        uuid: player.getUUID(),
        runtimeId: player.getRuntimeId(),
        name: player.getName(),
        xuid: player.xuid,
        platformChatId: player.platformChatId,
        buildPlatform: player.device?.os ?? -1,
        skin: player.skin!,
        isTeacher: false,
        isHost: false
    });
