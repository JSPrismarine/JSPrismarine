<<<<<<< HEAD
const DataPacket = require('./packet').default;
=======
const DataPacket = require('./Packet').default;
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e
const Identifiers = require('../Identifiers').default;
const Logger = require('../../utils/Logger');

class ItemStackRequestPacket extends DataPacket {
    static NetID = Identifiers.ItemStackRequestPacket

    requests = []

    decodePayload(server) {
        let count = this.readUnsignedVarInt();
        server.getLogger().getLogger().debug(`Requests count: ${count}`);
        for (let i = 0; i < count; i++) {
            this.requests.push(this.readItemStackRequest());
        }
    }
}
module.exports = ItemStackRequestPacket;
