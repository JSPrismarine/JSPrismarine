<<<<<<< HEAD
const DataPacket = require('./packet').default;
=======
const DataPacket = require('./Packet').default;
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e
const Identifiers = require('../Identifiers').default;


class SetTitlePacket extends DataPacket {
    static NetID = Identifiers.SetTitlePacket

    /** @type {number} */
    type
    /** @type {string} */
    text = ''
    /** @type {number} */
    fadeInTime = 500
    /** @type {number} */
    stayTime = 3000
    /** @type {number} */
    fadeOutTime = 1000

    decodePayload() {
        this.type = this.readVarInt();
        this.text = this.readString();
        this.fadeInTime = this.readVarInt();
        this.stayTime = this.readVarInt();
        this.fadeOutTime = this.readVarInt();
    }

    encodePayload() {
        this.writeVarInt(this.type);
        this.writeString(this.text);
        this.writeVarInt(this.fadeInTime);
        this.writeVarInt(this.stayTime);
        this.writeVarInt(this.fadeOutTime);
    }
}
module.exports = SetTitlePacket;
