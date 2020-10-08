const Identifiers = require('../identifiers');
const MovePlayerPacket = require('../packet/move-player');
const Player = require('../../player');
const EventManager = require('../../events/event-manager');
const Prismarine = require('../../prismarine');


class MovePlayerHandler {
    static NetID = Identifiers.MovePlayerPacket

    /**
     * @param {MovePlayerPacket} packet 
     * @param {Prismarine} _server
     * @param {Player} player 
     */
    static handle(packet, _server, player) {
        // Position
        player.x = packet.positionX;
        player.y = packet.positionY;
        player.z = packet.positionZ;

        // Rotation
        player.pitch = packet.pitch;
        player.yaw = packet.yaw; 
        player.headYaw = packet.headYaw;

        // Additional fields
        player.onGround = packet.onGround;
        // We still have some fileds 
        // at the moment we don't need them

        // TODO: proper event
        EventManager.emit('player_move', player);
    }
}
module.exports = MovePlayerHandler;
