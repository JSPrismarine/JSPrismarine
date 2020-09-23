const Identifiers = require('../identifiers')
const RequestChunkRadiusPacket = require('../packet/request-chunk-radius')
const PlayStatus = require('../type/play-status')
const Player = require('../../player')
const Prismarine = require('../../prismarine')

'use strict' 

class RequestChunkRadiusHandler {
    static NetID = Identifiers.RequestChunkRadiusPacket

    /**
     * @param {RequestChunkRadiusPacket} _packet 
     * @param {Prismarine} _server
     * @param {Player} player 
     */
    static handle(_packet, _server, player) {
        // For performance reasons and as it fixes a lot of problem we will
        // use just 8 (for now)
        player.setViewDistance(/* packet.radius */ 8)  

        player.sendNetworkChunkPublisher()

        player.sendPlayStatus(PlayStatus.PlayerSpawn)
    }
}
module.exports = RequestChunkRadiusHandler