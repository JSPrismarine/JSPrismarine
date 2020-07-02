const DataPacket = require('./data_packet')
const Identifiers = require('../identifiers')

'use strict'

const MovementMode = {
    Normal: 0,
    Reset: 1,
    Teleport: 2,
    Pitch: 3
}
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

    teleportCause
    teleportItemId

    decodePayload() {
        this.runtimeEntityId = this.readUnsignedVarLong()

        this.positionX = this.readLFloat()
        this.positionY = this.readLFloat()
        this.positionZ = this.readLFloat()

        this.pitch = this.readLFloat()
        this.yaw = this.readLFloat()
        this.headYaw = this.readLFloat()

        this.mode = this.readByte()
        this.onGround = this.readBool()
        this.ridingEntityId = this.readUnsignedVarLong()
        if (this.mode === MovementMode.Teleport) {
            this.teleportCause = this.readLInt()
            this.teleportItemId = this.readLInt()
        }
    }

}
module.exports = { MovePlayerPacket, MovementMode }