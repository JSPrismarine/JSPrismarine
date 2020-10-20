const Player = require('../../player').default;
const Identifiers = require('../identifiers');
const SetLocalPlayerAsInitializedPacket = require('../packet/set-local-player-as-initialized');

class SetLocalPlayerAsInitializedHandler {
    static NetID = Identifiers.SetLocalPlayerAsInitializedPacket

    /**
     * @param {SetLocalPlayerAsInitializedPacket} packet 
     * @param {Prismarine} server
     * @param {Player} player 
     */
    static handle(packet, server, player) {
        // Emit playerSpawn event
        server.getEventManager().post(['playerSpawn', player]);

        for (let onlinePlayer of server.getOnlinePlayers()) {
            if (onlinePlayer === player)
                continue;
            onlinePlayer.sendSpawn(player);
            player.sendSpawn(onlinePlayer);
        }
    }
}
module.exports = SetLocalPlayerAsInitializedHandler;
