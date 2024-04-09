import Identifiers from '../Identifiers';
import type Server from '../../Server';
import Chunk from '../../world/chunk/Chunk';
import type PacketHandler from './PacketHandler';
import type { PacketData } from '@jsprismarine/protocol';
import type PlayerSession from '../PlayerSession';
import { PlayerPositionMode } from '@jsprismarine/minecraft';

export default class MovePlayerHandler implements PacketHandler<PacketData.MovePlayer> {
    public static NetID = Identifiers.MovePlayerPacket;

    public async handle(data: PacketData.MovePlayer, server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();
        // Update movement for every player & interpolate position to smooth it
        /* const interpolatedVector = d3.interpolateObject(
            { x: player.getX(), z: player.getZ() },
            { x: packet.positionX, z: packet.positionZ }
        )(0.5); */
        // TODO: interpolation
        // const immutableFrom = Object.freeze(resultantVector);

        // Emit move event
        // const event = new PlayerMoveEvent(player, resultantVector, packet.mode);
        // server.getEventManager().post(['playerMove', event]);
        // if (event.isCancelled()) {
        // Reset the player position
        //    await session.broadcastMove(player, MovementType.Reset);
        //    return;
        // }

        // Check if the position has been changed through an event listener
        // if so, reset the player position
        // if (!immutableFrom.equals(resultantVector)) {
        // await session.broadcastMove(player, MovementType.Reset);
        // }

        // Make sure we actually change X or Z coordinates before
        // we try to update the current chunking. This prevents
        // and expensive call to *getWorld().getChunkAt*.
        let updateChunk = false;
        // if (Math.trunc(player.getX()) !== Math.trunc(data.position.x)) updateChunk = true;
        // if (Math.trunc(player.getZ()) !== Math.trunc(resultantVector.getZ())) updateChunk = true;

        // Position
        // await player.setX(resultantVector.getX());
        // await player.setY(resultantVector.getY());
        // await player.setZ(resultantVector.getZ());

        // Rotation
        // player.pitch = packet.pitch;
        // player.bodyYaw = data.rotation;
        player.headYaw = data.headYaw;

        // Additional fields
        await player.setOnGround(data.onGround);
        // We still have some fields
        // at the moment we don't need them

        for (const onlinePlayer of server.getPlayerManager().getOnlinePlayers()) {
            if (onlinePlayer === player) continue;
            onlinePlayer.getNetworkSession().broadcastMove(player, PlayerPositionMode.NORMAL);
        }

        // TODO: this seems awfully wasteful?
        if (updateChunk) {
            const chunk = await player.getWorld().getChunkAt(player.getX(), player.getZ());
            player.setCurrentChunk(Chunk.packXZ(chunk.getX(), chunk.getZ()));
        }
    }
}
