/**
 * Bedrock's `PlayerList` packets for the roster.
 *
 * The presenter sends a joining client the whole list with these. The session's roster
 * broadcasts use them too, one shared packet compressed once per codec, until the replicator's
 * encoders take over broadcasts in PR 6 of `docs/plans/java-multiprotocol.md`.
 */
import PlayerListPacket from '@jsprismarine/protocol/bedrock/packet/PlayerListPacket';
import { PlayerListAction, PlayerListEntry } from '@jsprismarine/protocol/bedrock/wire/structures/PlayerListEntry';
import type UUID from '@jsprismarine/protocol/bedrock/wire/structures/UUID';

import type { ListedPlayer } from '../../../network/playerListEntry';

/** A player list packet of one action over some entries. */
const playerListPacketOf = (type: PlayerListAction, entries: PlayerListEntry[]): PlayerListPacket => {
    const packet = new PlayerListPacket();
    packet.type = type;
    packet.entries = entries;
    return packet;
};

/**
 * An Add that lists `players`.
 * @param players - The players to list.
 * @returns The packet.
 */
export const playerListAddOf = (players: readonly ListedPlayer[]): PlayerListPacket =>
    playerListPacketOf(
        PlayerListAction.TYPE_ADD,
        players.map(
            ({ uuid, runtimeId, name, xuid, platformChatId, buildPlatform, skin }) =>
                new PlayerListEntry({
                    uuid,
                    runtimeId,
                    name,
                    xuid,
                    platformChatId,
                    buildPlatform,
                    skin,
                    isTeacher: false,
                    isHost: false
                })
        )
    );

/**
 * A Remove for the players with these UUIDs. A Remove entry carries the UUID alone.
 * @param uuids - The players to take off the list.
 * @returns The packet.
 */
export const playerListRemoveOf = (uuids: readonly UUID[]): PlayerListPacket =>
    playerListPacketOf(
        PlayerListAction.TYPE_REMOVE,
        uuids.map((uuid) => new PlayerListEntry({ uuid }))
    );
