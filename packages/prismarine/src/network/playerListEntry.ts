import type PlayerListPacket from '@jsprismarine/protocol/bedrock/packet/PlayerListPacket';
import type Skin from '@jsprismarine/protocol/bedrock/wire/structures/skin/Skin';
import type UUID from '@jsprismarine/protocol/bedrock/wire/structures/UUID';

import type { ShownPlayer } from '../world/ShownPlayer';
import { playerListAddOf, playerListRemoveOf } from '../editions/bedrock/presenter/bedrockPlayerList';

/**
 * A player as every client's player list shows it, which is how every other client learns its
 * name, its skin and the platform it plays on before it ever comes into view.
 */
export interface ListedPlayer {
    readonly uuid: UUID;
    readonly runtimeId: bigint;
    /** The name the list shows, the login name unless a script set another. */
    readonly name: string;
    readonly xuid: string;
    readonly platformChatId: string;
    /** The platform the player plays on, or -1 when it is not known. */
    readonly buildPlatform: number;
    readonly skin: Skin;
}

/**
 * A player's entry in the player list.
 * @param player - The player to list. Its skin is required: the login handshake always sends one.
 * @param name - The name the list shows, the login name unless a script set another.
 * @returns The entry.
 */
export const listedPlayerOf = (player: ShownPlayer, name = player.getName()): ListedPlayer => ({
    uuid: player.getUUID(),
    runtimeId: player.getRuntimeId(),
    name,
    xuid: player.xuid,
    platformChatId: player.platformChatId,
    buildPlatform: player.device?.os ?? -1,
    skin: player.skin!
});

/**
 * Replaces the name a player's entry shows: in the session manager's list, which a later joiner
 * is sent, and on every client. A client keeps the entry it has for a UUID it already lists, so
 * each gets a Remove for the entry and then an Add with the entry the list holds once the Remove
 * has gone: the one built here, or a newer one a skin change or a later rename put there since,
 * so the Add never lists what is no longer current. A player without an entry, who has not
 * joined yet or who left while the Remove was on its way, is left alone.
 * @param list - The session manager's entries, by the UUID string the session's identity holds.
 * @param broadcast - Sends a packet to every session.
 * @param player - The player whose entry changes.
 * @param uuid - The player's key in the list.
 * @param name - The name to show, or the login name when left out.
 */
export const setPlayerListName = async (
    list: Map<string, ListedPlayer>,
    broadcast: (packet: PlayerListPacket) => Promise<void>,
    player: ShownPlayer,
    uuid: string,
    name?: string
): Promise<void> => {
    if (!list.has(uuid)) return;
    const entry = listedPlayerOf(player, name);
    list.set(uuid, entry);
    await broadcast(playerListRemoveOf([entry.uuid]));
    const current = list.get(uuid);
    if (current === undefined) return;
    await broadcast(playerListAddOf([current]));
};
