const Player = require('../../player')
const Identifiers = require('../identifiers')
const SetTitlePacket = require('../packet/set-title-packet')

'use strict'

class SetTitleHandler {
    static NetID = Identifiers.SetTitlePacket

    /**
     * @param {SetTitlePacket} packet 
     * @param {Player} player 
     */
    static handle(packet, player) {
        
    }
}
module.exports = SetTitleHandler

