<<<<<<< HEAD
const DataPacket = require('./packet').default;
=======
const DataPacket = require('./Packet').default;
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e
const Identifiers = require('../Identifiers').default;


class ResourcePackStackPacket extends DataPacket {
    static NetID = Identifiers.ResourcePackStackPacket

    mustAccept = false

    behaviorPackStack = []
    resourcePackStack = []

    encodePayload() {
        this.writeBool(this.mustAccept);

        this.writeUnsignedVarInt(this.behaviorPackStack.length);
        for (let _behaviorPackStack of this.behaviorPackStack) {
            this.writeString('');
            this.writeString('');
            this.writeString('');
        }

        this.writeUnsignedVarInt(this.resourcePackStack.length);
        for (let _resourcePackStack of this.resourcePackStack) {
            this.writeString('');
            this.writeString('');
            this.writeString('');
        }

        this.writeBool(false);  // experimental
        this.writeString(Identifiers.MinecraftVersion);
    }
}
module.exports = ResourcePackStackPacket;
