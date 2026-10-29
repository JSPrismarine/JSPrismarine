import { NetworkUtil } from '../NetworkUtil';
import { TitleType } from '../type/SetTitleType';
import DataPacket from './DataPacket';

/**
 * Shows a title, a subtitle or an action bar message, or sets how long they stay.
 *
 * Wire order at protocol 2193: `Title Type` as a ZigZag varint32, `Title Text` as a string,
 * `Fade In Time`, `Stay Time` and `Fade Out Time` as ZigZag varint32 in ticks, then `Xuid`,
 * `Platform Online Id` and `Filtered Title Message` as strings.
 *
 * The three trailing strings are the fields the packet gained after 1.16. Omitting them
 * leaves the client reading the next packet's bytes as `Xuid`.
 *
 * {@link TitleType} says what `titleText` means. `TIMES` sets the durations and ignores the
 * text; the `*_TEXT_OBJECT` members carry the JSON form that the `titleraw` command builds.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/set-title-packet/
 */
export default class SetTitlePacket extends DataPacket {
    public titleType: TitleType = TitleType.TITLE;

    /** The text to show, or JSON when the type is one of the text object members. */
    public titleText = '';

    /** Ticks the text takes to fade in. */
    public fadeInTime = 0;

    /** Ticks the text stays at full opacity. */
    public stayTime = 0;

    /** Ticks the text takes to fade out. */
    public fadeOutTime = 0;

    /** The Xbox Live id of the player this is shown to, empty when they are not signed in. */
    public xuid = '';

    /** The player's platform id. Either a uint64 written as text or an empty string. */
    public platformOnlineId = '';

    /** The text for a player with the profanity filter on. Empty leaves `titleText` in place. */
    public filteredTitleMessage = '';

    /** Reads the title type, its text, the three durations and the trailing identity strings. */
    public decodePayload(): void {
        this.titleType = this.readVarInt();
        this.titleText = NetworkUtil.readString(this);
        this.fadeInTime = this.readVarInt();
        this.stayTime = this.readVarInt();
        this.fadeOutTime = this.readVarInt();
        this.xuid = NetworkUtil.readString(this);
        this.platformOnlineId = NetworkUtil.readString(this);
        this.filteredTitleMessage = NetworkUtil.readString(this);
    }

    /** Writes the title type, its text, the three durations and the trailing identity strings. */
    public encodePayload(): void {
        this.writeVarInt(this.titleType);
        NetworkUtil.writeString(this, this.titleText);
        this.writeVarInt(this.fadeInTime);
        this.writeVarInt(this.stayTime);
        this.writeVarInt(this.fadeOutTime);
        NetworkUtil.writeString(this, this.xuid);
        NetworkUtil.writeString(this, this.platformOnlineId);
        NetworkUtil.writeString(this, this.filteredTitleMessage);
    }
}
