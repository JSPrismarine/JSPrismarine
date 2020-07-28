const { Worker } = require('worker_threads')

const Identifiers = require('../identifiers')
const RequestChunkRadiusPacket = require('../packet/request-chunk-radius')
const NetworkChunkPublisherUpdatePacket = require('../packet/network-chunk-publisher-update')
const PlayStatus = require('../type/play-status')
const Player = require('../../player')

'use strict'

class RequestChunkRadiusHandler {
    static NetID = Identifiers.RequestChunkRadiusPacket

    /**
     * @param {RequestChunkRadiusPacket} packet 
     * @param {Player} player 
     */
    static handle(packet, player) {
        player.sendViewDistance(packet.radius)

        // Show chunks to the player
        // TODO: send JUST when new chunks are sent
        let pk = new NetworkChunkPublisherUpdatePacket()
        pk.x = player.x
        pk.y = player.y
        pk.z = player.z
        pk.radius = player.viewDistance * 16 
        player.sendDataPacket(pk)

        let worker = new Worker(__dirname + '../../../level/flat-generator-test.js')
        worker.postMessage(player.viewDistance)
        
        worker.on('message', function(chunk) {
            // We lose Chunk class while doing that
            // A Object.assign won't work for some reasons
            player.sendCustomChunk(
                chunk.chunkX,
                chunk.chunkZ,
                chunk.subCount,
                chunk.data
            )
        })

        player.sendPlayStatus(PlayStatus.PlayerSpawn)
    }
}
module.exports = RequestChunkRadiusHandler