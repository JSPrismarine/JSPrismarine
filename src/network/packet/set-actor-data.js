const DataPacket = require('./DataPacket').default;
const Identifiers = require('../Identifiers').default;

class SetActorDataPacket extends DataPacket {
    static NetID = Identifiers.SetActorDataPacket;

    runtimeEntityId;
    metadata;

    encodePayload() {
        this.writeUnsignedVarLong(this.runtimeEntityId);
        this.writeEntityMetadata(this.metadata);
    }
}
module.exports = SetActorDataPacket;
