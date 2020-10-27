<<<<<<< HEAD
const DataPacket = require('./packet').default;
=======
const DataPacket = require('./Packet').default;
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e
const Identifiers = require('../Identifiers').default;


class ClientCacheStatusPacket extends DataPacket {
    static NetID = Identifiers.ClientCacheStatusPacket

    enabled

    decodePayload() {
        this.enabled = this.readBool();
    }
}
module.exports = ClientCacheStatusPacket;
