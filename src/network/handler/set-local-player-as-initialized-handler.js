const Player = require('../../player')
const Identifiers = require('../identifiers')
const SetLocalPlayerAsInitializedPacket = require('../packet/set-local-player-as-initialized')
const EventManager = require('../../events/event-manager')

'use strict'

class SetLocalPlayerAsInitializedHandler {
    static NetID = Identifiers.SetLocalPlayerAsInitializedPacket

    /**
     * @param {SetLocalPlayerAsInitializedPacket} packet 
     * @param {Player} player 
     */
    static handle(packet, player) {
        // TODO: event
        EventManager.emit('player_join', player)

        for (const [_, onlinePlayer] of player.getServer().players) {
            if (onlinePlayer === player) continue
            onlinePlayer.sendSpawn(player)
            player.sendSpawn(onlinePlayer)
        }
    }
}
module.exports = SetLocalPlayerAsInitializedHandler