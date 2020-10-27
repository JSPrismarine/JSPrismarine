<<<<<<< HEAD:src/network/packet/text.js
const DataPacket = require('./packet').default;
const Identifiers = require('../Identifiers').default;
const TextType = require('../type/text-type');
=======
import Identifiers from "../Identifiers";
import TextType from "../type/TextType";
import DataPacket from "./Packet";
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e:src/network/packet/TextPacket.ts

export default class TextPacket extends DataPacket {
    static NetID = Identifiers.TextPacket

    type: TextType = TextType.Chat;
    needsTranslation = false;
    sourceName = '';
    message = '';
    parameters: Array<string> = [];
    xuid = '';
    platformChatId = '';

    decodePayload() {
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

    encodePayload() {
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
};
