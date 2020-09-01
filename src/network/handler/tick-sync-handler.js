const Identifiers = require('../identifiers')
const TickSyncPacket = require('../packet/tick-sync')
const Player = require('../../player')

'use strict'

class TickSyncHandler {
    static NetID = Identifiers.TickSyncPacket

    /**
     * @param {TickSyncPacket} packet 
     * @param {Player} player 
     */
    static handle(packet, player) {}
}
module.exports = TickSyncHandler