<<<<<<< HEAD
const DataPacket = require('./packet').default;
=======
const DataPacket = require('./Packet').default;
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e
const Identifiers = require('../Identifiers').default;


class PlayerSkinPacket extends DataPacket {
    static NetID = Identifiers.PlayerSkinPacket

    uuid
    newSkinName
    oldSkinName
    skin
    trusted

    decodePayload() {
        this.uuid = this.readUUID();
        this.skin = this.readSkin();
        this.newSkinName = this.readString();
        this.oldSkinName = this.readString();
        this.trusted = this.readBool();
    }
}
module.exports = PlayerSkinPacket;
