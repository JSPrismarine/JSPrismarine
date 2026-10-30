import { layoutAt } from '@jsprismarine/protocol';

import type UUID from '../../utils/UUID';
import type Skin from '../../utils/skin/Skin';
import DataPacket from './DataPacket';
import { playerSkinPacket } from './playerSkin.wire';

/**
 * A player changing skin mid-session.
 *
 * The client sends it, and the server forwards it to every other client. The wire layout
 * lives in `playerSkin.wire.ts`'s declarative definition, which this class walks at the
 * protocol version stamped on it: which `SerializedSkin` layout travels - and so whether the
 * skin carries its own PlayFab id - is the layout's decision, not this file's. There is no
 * trusted flag of its own at this level; it travels inside the skin as its `TrustedSkinFlag`
 * string, which `Skin.isTrusted` records.
 */
export default class PlayerSkinPacket extends DataPacket {
    /** The player whose skin changed. */
    public uuid!: UUID;
    /** The new skin, laid out as `SerializedSkin`. */
    public skin!: Skin;
    /** `Localized New Skin Name`. */
    public newSkinName!: string;
    /** `Localized Old Skin Name`. */
    public oldSkinName!: string;

    /** The skin under the key its 2193 layout travels as; the stamped version picks one. */
    public get skinCarryingPlayFabId(): Skin {
        return this.skin;
    }

    public set skinCarryingPlayFabId(value: Skin | null) {
        if (value !== null) this.skin = value;
    }

    /** The skin under the key its 2225 layout travels as. */
    public get skinWithoutPlayFabId(): Skin {
        return this.skin;
    }

    public set skinWithoutPlayFabId(value: Skin | null) {
        if (value !== null) this.skin = value;
    }

    /** Writes the fields the stamped protocol version puts on the wire, in layout order. */
    public encodePayload(): void {
        layoutAt(playerSkinPacket, this.codecProtocol).encode(this, this);
    }

    /** Reads them back in the same order. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(playerSkinPacket, this.codecProtocol).decode(this));
    }
}
