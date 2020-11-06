const DataPacket = require('./Packet').default;
const Identifiers = require('../Identifiers').default;

class ResourcePackResponsePacket extends DataPacket {
    static NetID = Identifiers.ResourcePackResponsePacket;

    status;
    packIds = [];

    decodePayload() {
        this.status = this.readByte();
        let entryCount = this.readLShort();
        while (entryCount-- > 0) {
            this.packIds.push(this.readString());
        }
    }
}
module.exports = ResourcePackResponsePacket;
