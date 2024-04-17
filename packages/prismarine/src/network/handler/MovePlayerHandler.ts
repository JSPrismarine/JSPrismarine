import type { PlayerSession } from '../../';
import type Server from '../../Server';
import PlayerMoveEvent from '../../events/player/PlayerMoveEvent';
import Identifiers from '../Identifiers';
import type MovePlayerPacket from '../packet/MovePlayerPacket';
import MovementType from '../type/MovementType';
import type PacketHandler from './PacketHandler';

export default class MovePlayerHandler implements PacketHandler<MovePlayerPacket> {
    public static NetID = Identifiers.MovePlayerPacket;

    public async handle(packet: MovePlayerPacket, server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();

        // Emit move event.
        const event = new PlayerMoveEvent(player, packet.position, packet.mode);
        server.post(['playerMove', event]);
        if (event.isCancelled()) {
            // Since we're cancelling the event, we should reset the player's position.
            await session.broadcastMove(player, MovementType.Reset);
            return;
        }

        // Update player position.
        await player.setPosition(
            {
                position: packet.position,
                pitch: packet.pitch,
                yaw: packet.yaw,
                headYaw: packet.headYaw
            },
            false
        );

        // Additional fields.
        await player.setOnGround(packet.onGround);

        // Finally, broadcast the move to all players except the player itself in the world.
        await Promise.all(
            player
                .getWorld()
                .getPlayers()
                .filter((target) => target.getUUID() !== player.getUUID())
                .map((target) => target.getNetworkSession().broadcastMove(player, MovementType.Normal))
        );
    }
}
