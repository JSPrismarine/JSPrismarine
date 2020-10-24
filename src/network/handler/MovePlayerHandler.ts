import PlayerMoveEvent from "../../events/player/PlayerMoveEvent";
import Vector3 from "../../math/Vector3";
import type Player from "../../player";
import type Prismarine from "../../Prismarine";
import Identifiers from "../Identifiers";
import type MovePlayerPacket from "../packet/move-player";
import MovementType from "../type/MovementType";

class MovePlayerHandler {
    static NetID = Identifiers.MovePlayerPacket

    /**
     * @param {MovePlayerPacket} packet 
     * @param {Prismarine} _server
     * @param {Player} player 
     */
    static async handle(packet: MovePlayerPacket, server: Prismarine, player: Player) {
        const to = new Vector3(packet.positionX, packet.positionY, packet.positionZ);

        // Emit move event
        const event = new PlayerMoveEvent(player, to, packet.mode);
        await server.getEventManager().post(['playerMove', event]);
        if (event.cancelled) {
            // Reset the player position
            player.broadcastMove(player, MovementType.Reset);
            return;
        }

        // Check if the position has been changed through an event listener
        // if so, reset the player position
        if (packet.positionX !== to.getX() || packet.positionY !== to.getY() || packet.positionZ !== to.getZ())
            player.broadcastMove(player, MovementType.Reset);

        // Position
        player.setX(to.getX());
        player.setY(to.getY());
        player.setZ(to.getZ());

        // Rotation
        player.pitch = packet.pitch;
        player.yaw = packet.yaw;
        player.headYaw = packet.headYaw;

        // Additional fields
        player.onGround = packet.onGround;
        // We still have some fields 
        // at the moment we don't need them

        let chunk = await player.getWorld().getChunkAt(player.getX(), player.getZ());
        if (player.currentChunk !== chunk)
            player.currentChunk = chunk;
    }
}
module.exports = MovePlayerHandler;
