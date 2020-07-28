const logger = require('../../utils/logger')

const DataPacket = require('./packet')
const Identifiers = require('../identifiers')
const PlayerListEntry = require('../type/player-list-entry')
const PlayerListAction = require('../type/player-list-action')

'use strict'

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
            } else if (this.type === PlayerListAction.Remove) {
                this.writePlayerRemoveEntry(entry)
            } else {
                logger.warn(`Invalid player list action type ${this.type}`)
            }
        }

        if (this.type === PlayerListAction.Add) {
            for (let entry of this.entries) {
                this.writeBool(entry.skin.trusted)
            }
        }
    }
}
module.exports =  PlayerListPacket