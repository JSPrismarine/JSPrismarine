const DataPacket = require('./Packet').default;
const Identifiers = require('../Identifiers').default;
const MovementType = require('../type/MovementType').default;


class MovePlayerPacket extends DataPacket {
    static NetID = Identifiers.MovePlayerPacket

    runtimeEntityId

    positionX
    positionY
    positionZ

    pitch
    yaw
    headYaw

    mode

    onGround

    ridingEntityRuntimeId

    teleportCause = null
    teleportItemId = null

    decodePayload() {
        this.runtimeEntityId = this.readUnsignedVarLong();

        this.positionX = this.readLFloat();
        this.positionY = this.readLFloat();
        this.positionZ = this.readLFloat();

        this.pitch = this.readLFloat();
        this.yaw = this.readLFloat();
        this.headYaw = this.readLFloat();

        this.mode = this.readByte();
        this.onGround = this.readBool();
        this.ridingEntityRuntimeId = this.readUnsignedVarLong();
        if (this.mode === MovementType.Teleport) {
            this.teleportCause = this.readLInt();
            this.teleportItemId = this.readLInt();
        }
    }

    encodePayload() {
        this.writeUnsignedVarLong(this.runtimeEntityId);

        this.writeLFloat(this.positionX);
        this.writeLFloat(this.positionY);
        this.writeLFloat(this.positionZ);

        this.writeLFloat(this.pitch);
        this.writeLFloat(this.yaw);
        this.writeLFloat(this.headYaw);

        this.writeByte(this.mode);
        this.writeBool(this.onGround);
        this.writeUnsignedVarLong(this.ridingEntityRuntimeId);
        if (this.mode === MovementType.Teleport) {
            this.writeLInt(this.teleportCause);
            this.writeLInt(this.teleportItemId);
        }
    }
}
module.exports = MovePlayerPacket;
