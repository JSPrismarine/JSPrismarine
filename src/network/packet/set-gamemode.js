const DataPacket = require('./packet');
const Identifiers = require('../identifiers');


class SetGamemodePacket extends DataPacket {
    static NetID = Identifiers.SetPlayerGameTypePacket

    /** @type {number} */
    gamemode

    encodePayload() {
        this.writeVarInt(this.gamemode);
    }
}
module.exports = SetGamemodePacket;
