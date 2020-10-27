<<<<<<< HEAD
const DataPacket = require('./packet').default;
=======
const DataPacket = require('./Packet').default;
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e
const Identifiers = require('../Identifiers').default;

class ItemStackResponsePacket extends DataPacket {
    static NetID = Identifiers.ItemStackResponsePacket

    responses = []

    encodePayload() {
        this.writeVarInt(this.responses.length);
        this.responses.forEach(response => {
            this.writeItemStackResponse(response);
        });
    }
}
module.exports = ItemStackResponsePacket;
