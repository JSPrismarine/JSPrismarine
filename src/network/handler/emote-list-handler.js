const Player = require('../../player')
const Identifiers = require('../identifiers')
const EmoteListPacket = require('../packet/emote-list')

'use strict'

class EmoteListHandler {
    static NetID = Identifiers.EmoteListPacket

    /**
     * @param {EmoteListPacket} packet 
     * @param {Player} player 
     */
    static handle(packet, player) {}
}
module.exports = EmoteListHandler