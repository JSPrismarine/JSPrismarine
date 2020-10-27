<<<<<<< HEAD
const Player = require('../../player/Player').default;
=======
const Player = require('../../player').default;
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e
const Identifiers = require('../Identifiers').default;
const SetLocalPlayerAsInitializedPacket = require('../packet/set-local-player-as-initialized');

class SetLocalPlayerAsInitializedHandler {
    static NetID = Identifiers.SetLocalPlayerAsInitializedPacket

    /**
     * @param {SetLocalPlayerAsInitializedPacket} packet 
     * @param {Prismarine} server
     * @param {Player} player 
     */
    static async handle(packet, server, player) {
        for (let onlinePlayer of server.getOnlinePlayers()) {
            if (onlinePlayer === player)
                continue;
            onlinePlayer.sendSpawn(player);
            player.sendSpawn(onlinePlayer);
        }
    }
}
module.exports = SetLocalPlayerAsInitializedHandler;
