const Identifiers = require('../identifiers');
const RequestChunkRadiusPacket = require('../packet/request-chunk-radius');
const PlayStatus = require('../type/play-status');
const Player = require('../../player').default;
const Prismarine = require('../../prismarine');


class RequestChunkRadiusHandler {
    static NetID = Identifiers.RequestChunkRadiusPacket

    /**
     * @param {RequestChunkRadiusPacket} _packet 
     * @param {Prismarine} _server
     * @param {Player} player 
     */
    static handle(_packet, _server, player) {
        const maxViewDistance = _server.getConfig().get('view-distance', 10);
        const viewDistance = (_packet.radius >= maxViewDistance) ? maxViewDistance : _packet.radius;
        player.setViewDistance(viewDistance);

        player.sendNetworkChunkPublisher();

        player.sendPlayStatus(PlayStatus.PlayerSpawn);
    }
}
module.exports = RequestChunkRadiusHandler;
