import type MovePlayerPacket from '../packet/MovePlayerPacket';
import MovementType from '../type/MovementType';
import PacketHandler from './PacketHandler';
import type Player from '../../player/Player';
import PlayerMoveEvent from '../../events/player/PlayerMoveEvent';
import type Server from '../../Server';
import Vector3 from '../../math/Vector3';

const d3 = require('d3-interpolate');

export default class MovePlayerHandler
    implements PacketHandler<MovePlayerPacket> {
    public async handle(
        packet: MovePlayerPacket,
        server: Server,
        player: Player
    ): Promise<void> {
        // Update movement for every player & interpolate position to smooth it
        const interpolatedVector = d3.interpolateObject(
            { x: player.getX(), z: player.getZ() },
            { x: packet.positionX, z: packet.positionZ }
        )(0.5);
        const resultantVector = new Vector3(
            interpolatedVector.x,
            packet.positionY,
            interpolatedVector.z
        );
        const immutableFrom = Object.freeze(resultantVector);

        // Emit move event
        const event = new PlayerMoveEvent(player, resultantVector, packet.mode);
        server.getEventManager().post(['playerMove', event]);
        if (event.cancelled) {
            // Reset the player position
            await player
                .getConnection()
                .broadcastMove(player, MovementType.Reset);
            return;
        }

        // Check if the position has been changed through an event listener
        // if so, reset the player position
        // TODO: vector.equals(vec)
        if (
            immutableFrom.getX() !== resultantVector.getX() ||
            immutableFrom.getY() !== resultantVector.getY() ||
            immutableFrom.getZ() !== resultantVector.getZ()
        ) {
            await player
                .getConnection()
                .broadcastMove(player, MovementType.Reset);
        }

        // Position
        player.setX(resultantVector.getX());
        player.setY(resultantVector.getY());
        player.setZ(resultantVector.getZ());

        // Rotation
        player.pitch = packet.pitch;
        player.yaw = packet.yaw;
        player.headYaw = packet.headYaw;

        // Additional fields
        player.onGround = packet.onGround;
        // We still have some fields
        // at the moment we don't need them

        for (const onlinePlayer of server.getOnlinePlayers()) {
            if (onlinePlayer === player) continue;
            await onlinePlayer
                .getConnection()
                .broadcastMove(player, MovementType.Normal);
        }

        // TODO: hash
        (async () => {
            const chunk = await player
                .getWorld()
                .getChunkAt(player.getX(), player.getZ());
            if (player.currentChunk !== chunk) player.currentChunk = chunk;
        })();
    }
}
