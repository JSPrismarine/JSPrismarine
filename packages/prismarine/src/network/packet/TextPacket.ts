import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import TextType from '../type/TextType';
import DataPacket from './DataPacket';

/** The three shapes of the Body variant, as the docs name them. The value is the variant index on the wire. */
const enum BodyVariant {
    MessageOnly = 0,
    AuthorAndMessage = 1,
    MessageAndParams = 2
}

/**
 * The body variant a message type is sent in.
 *
 * Derived rather than stored: it is a restatement of the type, and the two disagreeing is a
 * packet the client reads the wrong number of strings out of. Every type not listed here,
 * `JsonAnnouncement` (the docs' textObjectAnnouncement) included, is MessageOnly.
 */
const variantOf = (type: TextType): BodyVariant => {
    switch (type) {
        case TextType.Chat:
        case TextType.Whisper:
        case TextType.Announcement:
            return BodyVariant.AuthorAndMessage;

        case TextType.Translation:
        case TextType.Popup:
        case TextType.JukeboxPopup:
            return BodyVariant.MessageAndParams;

        default:
            return BodyVariant.MessageOnly;
    }
};

/**
 * Chat, system messages, popups and translations (docs id 9).
 *
 * Protocol 2193 layout, after the header: "Localize?" boolean (`needsTranslation`), then the
 * "Body" oneOf as a one-byte variant index followed by the one-byte "Message Type" (`type`)
 * and the variant's fields. MessageOnly (0) carries "Message"; AuthorAndMessage (1) carries
 * "Player Name" (`sourceName`) then "Message"; MessageAndParams (2) carries "Message" then a
 * "Parameter List" of varuint count and strings. Then "Sender's XUID", "Platform Id", and
 * "Filtered Message" as an optional: a presence boolean, then the string only when present.
 * Older protocols wrote the type first and the filtered string unconditionally.
 */
export default class TextPacket extends DataPacket {
    public static NetID = Identifiers.TextPacket;

    /** "Message Type": a global `TextType` value, not an index within the body variant. */
    public type!: TextType;
    /** "Localize?": whether the client should run the message through its translations. */
    public needsTranslation!: boolean;
    /** "Player Name": only written for Chat, Whisper and Announcement. */
    public sourceName!: string;

    /** "Message": the text, or a translation key for the MessageAndParams types. */
    public message!: string;
    /** "Parameter List": only written for Translation, Popup and JukeboxPopup. */
    public parameters: string[] = [];
    /** "Sender's XUID". */
    public xuid!: string;
    /** "Platform Id". */
    public platformChatId!: string;
    /** "Filtered Message". An empty string is sent as absent and read back from absent. */
    public filtered!: string;

    public decodePayload(): void {
        this.needsTranslation = this.readBoolean();

        // The variant index says which shape follows. The type is read as sent and left to
        // the handler; it is the index, not the type, that decides what to read next.
        const variant = this.readByte();
        this.type = this.readByte();

        switch (variant) {
            case BodyVariant.MessageOnly:
                this.message = NetworkUtil.readString(this);
                break;

            case BodyVariant.AuthorAndMessage:
                this.sourceName = NetworkUtil.readString(this);
                this.message = NetworkUtil.readString(this);
                break;

            case BodyVariant.MessageAndParams: {
                this.message = NetworkUtil.readString(this);
                const count = this.readUnsignedVarInt();
                this.parameters = [];
                for (let i = 0; i < count; i++) {
                    this.parameters.push(NetworkUtil.readString(this));
                }
                break;
            }

            default:
                throw new Error(`Unknown TextPacket body variant ${variant}`);
        }

        this.xuid = NetworkUtil.readString(this);
        this.platformChatId = NetworkUtil.readString(this);
        this.filtered = this.readBoolean() ? NetworkUtil.readString(this) : '';
    }

    public encodePayload(): void {
        this.writeBoolean(this.needsTranslation);

        const variant = variantOf(this.type);
        this.writeByte(variant);
        this.writeByte(this.type);

        switch (variant) {
            case BodyVariant.MessageOnly:
                NetworkUtil.writeString(this, this.message);
                break;

            case BodyVariant.AuthorAndMessage:
                NetworkUtil.writeString(this, this.sourceName ?? '');
                NetworkUtil.writeString(this, this.message);
                break;

            case BodyVariant.MessageAndParams:
                NetworkUtil.writeString(this, this.message);
                this.writeUnsignedVarInt(this.parameters.length);
                for (const parameter of this.parameters) {
                    NetworkUtil.writeString(this, parameter);
                }
                break;
        }

        NetworkUtil.writeString(this, this.xuid);
        NetworkUtil.writeString(this, this.platformChatId);

        const filtered = this.filtered ?? '';
        this.writeBoolean(filtered.length > 0);
        if (filtered.length > 0) NetworkUtil.writeString(this, filtered);
    }
}
