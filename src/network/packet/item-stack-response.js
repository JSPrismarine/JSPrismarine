const DataPacket = require('./packet');
const Identifiers = require('../identifiers');

class ItemStackResponsePacket extends DataPacket {
    static NetID = Identifiers.ItemStackResponsePacket

    responses = []

    encode() {
        this.writeVarInt(this.responses.length);
        this.responses.forEach(response => {
            this.writeItemStackResponse(response);
        });
    }
}
module.exports = ItemStackResponsePacket;
