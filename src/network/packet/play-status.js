const DataPacket = require('./packet');
const Identifiers = require('../identifiers');


class PlayStatusPacket extends DataPacket {
    static NetID = Identifiers.PlayStatusPacket

    status

    encodePayload() {
        this.writeInt(this.status);
    }
}
module.exports = PlayStatusPacket;
