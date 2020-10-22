const DataPacket = require('./Packet').default;
const Identifiers = require('../identifiers');


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
