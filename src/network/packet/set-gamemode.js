<<<<<<< HEAD
const DataPacket = require('./packet').default;
=======
const DataPacket = require('./Packet').default;
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e
const Identifiers = require('../Identifiers').default;


class SetGamemodePacket extends DataPacket {
    static NetID = Identifiers.SetPlayerGameTypePacket

    /** @type {number} */
    gamemode

    encodePayload() {
        this.writeVarInt(this.gamemode);
    }
}
module.exports = SetGamemodePacket;
