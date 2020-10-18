const DataPacket = require('./packet').default;
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
