<<<<<<< HEAD
const DataPacket = require('./packet').default;
=======
const DataPacket = require('./Packet').default;
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e
const Identifiers = require('../Identifiers').default;


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
