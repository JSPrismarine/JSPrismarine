const DataPacket = require('./Packet').default;
const Identifiers = require('../Identifiers').default;

class PlayStatusPacket extends DataPacket {
    static NetID = Identifiers.PlayStatusPacket;

    status;

    encodePayload() {
        this.writeInt(this.status);
    }
}
module.exports = PlayStatusPacket;
