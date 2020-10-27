<<<<<<< HEAD
const DataPacket = require('./packet').default;
=======
const DataPacket = require('./Packet').default;
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e
const Identifiers = require('../Identifiers').default;


class ResourcePacksInfoPacket extends DataPacket {
    static NetID = Identifiers.ResourcePacksInfoPacket

    mustAccept = false
    hasScripts = false 

    behaviorPackEntries = []
    resourcePackEntries = []

    encodePayload() {
        this.writeBool(this.mustAccept);
        this.writeBool(this.hasScripts);
        this.writeLShort(this.behaviorPackEntries.length);
        for (let _behaviorEntry of this.behaviorPackEntries) {
            // TODO: we don't need them for now
        }
        this.writeLShort(this.resourcePackEntries.length);
        for (let _resourceEntry of this.resourcePackEntries) {
            // TODO: we don't need them for now
        }
    }
}
module.exports = ResourcePacksInfoPacket;
