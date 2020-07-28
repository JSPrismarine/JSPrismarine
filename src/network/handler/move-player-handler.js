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

        // Show chunks to the player
        // TODO: check this
        let pk = new NetworkChunkPublisherUpdatePacket()
        pk.x = player.x
        pk.y = player.y
        pk.z = player.z
        pk.radius = player.viewDistance * 16 
        player.sendDataPacket(pk)
    }
}
module.exports = MovePlayerHandler