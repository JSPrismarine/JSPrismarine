const DataPacket = require('./packet');
const Identifiers = require('../identifiers');
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
