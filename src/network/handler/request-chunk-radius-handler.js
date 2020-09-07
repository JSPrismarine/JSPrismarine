const { Worker } = require('worker_threads')

const Identifiers = require('../identifiers')
const RequestChunkRadiusPacket = require('../packet/request-chunk-radius')
const NetworkChunkPublisherUpdatePacket = require('../packet/network-chunk-publisher-update')
const PlayStatus = require('../type/play-status')
const Player = require('../../player')
const Chunk = require('../../level/chunk/chunk')
const SubChunk = require('../../level/chunk/sub-chunk')
const CoordinateUtils = require('../../level/coordinate-utils')

'use strict'

class RequestChunkRadiusHandler {
    static NetID = Identifiers.RequestChunkRadiusPacket

    /**
     * @param {RequestChunkRadiusPacket} packet 
     * @param {Player} player 
     */
    static handle(packet, player) {
        // For performance reasons and as it fixes a lot of problem we will
        // use just 8 (for now)
        player.setViewDistance(/* packet.radius */ 8)  

        setTimeout(() => player.sendNetworkChunkPublisher(), 250)

        player.sendPlayStatus(PlayStatus.PlayerSpawn)
    }
}
module.exports = RequestChunkRadiusHandler