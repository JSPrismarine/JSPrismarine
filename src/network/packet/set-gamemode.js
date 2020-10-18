const DataPacket = require('./packet').default;
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
