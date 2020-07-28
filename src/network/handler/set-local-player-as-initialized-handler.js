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

        // TODO: refactor these, maybe make a function on player called tick()
        setInterval(function() {
            // Broadcast movement to all online players
            for (const [_, onlinePlayer] of player.getServer().players) {
                if (onlinePlayer === player) continue
                onlinePlayer.broadcastMove(player)
                player.broadcastMove(onlinePlayer)
            }
        }.bind(this), 1000 / 20)

        for (const [_, onlinePlayer] of player.getServer().players) {
            if (onlinePlayer === player) continue
            onlinePlayer.sendSpawn(player)
            player.sendSpawn(onlinePlayer)
        }
    }
}
module.exports = SetLocalPlayerAsInitializedHandler