/**
 * `PlayerListPacket`: adds players to or removes them from the client's player list,
 * described as a declarative field list.
 *
 * The payload is a varuint entry count followed by one entry per player: a varuint variant
 * selector (1 for an Add entry, 0 for a Remove entry), the Action as a uint8, and the UUID.
 * An Add entry continues with the fields `PlayerListEntry.networkSerialize` writes. The
 * trusted-skin flag lives inside the skin, so nothing follows the entries. Every entry
 * depends on the Action in front of it, so the whole body travels as one named custom type.
 *
 * At protocol 2225 the PlayFab id changed owner. At 2193 it travels inside `SerializedSkin`,
 * at its ordinal 1. At 2225 it is a `PlayerListAddEntry` field of its own at ordinal 5,
 * between `XBL XUID` and `Platform Online ID`, and the skin no longer carries one. The value
 * is the same string; only where it sits moved, and the move is expressed as a gated pair of
 * body types.
 *
 * Writing the 2193 layout to a 2225 client is not a field the client merely misreads. The
 * entry's `Build Platform` is a fixed four-byte little-endian int, so a client that has
 * consumed one string too few reaches it while expecting a string and reads its bytes as a
 * varint length - a huge one. The read runs off the end of the entry and the join dies with
 * the connection rather than with a named reason, which is the "Terracotta" disconnect
 * screen. `docs/research/protocol-2225-delta.md` records the diagnosis. Verified against the
 * `PlayerListAddEntry.json` and `SerializedSkin.json` schemas in Mojang's v1.26.51 and
 * v1.26.60 `metadata.zip`, and against gophertunnel v1.63.0, which made the same move its
 * 1.26.60 breaking change.
 */
import { definePacket, gated } from '../define';
import * as t from '../fieldTypes';
import { NetworkUtil } from '../networkUtil';
import { PlayerListAction, PlayerListEntry } from '../structures/PlayerListEntry';
import Skin, { SKIN_WIRE_2193, SKIN_WIRE_2225 } from '../structures/skin/Skin';
import UUID from '../structures/UUID';
import { SINCE_2225, UNTIL_2225 } from '../wireGates';

import type { PayloadOf } from '../define';
import type { SkinWireLayout } from '../structures/skin/Skin';

/** The Action and the entries it shapes, as one value. */
export interface PlayerListBody {
    /** The Action byte: 0 adds a player, 1 removes one. */
    type: number;
    entries: PlayerListEntry[];
}

/** The whole entry list under one `SerializedSkin` layout; the field lists gate which. */
const playerListBody = (layout: SkinWireLayout) =>
    t.custom<PlayerListBody | null>(
        layout.carriesPlayFabId ? 'PlayerListBody' : 'PlayerListBody[PlayFabId on entry]',
        (stream, value) => {
            if (value === null) throw new TypeError('A player list cannot be written without its entries');

            const adding = value.type === PlayerListAction.TYPE_ADD;
            stream.writeUnsignedVarInt(value.entries.length);
            for (const entry of value.entries) {
                stream.writeUnsignedVarInt(adding ? 1 : 0);
                stream.writeByte(value.type);

                entry.getUUID().networkSerialize(stream);
                if (adding) entry.networkSerialize(stream, layout);
            }
        },
        (stream) => {
            let type = PlayerListAction.TYPE_ADD;
            const entries: PlayerListEntry[] = [];
            for (let i = 0, count = stream.readUnsignedVarInt(); i < count; i++) {
                stream.readUnsignedVarInt(); // Variant selector: 1 for Add, 0 for Remove.
                type = stream.readByte(); // Action.

                const uuid = UUID.networkDeserialize(stream);
                if (type !== PlayerListAction.TYPE_ADD) {
                    entries.push(new PlayerListEntry({ uuid }));
                    continue;
                }

                const runtimeId = stream.readVarLong();
                const name = NetworkUtil.readString(stream);
                const xuid = NetworkUtil.readString(stream);
                const playFabId = layout.carriesPlayFabId ? null : NetworkUtil.readString(stream);
                const platformChatId = NetworkUtil.readString(stream);
                const buildPlatform = stream.readIntLE();
                const skin = Skin.networkDeserialize(stream, layout);
                if (playFabId !== null) skin.setPlayFabId(playFabId);

                entries.push(
                    new PlayerListEntry({
                        uuid,
                        runtimeId,
                        name,
                        xuid,
                        platformChatId,
                        buildPlatform,
                        skin,
                        isTeacher: stream.readBoolean(),
                        isHost: stream.readBoolean(),
                        isSubClient: stream.readBoolean(),
                        color: stream.readIntLE()
                    })
                );
            }

            return { type, entries };
        }
    );

/** The `PlayerListPacket` field list; the module doc carries the wire provenance. */
export const playerListPacket = definePacket('PlayerListPacket', {
    /** The 2193 body: the PlayFab id travels inside each entry's skin. */
    bodyWithPlayFabIdInSkin: gated<PlayerListBody | null>(UNTIL_2225, playerListBody(SKIN_WIRE_2193), null),
    /** The 2225 body: the PlayFab id is an entry field of its own. */
    bodyWithPlayFabIdOnEntry: gated<PlayerListBody | null>(SINCE_2225, playerListBody(SKIN_WIRE_2225), null)
});

/** Adds players and their skin details to the roster or removes roster entries by UUID. */
export type PlayerListPayload = PayloadOf<typeof playerListPacket>;
