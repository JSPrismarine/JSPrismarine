import Identifiers from '../Identifiers';
import type MovePlayerPacket from '../packet/MovePlayerPacket';
import MovementType from '../type/MovementType';
import PacketHandler from './PacketHandler';
import PlayerMoveEvent from '../../events/player/PlayerMoveEvent';
import { PlayerSession } from '../../';
import type Server from '../../Server';
import Vector3 from '../../math/Vector3';
import Chunk from '../../world/chunk/Chunk';

export default class MovePlayerHandler implements PacketHandler<MovePlayerPacket> {
    public static NetID = Identifiers.MovePlayerPacket;

    public async handle(packet: MovePlayerPacket, server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();
        // Update movement for every player & interpolate position to smooth it
        /* const interpolatedVector = d3.interpolateObject(
            { x: player.getX(), z: player.getZ() },
            { x: packet.positionX, z: packet.positionZ }
        )(0.5); */
        // TODO: interpolation
        const resultantVector = new Vector3(packet.positionX, packet.positionY, packet.positionZ);
        // const immutableFrom = Object.freeze(resultantVector);

        // Emit move event
        const event = new PlayerMoveEvent(player, resultantVector, packet.mode);
        server.getEventManager().post(['playerMove', event]);
        if (event.isCancelled()) {
            // Reset the player position
            await session.broadcastMove(player, MovementType.Reset);
            return;
        }

        // Check if the position has been changed through an event listener
        // if so, reset the player position
        // if (!immutableFrom.equals(resultantVector)) {
        // await session.broadcastMove(player, MovementType.Reset);
        // }

        // Make sure we actually change X or Z coordinates before
        // we try to update the current chunking. This prevents
        // and expensive call to *getWorld().getChunkAt*.
        let updateChunk = false;
        if (Math.trunc(player.getX()) !== Math.trunc(resultantVector.getX())) updateChunk = true;
        if (Math.trunc(player.getZ()) !== Math.trunc(resultantVector.getZ())) updateChunk = true;

        // Position
        await player.setX(resultantVector.getX());
        await player.setY(resultantVector.getY());
        await player.setZ(resultantVector.getZ());

        // Rotation
        player.pitch = packet.pitch;
        player.yaw = packet.yaw;
        player.headYaw = packet.headYaw;

        // Additional fields
        await player.setOnGround(packet.onGround);
        // We still have some fields
        // at the moment we don't need them

        for (const onlinePlayer of server.getSessionManager().getAllPlayers()) {
            if (onlinePlayer === player) continue;
            await onlinePlayer.getNetworkSession().broadcastMove(player, MovementType.Normal);
        }

        // TODO: this seems awfully wasteful?
        if (updateChunk) {
            const chunk = await player.getWorld().getChunkAt(player.getX(), player.getZ());
            player.setCurrentChunk(Chunk.packXZ(chunk.getX(), chunk.getZ()));
        }
    }
}
