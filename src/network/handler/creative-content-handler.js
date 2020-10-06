const Player = require('../../player')
const Prismarine = require('../../prismarine')
const Identifiers = require('../identifiers')
const CreativeContentPacket = require('../packet/creative-content-packet')
const CreativeContentEntry = require('../type/creative-content-entry')
const CreativeItems = require('@jsprismarine/bedrock-data').creativeitems
const logger = require('../../utils/logger')

'use strict'

class CreativeContentHandler {
    static NetID = Identifiers.CreativeContentPacket

    /**
     * @param {CreativeContentPacket} packet 
     * @param {Prismarine} server
     * @param {Player} player 
     */
    static handle(packet, server, player) {
        logger.debug('STUB: §bCreativeContentHandler')

        let pk = new CreativeContentPacket()
        for (let i = 0; i < CreativeItems.length; i++) {
            const entry = new CreativeContentEntry()
            entry.entryId = i
            entry.item = CreativeItems[i]

            pk.entries.push(entry)
        }

        player.sendDataPacket(pk)
    }
}
module.exports = CreativeContentHandler
