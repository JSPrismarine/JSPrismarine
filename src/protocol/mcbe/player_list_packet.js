const DataPacket = require("./data_packet");
const Identifiers = require("../identifiers");
const UUID = require("../../utils/uuid");

'use strict'

class PlayerListEntry {

    /** @type {UUID} */
    uuid
    /** @type {number} */
    uniqueEntityId
    /** @type {string} */
    name
    /** @type {string} */
    xuid
    /** @type {string} */
    platformChatId
    /** @type {number} */
    buildPlatform
    /** @type {Skin} */
    skin
    /** @type {boolean} */
    teacher
    /** @type {boolean} */ 
    host

}
const PlayerListAction = {
    Add: 0,
    Remove: 1
}
class PlayerListPacket extends DataPacket {
    static NetID = Identifiers.PlayerListPacket

    /** @type {PlayerListEntry[]} */
    entries = []
    /** @type {number} */
    type

    encodePayload() {
        this.writeByte(this.type)
        this.writeUnsignedVarInt(this.entries.length)
        for (let entry of this.entries) {
            if (this.type === PlayerListAction.Add) {
                this.writePlayerAddEntry(entry)
            } else if (this.type === PlayerListPacket.Remove) {
                
            } else {

            }
        }
    }
}
module.exports =  { PlayerListPacket, PlayerListAction, PlayerListEntry }