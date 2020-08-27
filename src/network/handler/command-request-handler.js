const Player = require('../../player')
const Identifiers = require('../identifiers')
const CommandRequestPacket = require('../packet/command-request')

'use strict'

class ClientCacheStatusHandler {
    static NetID = Identifiers.CommandRequestPacket

    /**
     * @param {CommandRequestPacket} packet 
     * @param {Player} player 
     */
    static handle(packet, player) {
        player.getServer().getCommandManager().dispatchCommand(
            player, packet.commandName
        )
    }
}
module.exports = ClientCacheStatusHandler