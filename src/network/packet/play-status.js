<<<<<<< HEAD
const DataPacket = require('./packet').default;
=======
const DataPacket = require('./Packet').default;
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e
const Identifiers = require('../Identifiers').default;


class PlayStatusPacket extends DataPacket {
    static NetID = Identifiers.PlayStatusPacket

    status

    encodePayload() {
        this.writeInt(this.status);
    }
}
module.exports = PlayStatusPacket;
