<<<<<<< HEAD
const DataPacket = require('./packet').default;
=======
const DataPacket = require('./Packet').default;
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e
const Identifiers = require('../Identifiers').default;


class ContainerOpenPacket extends DataPacket {
    static NetID = Identifiers.ContainerOpenPacket

    /** @type {number} */
    windowId
    /** @type {number} */
    containerType

    /** @type {number} */
    containerX
    /** @type {number} */
    containerY
    /** @type {number} */
    containerZ
    
    /** @type {number} */
    containerEntityId

    encodePayload() {
        this.writeByte(this.windowId);
        this.writeByte(this.containerType);

        // Container position
        this.writeVarInt(this.containerX);
        this.writeUnsignedVarInt(this.containerY);
        this.writeVarInt(this.containerZ);

        this.writeVarLong(this.containerEntityId);
    }
}
module.exports = ContainerOpenPacket;
