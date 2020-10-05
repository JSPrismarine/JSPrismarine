const Player = require('../../player')
const Prismarine = require('../../prismarine')
const Identifiers = require('../identifiers')
const CreativeContentPacket = require('../packet/creative-content-packet')

'use strict'

class CreativeContentHandler {
    static NetID = Identifiers.CreativeContentPacket

    /**
     * @param {CreativeContentPacket} packet 
     * @param {Prismarine} server
     * @param {Player} player 
     */
    static handle(packet, server, player) {
        let pk = new CreativeContentPacket()
        pk.entries = []
        player.sendDataPacket(pk)

        // TODO: event
    }
}
module.exports = CreativeContentHandler
