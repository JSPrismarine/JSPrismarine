<<<<<<< HEAD
const DataPacket = require('./packet').default;
=======
const DataPacket = require('./Packet').default;
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e
const Identifiers = require('../Identifiers').default;


class ResourcePackResponsePacket extends DataPacket {
    static NetID = Identifiers.ResourcePackResponsePacket

    status
    packIds = []

    decodePayload() {
        this.status = this.readByte();
        let entryCount = this.readLShort();
        while (entryCount-- > 0) {
            this.packIds.push(this.readString());
        }
    }
}
module.exports = ResourcePackResponsePacket;
