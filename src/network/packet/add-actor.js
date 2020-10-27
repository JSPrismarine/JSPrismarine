<<<<<<< HEAD
const DataPacket = require('./packet').default;
=======
const DataPacket = require('./Packet').default;
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e
const Identifiers = require('../Identifiers').default;


class AddActorPacket extends DataPacket {
    static NetID = Identifiers.AddActorPacket

    /** @type {number} */
    uniqueEntityId 
    /** @type {number} */
    runtimeEntityId
    /** @type {string} */
    type
    /** @type {number} */ 
    x
    /** @type {number} */ 
    y
    /** @type {number} */ 
    z
    /** @type {number} */ 
    motionX
    /** @type {number} */ 
    motionY
    /** @type {number} */ 
    motionZ
    /** @type {number} */ 
    pitch = 0.0
    /** @type {number} */ 
    yaw = 0.0
    /** @type {number} */ 
    headYaw = 0.0

    attributes = []
    metadata = []
    links = []

    encodePayload() {
        this.writeVarLong(this.uniqueEntityId || this.runtimeEntityId);
        this.writeUnsignedVarLong(this.runtimeEntityId);

        this.writeString(this.type);

        this.writeLFloat(this.x);
        this.writeLFloat(this.y);
        this.writeLFloat(this.z);

        this.writeLFloat(this.motionX);
        this.writeLFloat(this.motionY);
        this.writeLFloat(this.motionZ);

        this.writeLFloat(this.pitch);
        this.writeLFloat(this.yaw);
        this.writeLFloat(this.headYaw);

        // TODO: attributes
        this.writeUnsignedVarInt(0);

        // TODO: metadata
        this.writeUnsignedVarInt(0);

        // TODO: links
        this.writeUnsignedVarInt(0);
    }
}
module.exports = AddActorPacket;
