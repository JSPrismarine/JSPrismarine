<<<<<<< HEAD
const DataPacket = require('./packet').default;
=======
const DataPacket = require('./Packet').default;
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e
const Identifiers = require('../Identifiers').default;


class ContainerClosePacket extends DataPacket {
    static NetID = Identifiers.ContainerClosePacket

    /** @type {number} */
    windowId

    encodePayload() {
        this.writeByte(this.windowId);
    }

    decodePayload() {
        this.windowId = this.readByte();
    }
}
module.exports = ContainerClosePacket;
