const DataPacket = require('./Packet').default;
const Identifiers = require('../identifiers');


class ClientCacheStatusPacket extends DataPacket {
    static NetID = Identifiers.ClientCacheStatusPacket

    enabled

    decodePayload() {
        this.enabled = this.readBool();
    }
}
module.exports = ClientCacheStatusPacket;
