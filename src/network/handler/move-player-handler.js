const Identifiers = require('../identifiers')
const MovePlayerPacket = require('../packet/move-player')
const Player = require('../../player')
const EventManager = require('../../events/event-manager')
const NetworkChunkPublisherUpdatePacket = require('../packet/network-chunk-publisher-update')

'use strict'

class MovePlayerHandler {
    static NetID = Identifiers.MovePlayerPacket

    /**
     * @param {MovePlayerPacket} packet 
     * @param {Player} player 
     */
    static handle(packet, player) {
        player.x = packet.positionX
        player.y = packet.positionY
        player.z = packet.positionZ
        player.pitch = packet.pitch
        player.yaw = packet.yaw 
        player.headYaw = packet.headYaw
        player.onGround = packet.onGround
        // We still have some fileds 
        // at the moment we don't need them

        // TODO: proper event
        EventManager.emit('player_move', player)

        // let index = CoordinateUtils.chunkId(player.x >> 4, player.z >> 4)
        // if (!(player.chunks.includes(index))) {
        /* setImmediate(function() {
            for (let chunkX = player.x; chunkX < player.x + 16; chunkX++) {
                for (let chunkZ = player.z; chunkZ < player.z + 16; chunkZ++) {
                    let chunk = player.getLevel().getChunkAt(chunkX, chunkZ, true)
                    if (chunk) player.sendChunk(chunk)
                }
            }
        }.bind(player)) */
        // }  
    }
}
module.exports = MovePlayerHandler