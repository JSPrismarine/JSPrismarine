import { SKIN_WIRE_2225 } from '../../utils/skin/Skin';
import type { SkinWireLayout } from '../../utils/skin/Skin';
import PlayerSkinPacket from './PlayerSkinPacket';

/**
 * `PlayerSkinPacket` at protocol 2225, which carries a `SerializedSkin` and so inherits the
 * field that left it: the skin's own `PlayFabID` is gone from ordinal 1.
 *
 * Unlike the player list, nothing takes the field's place here - the packet has no entry to
 * move it onto - so a 2225 skin is simply one string shorter. `PlayerListPacket2225` has the
 * schema citations and the failure this layout avoids.
 */
export default class PlayerSkinPacket2225 extends PlayerSkinPacket {
    /** The base packet's name, so handlers and name-keyed id lookups never see the version suffix. */
    public override getName(): string {
        return 'PlayerSkinPacket';
    }

    protected override skinLayout(): SkinWireLayout {
        return SKIN_WIRE_2225;
    }
}
