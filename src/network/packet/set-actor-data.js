const DataPacket = require('./packet');
const Identifiers = require('../identifiers');


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
