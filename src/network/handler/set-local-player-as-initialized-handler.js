const Player = require('../../player');
const Identifiers = require('../identifiers');
const SetLocalPlayerAsInitializedPacket = require('../packet/set-local-player-as-initialized');
const EventManager = require('../../events/event-manager');
const Prismarine = require('../../prismarine');

'use strict';

class SetLocalPlayerAsInitializedHandler {
    static NetID = Identifiers.SetLocalPlayerAsInitializedPacket

    /**
     * @param {SetLocalPlayerAsInitializedPacket} packet 
     * @param {Prismarine} server
     * @param {Player} player 
     */
    static handle(packet, server, player) {
        // TODO: event
        EventManager.emit('player_join', player);

        for (let onlinePlayer of server.getOnlinePlayers()) {
            if (onlinePlayer === player) continue;
            onlinePlayer.sendSpawn(player);
            player.sendSpawn(onlinePlayer);
        }
    }
}
module.exports = SetLocalPlayerAsInitializedHandler;