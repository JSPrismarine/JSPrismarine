const DataPacket = require("./data_packet")
const Identifiers = require("../identifiers")

'use strict'

const TextType = {
    Raw: 0,
    Chat: 1,
    Translation: 2,
    Popup: 3,
    JukeboxPopup: 4,
    Tip: 5,
    System: 6,
    Whisper: 7,
    Announcement: 8,
    JsonWhisper: 9,
    Json: 10
}
class TextPacket extends DataPacket {
    static NetID = Identifiers.TextPacket

    type
    needsTranslation
    sourceName
    message
    parameters = []
    XUID
    platformChatId

    decodePayload() {
        this.type = this.readByte()
        this.needsTranslation = this.readBool()

        switch (this.type) {
            case TextType.Chat:
            case TextType.Whisper:
            case TextType.Announcement:
                this.sourceName = this.readString()
            case TextType.Raw:
            case TextType.Tip:
            case TextType.System:
            case TextType.JsonWhisper:
            case TextType.Json:
                this.message = this.readString()
                break
                
            case TextType.Translation:
            case TextType.Popup:
            case TextType.JukeboxPopup:
                this.message = this.readString()
                let count = this.readUnsignedVarInt()
                for (let i = 0; i < count; i++) {
                    this.parameters.push(this.readString())
                }
                break
        }

        this.XUID = this.readString()
        this.platformChatId = this.readString()
    }
}
module.exports =  { TextPacket, TextType }