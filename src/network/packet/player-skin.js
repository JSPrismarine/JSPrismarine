const DataPacket = require('./packet');
const Identifiers = require('../identifiers');

'use strict';

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