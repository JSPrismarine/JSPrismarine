const DataPacket = require('./Packet').default;
const Identifiers = require('../Identifiers').default;


class PlayerActionPacket extends DataPacket {
    static NetID = Identifiers.PlayerActionPacket

    runtimeEntityId
    action

    x
    y
    z

    face

    decodePayload() {
        this.runtimeEntityId = this.readUnsignedVarLong();
        this.action = this.readVarInt();

        this.x = this.readVarInt();
        this.y = this.readUnsignedVarInt();
        this.z = this.readVarInt();

        this.face = this.readVarInt();
    }
}
module.exports = PlayerActionPacket;
