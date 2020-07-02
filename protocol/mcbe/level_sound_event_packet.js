const DataPacket = require("./data_packet")

class LevelSoundEventPacket extends DataPacket {
    static NetID = 0x7b 

    sound
    
    positionX
    positionY
    positionZ

    extraData
    entityType
    isBabyMob
    disableRelativeVolume

    decodePayload() {
        this.sound = this.readUnsignedVarInt()

        this.positionX = this.readLFloat()
        this.positionY = this.readLFloat()
        this.positionZ = this.readLFloat()

        this.extraData = this.readVarInt()
        this.entityType = this.readString()
        this.isBabyMob = this.readBool()
        this.disableRelativeVolume = this.readBool()
    }
}
module.exports = LevelSoundEventPacket