const Player = require('../../player')
const Identifiers = require('../identifiers')
const AdventureSettingsPacket = require('../packet/adventure-settings-packet')

'use strict'

class AdventureSettingsHandler {
    static NetID = Identifiers.AdventureSettingsPacket

    /**
     * @param {AdventureSettingsPacket} packet 
     * @param {Player} player 
     */
    static handle(packet, player) {}
}
module.exports = AdventureSettingsHandler