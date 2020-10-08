const DataPacket = require('./packet');
const Identifiers = require('../identifiers');

class ItemStackRequestPacket extends DataPacket {
    static NetID = Identifiers.ItemStackRequestPacket

    requests = []

    decodePayload() {
        for (let i = 0; i < this.readUnsignedVarInt(); i++) {
            this.requests.push(this.readItemStackRequest());
        }

        this.requests = this.requests.filter(a => a.actions.length);
    }
}
module.exports = ItemStackRequestPacket;
