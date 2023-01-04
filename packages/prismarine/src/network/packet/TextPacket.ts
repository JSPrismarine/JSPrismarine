import DataPacket from './DataPacket.js';
import Identifiers from '../Identifiers.js';
import McpeUtil from '../NetworkUtil.js';
import TextType from '../type/TextType.js';

/**
 * Packet for chat messages, announcements etc.
 *
 * @public
 */
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

    public decodePayload() {
        this.type = this.readByte();
        this.needsTranslation = this.readBoolean();

        switch (this.type) {
            case TextType.Chat:
            case TextType.Whisper:
            case TextType.Announcement:
                this.sourceName = McpeUtil.readString(this);
            case TextType.Raw:
            case TextType.Tip:
            case TextType.System:
            case TextType.JsonWhisper:
            case TextType.Json:
                this.message = McpeUtil.readString(this);
                break;

            case TextType.Translation:
            case TextType.Popup:
            case TextType.JukeboxPopup:
                this.message = McpeUtil.readString(this);
                const count = this.readUnsignedVarInt();
                for (let i = 0; i < count; i++) {
                    this.parameters.push(McpeUtil.readString(this));
                }

                break;

            default:
                throw new Error('Invalid TextType');
        }

        this.xuid = McpeUtil.readString(this);
        this.platformChatId = McpeUtil.readString(this);
    }

    public encodePayload() {
        this.writeByte(this.type);
        this.writeBoolean(this.needsTranslation);

        switch (this.type) {
            case TextType.Chat:
            case TextType.Whisper:
            case TextType.Announcement:
                McpeUtil.writeString(this, this.sourceName);
            case TextType.Raw:
            case TextType.Tip:
            case TextType.System:
            case TextType.JsonWhisper:
            case TextType.Json:
                McpeUtil.writeString(this, this.message);
                break;

            case TextType.Translation:
            case TextType.Popup:
            case TextType.JukeboxPopup:
                McpeUtil.writeString(this, this.message);
                this.writeUnsignedVarInt(this.parameters.length);
                for (const parameter of this.parameters) {
                    McpeUtil.writeString(this, parameter);
                }

                break;
            default:
                throw new Error('Invalid TextType');
        }

        McpeUtil.writeString(this, this.xuid);
        McpeUtil.writeString(this, this.platformChatId);
    }
}
