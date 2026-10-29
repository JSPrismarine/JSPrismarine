import UUID from '../../utils/UUID';
import Skin, { SKIN_WIRE_2193 } from '../../utils/skin/Skin';
import type { SkinWireLayout } from '../../utils/skin/Skin';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * A player changing skin mid-session.
 *
 * The client sends it, and the server forwards it to every other client. Protocol 2193 wire
 * order: `UUID` (the player's), `Serialized Skin`, `Localized New Skin Name` string,
 * `Localized Old Skin Name` string. There is no trusted flag of its own at this level; it
 * travels inside the skin as its `TrustedSkinFlag` string, which `Skin.isTrusted` records.
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

    /** Writes the UUID, the skin, and the two localized names. */
    public encodePayload(): void {
        this.uuid.networkSerialize(this);
        this.skin.networkSerialize(this, this.skinLayout());
        NetworkUtil.writeString(this, this.newSkinName);
        NetworkUtil.writeString(this, this.oldSkinName);
    }

    /**
     * Which `SerializedSkin` layout this packet's skin uses. The seam protocol 2225
     * overrides, where the skin no longer carries a PlayFab id of its own.
     * @returns {SkinWireLayout} the layout.
     */
    protected skinLayout(): SkinWireLayout {
        return SKIN_WIRE_2193;
    }

    /** Reads the UUID, the skin, and the two localized names. */
    public decodePayload(): void {
        this.uuid = UUID.networkDeserialize(this);
        this.skin = Skin.networkDeserialize(this, this.skinLayout());
        this.newSkinName = NetworkUtil.readString(this);
        this.oldSkinName = NetworkUtil.readString(this);
    }
}
