const Player = require('../../player')
const Identifiers = require('../identifiers')
const ClientCacheStatusPacket = require('../packet/client-cache-status')

'use strict'

class ClientCacheStatusHandler {
    static NetID = Identifiers.ClientCacheStatusPacket

    /**
     * @param {ClientCacheStatusPacket} packet 
     * @param {Player} player 
     */
    static handle(packet, player) {
        player.cacheSupport = packet.enabled
    }
}
module.exports = ClientCacheStatusHandler