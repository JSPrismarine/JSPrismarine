const Player = require('../../player/Player').default;
const Prismarine = require('../../Prismarine');
const Identifiers = require('../identifiers');
const ClientCacheStatusPacket = require('../packet/client-cache-status');


class ClientCacheStatusHandler {
    static NetID = Identifiers.ClientCacheStatusPacket

    /**
     * @param {ClientCacheStatusPacket} packet 
     * @param {Prismarine} server
     * @param {Player} player 
     */
    static handle(packet, server, player) {
        player.cacheSupport = packet.enabled;
    }
}
module.exports = ClientCacheStatusHandler;
