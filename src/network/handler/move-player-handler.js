const Identifiers = require('../identifiers');
const MovePlayerPacket = require('../packet/move-player').default;
const Player = require('../../player').default;
const EventManager = require('../../events/EventManager');
const Prismarine = require('../../Prismarine');
const CoordinateUtils = require('../../world/coordinate-utils');


class MovePlayerHandler {
    static NetID = Identifiers.MovePlayerPacket

    /**
     * @param {MovePlayerPacket} packet 
     * @param {Prismarine} _server
     * @param {Player} player 
     */
    static async handle(packet, server, player) {
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

        let chunk = await player.getWorld().getChunkAt(player.x, player.z);
        if (player.currentChunk !== chunk) player.currentChunk = chunk;

        // Emit move event
        server.getEventManager().post(['playerMove', player]);
    }
}
module.exports = MovePlayerHandler;
