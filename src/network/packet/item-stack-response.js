const DataPacket = require('./Packet').default;
const Identifiers = require('../Identifiers').default;

class ItemStackResponsePacket extends DataPacket {
    static NetID = Identifiers.ItemStackResponsePacket;

    responses = [];

    encodePayload() {
        this.writeVarInt(this.responses.length);
        this.responses.forEach((response) => {
            this.writeItemStackResponse(response);
        });
    }
}
module.exports = ItemStackResponsePacket;
