import { SKIN_WIRE_2225 } from '../../utils/skin/Skin';
import type { SkinWireLayout } from '../../utils/skin/Skin';
import PlayerListPacket from './PlayerListPacket';

/**
 * `PlayerListPacket` at protocol 2225, where the PlayFab id changes owner.
 *
 * At 2193 the id travels inside `SerializedSkin`, at its ordinal 1. At 2225 it is a
 * `PlayerListAddEntry` field of its own at ordinal 5, between `XBL XUID` and
 * `Platform Online ID`, and the skin no longer carries one. The value is the same string; only
 * where it sits moved.
 *
 * Writing the 2193 layout to a 2225 client is not a field the client merely misreads. The
 * entry's `Build Platform` is a fixed four-byte little-endian int, so a client that has
 * consumed one string too few reaches it while expecting a string and reads its bytes as a
 * varint length - a huge one. The read runs off the end of the entry and the join dies with
 * the connection rather than with a named reason, which is the "Terracotta" disconnect screen.
 * `docs/research/protocol-2225-delta.md` records the diagnosis.
 *
 * Verified against the `PlayerListAddEntry.json` and `SerializedSkin.json` schemas in Mojang's
 * v1.26.51 and v1.26.60 `metadata.zip`, whose ordinals are the only claim made here, and
 * against gophertunnel v1.63.0, which made the same move its 1.26.60 breaking change.
 */
export default class PlayerListPacket2225 extends PlayerListPacket {
    /** The base packet's name, so handlers and name-keyed id lookups never see the version suffix. */
    public override getName(): string {
        return 'PlayerListPacket';
    }

    protected override skinLayout(): SkinWireLayout {
        return SKIN_WIRE_2225;
    }
}
