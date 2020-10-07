const DataPacket = require('./packet');
const Identifiers = require('../identifiers');

'use strict';

class AddPlayerPacket extends DataPacket {
    static NetID = Identifiers.AddPlayerPacket

    uuid
    name
    uniqueEntityId
    runtimeEntityId
    platformChatId = ''  // TODO

    positionX
    positionY
    positionZ

    motionX
    motionY
    motionZ

    pitch
    yaw
    headYaw
    
    deviceId
    buildPlatform = 0  // TODO

    metadata = new Map()

    encodePayload() {
        this.writeUUID(this.uuid);
        this.writeString(this.name);
        this.writeVarLong(this.uniqueEntityId || this.runtimeEntityId);
        this.writeUnsignedVarLong(this.runtimeEntityId);
        this.writeString(this.platformChatId);
        
        this.writeLFloat(this.positionX);
        this.writeLFloat(this.positionY);
        this.writeLFloat(this.positionZ);

        this.writeLFloat(this.motionX);
        this.writeLFloat(this.motionY);
        this.writeLFloat(this.motionZ);

        this.writeLFloat(this.pitch);
        this.writeLFloat(this.yaw);
        this.writeLFloat(this.headYaw);

        this.writeVarInt(0);  // TODO: Item id
        this.writeEntityMetadata(this.metadata);

        for (let i = 0; i < 5; i++) {
            this.writeUnsignedVarInt(0);  // TODO: Adventure settings
        }

        this.writeLLong(BigInt(0));  // Unknown 

        this.writeUnsignedVarInt(0);  // TODO: Entity links
        this.writeString(this.deviceId);
        this.writeLInt(this.buildPlatform);
    }
}
module.exports = AddPlayerPacket;