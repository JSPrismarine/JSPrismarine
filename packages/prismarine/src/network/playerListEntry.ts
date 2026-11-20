import PlayerListPacket from '@jsprismarine/protocol/bedrock/packet/PlayerListPacket';
import { PlayerListAction, PlayerListEntry } from '@jsprismarine/protocol/bedrock/wire/structures/PlayerListEntry';

import type { ShownPlayer } from '../world/ShownPlayer';

/**
 * A player's entry in the player list, which is how every other client learns its name, its
 * skin and the platform it plays on before it ever comes into view.
 * @param player - The player to list. Its skin is required: the login handshake always sends one.
 * @param name - The name the list shows, the login name unless a script set another.
 * @returns The entry `PlayerListPacket` carries.
 */
export const playerListEntryOf = (player: ShownPlayer, name = player.getName()): PlayerListEntry =>
    new PlayerListEntry({
        uuid: player.getUUID(),
        runtimeId: player.getRuntimeId(),
        name,
        xuid: player.xuid,
        platformChatId: player.platformChatId,
        buildPlatform: player.device?.os ?? -1,
        skin: player.skin!,
        isTeacher: false,
        isHost: false
    });

/** A player list packet of one action over some entries. */
const playerListPacketOf = (type: PlayerListAction, entries: PlayerListEntry[]): PlayerListPacket => {
    const packet = new PlayerListPacket();
    packet.type = type;
    packet.entries = entries;
    return packet;
};

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
    list: Map<string, PlayerListEntry>,
    broadcast: (packet: PlayerListPacket) => Promise<void>,
    player: ShownPlayer,
    uuid: string,
    name?: string
): Promise<void> => {
    if (!list.has(uuid)) return;
    const entry = playerListEntryOf(player, name);
    list.set(uuid, entry);
    await broadcast(playerListPacketOf(PlayerListAction.TYPE_REMOVE, [new PlayerListEntry({ uuid: entry.getUUID() })]));
    const current = list.get(uuid);
    if (current === undefined) return;
    await broadcast(playerListPacketOf(PlayerListAction.TYPE_ADD, [current]));
};
