const DataPacket = require('./packet');
const Identifiers = require('../Identifiers').default;


class ClientCacheStatusPacket extends DataPacket {
    static NetID = Identifiers.ClientCacheStatusPacket

    enabled

    decodePayload() {
        this.enabled = this.readBool();
    }
}
module.exports = ClientCacheStatusPacket;
