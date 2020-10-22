const DataPacket = require('./Packet').default;
const Identifiers = require('../identifiers');


class TickSyncPacket extends DataPacket {
    static NetID = Identifiers.TickSyncPacket

    clientRequestTimestamp
    serverReceptionTimestamp

    decodePayload() {
        this.clientRequestTimestamp = this.readLLong();
        this.serverReceptionTimestamp = this.readLLong();
    }
}
module.exports = TickSyncPacket;
