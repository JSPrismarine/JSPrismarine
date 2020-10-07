const DataPacket = require('./packet')
const Identifiers = require('../identifiers')

'use strict'

class LevelSoundEventPacket extends DataPacket {
    static NetID = Identifiers.LevelSoundEventPacket

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