const Player = require('../../player/Player').default;
const Prismarine = require('../../Prismarine');
const Identifiers = require('../Identifiers').default;
<<<<<<< HEAD
const EventManager = require('../../events/event-manager');
=======
const EventManager = require('../../events/EventManager');
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e
const AnimatePacket = require('../packet/animate');


class AnimateHandler {
    static NetID = Identifiers.AnimatePacket

    /**
     * @param {AnimatePacket} packet 
     * @param {Prismarine} server
     * @param {Player} player 
     */
    static handle(packet, server, player) {
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
