const DataPacket = require('./Packet').default;
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
