import type { Vector3 } from '@jsprismarine/math';
import type { PlayerSession } from '../../';
import type Server from '../../Server';
import PlayerMoveEvent from '../../events/player/PlayerMoveEvent';
import Identifiers from '../Identifiers';
import type MovePlayerPacket from '../packet/MovePlayerPacket';
import MovementType from '../type/MovementType';
import type PacketHandler from './PacketHandler';

/** Where a client says its player is, and which way it is facing. */
export interface ClientMovement {
    position: Vector3;
    pitch: number;
    yaw: number;
    headYaw: number;
    onGround: boolean;
    /** What the client says the move is. Only `MovePlayerPacket` carries one; input is always a normal move. */
    mode?: MovementType;
}

/**
 * Applies a position the client reported, and shows the move to everyone who can see it.
 *
 * One function for the two packets that carry one: `MovePlayerPacket`, which the bot harness
 * still sends, and `PlayerAuthInputPacket`, which every real client sends since 1.21.80. The
 * server does not simulate movement, so the client's word is taken - through the move event,
 * which is the one place a plugin can say no.
 */
export const applyClientMovement = async (
    server: Server,
    session: PlayerSession,
    movement: ClientMovement
): Promise<void> => {
    const player = session.getPlayer();

    const event = new PlayerMoveEvent(player, movement.position, movement.mode ?? MovementType.Normal);
    server.post(['playerMove', event]);
    if (event.isCancelled()) {
        // Since we're cancelling the event, we should reset the player's position.
        await session.sendMove(player, MovementType.Reset);
        return;
    }

    await player.setPosition(
        {
            position: movement.position,
            pitch: movement.pitch,
            yaw: movement.yaw,
            headYaw: movement.headYaw
        },
        false
    );

    await player.setOnGround(movement.onGround);

    // Finally, the move to everyone in the world who can actually see this player.
    await Promise.all(
        player
            .getWorld()
            .getPlayers()
            // By identity rather than by uuid: "except the player itself" is the object, not a
            // value that happens to differ.
            .filter((target) => target !== player)
            // Tracking rather than distance: a client that was never sent a spawn for this
            // player has nothing to move, and discards the packet anyway.
            .filter((target) => target.getNetworkSession().tracks(player.getRuntimeId()))
            .map((target) => target.getNetworkSession().sendMove(player, MovementType.Normal))
    );
};

/**
 * The client authoritative movement packet.
 *
 * A real client has not sent one since 1.21.80; the bot harness still does, because it is
 * the smaller packet and the server does not mind. Both end up in {@link applyClientMovement}.
 */
export default class MovePlayerHandler implements PacketHandler<MovePlayerPacket> {
    public static NetID = Identifiers.MovePlayerPacket;

    public async handle(packet: MovePlayerPacket, server: Server, session: PlayerSession): Promise<void> {
        await applyClientMovement(server, session, {
            position: packet.position,
            pitch: packet.pitch,
            yaw: packet.yaw,
            headYaw: packet.headYaw,
            onGround: packet.onGround,
            mode: packet.mode
        });
    }
}
