<<<<<<< HEAD
const DataPacket = require('./packet').default;
=======
const DataPacket = require('./Packet').default;
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e
const Identifiers = require('../Identifiers').default;


class SetActorDataPacket extends DataPacket {
    static NetID = Identifiers.SetActorDataPacket

    runtimeEntityId
    metadata

    encodePayload() {
        this.writeUnsignedVarLong(this.runtimeEntityId);
        this.writeEntityMetadata(this.metadata);
    }
}
module.exports = SetActorDataPacket;
