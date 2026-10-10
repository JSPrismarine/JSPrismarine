import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import TextType from '../type/TextType';
import DataPacket from './DataPacket';

/**
 * Packet for chat messages, announcements etc.
 */
/** Which of the three shapes a message has, which the client is told before the type. */
const enum TextCategory {
    MessageOnly = 0,
    AuthoredMessage = 1,
    MessageWithParameters = 2
}

/**
 * The category a text type belongs to.
 *
 * Derived rather than stored: it is a restatement of the type, and the two disagreeing is a
 * packet the client reads the wrong number of strings out of.
 */
const categoryOf = (type: TextType): TextCategory => {
    switch (type) {
        case TextType.Chat:
        case TextType.Whisper:
        case TextType.Announcement:
            return TextCategory.AuthoredMessage;

        case TextType.Translation:
        case TextType.Popup:
        case TextType.JukeboxPopup:
            return TextCategory.MessageWithParameters;

        default:
            return TextCategory.MessageOnly;
    }
};

export default class TextPacket extends DataPacket {
    public static NetID = Identifiers.TextPacket;

    /**
     * The type of the chat message.
     * Eg. Chat, Announcement, Json, etc.
     */
    public type!: TextType;
    public needsTranslation!: boolean;
    public sourceName!: string;

    /**
     * The actual chat message.
     */
    public message!: string;
    public parameters: string[] = [];
    public xuid!: string;
    public platformChatId!: string;
    public filtered!: string;

    public decodePayload(): void {
        // Mirror encodePayload: needsTranslation, then a category byte (a restatement of the
        // type, discarded here), then the type. Reading the type first - the 748 layout - takes
        // it from the needsTranslation byte and never consumes the category, so every field
        // after comes out one byte wrong.
        this.needsTranslation = this.readBoolean();
        this.readByte(); // category, derived from type on the way out
        this.type = this.readByte();

        switch (this.type) {
            case TextType.Chat:
            case TextType.Whisper:
            case TextType.Announcement:
                this.sourceName = NetworkUtil.readString(this);
                this.message = NetworkUtil.readString(this);
                break;

            case TextType.Raw:
            case TextType.Tip:
            case TextType.System:
            case TextType.JsonWhisper:
            case TextType.Json:
                this.message = NetworkUtil.readString(this);
                break;

            case TextType.Translation:
            case TextType.Popup:
            case TextType.JukeboxPopup:
                this.message = NetworkUtil.readString(this);
                const count = this.readUnsignedVarInt();
                for (let i = 0; i < count; i++) {
                    this.parameters.push(NetworkUtil.readString(this));
                }

                break;

            default:
                throw new Error('Invalid TextType');
        }

        this.xuid = NetworkUtil.readString(this);
        this.platformChatId = NetworkUtil.readString(this);

        // Optional, matching encodePayload: a byte says whether the string is there.
        this.filtered = this.readBoolean() ? NetworkUtil.readString(this) : '';
    }

    public encodePayload(): void {
        // The order turned over at 2168, and a category was added in front of the type: the
        // message is a variant now, and the category says which of the three shapes follows.
        // Writing the type first puts it where the client reads a boolean.
        this.writeBoolean(this.needsTranslation);
        this.writeByte(categoryOf(this.type));
        this.writeByte(this.type);

        switch (this.type) {
            case TextType.Chat:
            case TextType.Whisper:
            case TextType.Announcement:
                NetworkUtil.writeString(this, this.sourceName);
            case TextType.Raw:
            case TextType.Tip:
            case TextType.System:
            case TextType.JsonWhisper:
            case TextType.Json:
                NetworkUtil.writeString(this, this.message);
                break;

            case TextType.Translation:
            case TextType.Popup:
            case TextType.JukeboxPopup:
                NetworkUtil.writeString(this, this.message);
                this.writeUnsignedVarInt(this.parameters.length);
                for (const parameter of this.parameters) {
                    NetworkUtil.writeString(this, parameter);
                }

                break;
            default:
                throw new Error('Invalid TextType');
        }

        NetworkUtil.writeString(this, this.xuid);
        NetworkUtil.writeString(this, this.platformChatId);

        // Optional, with a byte saying whether it is there. 748 wrote the string always.
        const filtered = this.filtered ?? '';
        this.writeBoolean(filtered.length > 0);
        if (filtered.length > 0) NetworkUtil.writeString(this, filtered);
    }
}
