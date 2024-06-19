import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import TextType from '../type/TextType';
import DataPacket from './DataPacket';

/**
 * Packet for chat messages, announcements etc.
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

    public decodePayload(): void {
        this.type = this.readByte();
        this.needsTranslation = this.readBoolean();

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
    }

    public encodePayload(): void {
        this.writeByte(this.type);
        this.writeBoolean(this.needsTranslation);

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
    }
}
