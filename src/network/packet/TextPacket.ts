import Identifiers from '../Identifiers';
import TextType from '../type/TextType';
import DataPacket from './DataPacket';

export default class TextPacket extends DataPacket {
    static NetID = Identifiers.TextPacket;

    public type: TextType = TextType.Chat;
    public needsTranslation: boolean = false;
    public sourceName: string = '';
    public message: string = '';
    public parameters: Array<string> = [];
    public xuid: string = '';
    public platformChatId: string = '';

    public decodePayload() {
        this.type = this.readByte();
        this.needsTranslation = this.readBool();

        switch (this.type) {
            case TextType.Chat:
            case TextType.Whisper:
            case TextType.Announcement:
                this.sourceName = this.readString();
            case TextType.Raw:
            case TextType.Tip:
            case TextType.System:
            case TextType.JsonWhisper:
            case TextType.Json:
                this.message = this.readString();
                break;

            case TextType.Translation:
            case TextType.Popup:
            case TextType.JukeboxPopup:
                this.message = this.readString();
                let count = this.readUnsignedVarInt();
                for (let i = 0; i < count; i++) {
                    this.parameters.push(this.readString());
                }
                break;
        }

        this.xuid = this.readString();
        this.platformChatId = this.readString();
    }

    public encodePayload() {
        this.writeByte(this.type);
        this.writeBool(+this.needsTranslation);

        switch (this.type) {
            case TextType.Chat:
            case TextType.Whisper:
            case TextType.Announcement:
                this.writeString(this.sourceName);
            case TextType.Raw:
            case TextType.Tip:
            case TextType.System:
            case TextType.JsonWhisper:
            case TextType.Json:
                this.writeString(this.message);
                break;

            case TextType.Translation:
            case TextType.Popup:
            case TextType.JukeboxPopup:
                this.writeString(this.message);
                this.writeUnsignedVarInt(this.parameters.length);
                for (const parameter of this.parameters) {
                    this.writeString(parameter);
                }
                break;
        }

        this.writeString(this.xuid);
        this.writeString(this.platformChatId);
    }
}
