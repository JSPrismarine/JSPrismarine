const DataPacket = require('./DataPacket').default;
const Identifiers = require('../Identifiers').default;

class LevelSoundEventPacket extends DataPacket {
    static NetID = Identifiers.LevelSoundEventPacket;

    sound;

    positionX;
    positionY;
    positionZ;

    extraData;
    entityType;
    isBabyMob;
    disableRelativeVolume;

    decodePayload() {
        this.sound = this.readUnsignedVarInt();

        this.positionX = this.readLFloat();
        this.positionY = this.readLFloat();
        this.positionZ = this.readLFloat();

        this.extraData = this.readVarInt();
        this.entityType = this.readString();
        this.isBabyMob = this.readBool();
        this.disableRelativeVolume = this.readBool();
    }

    encodePayload() {
        this.writeUnsignedVarInt(this.sound);

        this.writeLFloat(this.positionX);
        this.writeLFloat(this.positionY);
        this.writeLFloat(this.positionZ);

        this.writeVarInt(this.extraData);
        this.writeString(this.entityType);
        this.writeBool(this.isBabyMob);
        this.writeBool(this.disableRelativeVolume);
    }
}
module.exports = LevelSoundEventPacket;
