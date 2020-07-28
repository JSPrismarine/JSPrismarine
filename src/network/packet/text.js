const DataPacket = require('./packet')
const Identifiers = require('../identifiers')
const TextType = require('../type/text-type')

'use strict'

class TextPacket extends DataPacket {
    static NetID = Identifiers.TextPacket

    type
    needsTranslation 
    sourceName
    message
    parameters = []
    xuid
    platformChatId = ''

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

        this.xuid = this.readString()
        this.platformChatId = this.readString()
    }

    encodePayload() {
        this.writeByte(this.type)
        this.writeBool(this.needsTranslation)

        switch (this.type) {
            case TextType.Chat:
            case TextType.Whisper:
            case TextType.Announcement:
                this.writeString(this.sourceName)
            case TextType.Raw:
            case TextType.Tip:
            case TextType.System:
            case TextType.JsonWhisper:
            case TextType.Json:
                this.writeString(this.message)
                break
                
            case TextType.Translation:
            case TextType.Popup:
            case TextType.JukeboxPopup:
                this.writeString(this.message)
                this.writeUnsignedVarInt(this.parameters.length)
                for (const parameter of this.parameters) {
                    this.writeString(parameter)
                }
                break
        }

        this.writeString(this.xuid)
        this.writeString(this.platformChatId)
    }
}
module.exports =  TextPacket