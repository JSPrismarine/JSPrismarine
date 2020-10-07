const Player = require('../../player');
const Prismarine = require('../../prismarine');
const Identifiers = require('../identifiers');
const EventManager = require('../../events/event-manager');
const AnimatePacket = require('../packet/animate');

'use strict';

class AnimateHandler {
    static NetID = Identifiers.AnimatePacket

    /**
     * @param {AnimatePacket} packet 
     * @param {Prismarine} server
     * @param {Player} player 
     */
    static handle(packet, server, player) {
        // TODO: event
        EventManager.emit('player_animate', this);

        let pk = new AnimatePacket();
        pk.runtimeEntityId = player.runtimeId;
        pk.action = packet.action;
        
        for (let onlinePlayer of server.getOnlinePlayers()) {
            if (onlinePlayer === player) continue;
            onlinePlayer.sendDataPacket(pk);
        }
    }
}
module.exports = AnimateHandler;