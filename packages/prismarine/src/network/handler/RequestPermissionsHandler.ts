import { PlayerPermissionLevel } from '@jsprismarine/minecraft';
import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import type RequestPermissionsPacket from '../packet/RequestPermissionsPacket';
import type PacketHandler from './PacketHandler';

/**
 * An operator's request to change another player's permission level.
 *
 * The docs allow this packet from operators and hosts only. The server's permission model is
 * the op list, so `Operator` makes the target an op and `Member` or `Visitor` removes them;
 * `PermissionManager.setOp` runs `PlayerToggleOperatorEvent` and broadcasts the target's new
 * abilities. `Custom` levels and their flag set have no counterpart here, so that request,
 * one from a non-operator, or one for a player who is not online, is answered by resending
 * the abilities the server holds so the requester's client reverts.
 */
export default class RequestPermissionsHandler implements PacketHandler<RequestPermissionsPacket> {
    public static PacketName = 'RequestPermissionsPacket';

    /** Applies the level through the op list, or resends the current abilities when refused. */
    public async handle(packet: RequestPermissionsPacket, server: Server, session: PlayerSession): Promise<void> {
        const requester = session.getPlayer();
        const level = PlayerPermissionLevel[packet.playerPermissionLevel] ?? packet.playerPermissionLevel;
        const target = server
            .getSessionManager()
            .getAllPlayers()
            .find((player) => player.getRuntimeId() === packet.targetPlayerUniqueId);

        if (!requester.isOp()) {
            server
                .getLogger()
                .debug(
                    `${requester.getName()} asked to set player ${packet.targetPlayerUniqueId} to permission level ${level} without being an operator`,
                    'RequestPermissionsHandler/handle'
                );
            await session.sendAbilities();
            return;
        }

        if (!target) {
            server
                .getLogger()
                .debug(
                    `${requester.getName()} asked to set player ${packet.targetPlayerUniqueId} to permission level ${level}, but no such player is online`,
                    'RequestPermissionsHandler/handle'
                );
            return;
        }

        switch (packet.playerPermissionLevel) {
            case PlayerPermissionLevel.OPERATOR:
                await server.getPermissionManager().setOp(target.getName(), true);
                return;
            case PlayerPermissionLevel.MEMBER:
            case PlayerPermissionLevel.VISITOR:
                await server.getPermissionManager().setOp(target.getName(), false);
                return;
            default:
                server
                    .getLogger()
                    .debug(
                        `${requester.getName()} asked to set ${target.getName()} to permission level ${level} (custom flags 0x${packet.customPermissionFlags.toString(16)}). Only Member and Operator are modeled, so the current abilities were sent back`,
                        'RequestPermissionsHandler/handle'
                    );
                await session.sendAbilities(target);
        }
    }
}
