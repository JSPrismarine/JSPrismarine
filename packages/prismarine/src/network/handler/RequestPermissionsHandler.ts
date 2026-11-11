import { PlayerPermissionLevel } from '@jsprismarine/minecraft';
import type RequestPermissionsPacket from '@jsprismarine/protocol/packet/RequestPermissionsPacket';
import type { InputContext } from './HandlerContext';
import type { InputLaneHandler } from './SessionHandler';

/**
 * An operator's request to change another player's permission level.
 *
 * The docs allow this packet from operators and hosts only. The server's permission model is
 * the op list, so `Operator` makes the target an op and `Member` or `Visitor` removes them;
 * `PermissionManager.setOpNow` runs `PlayerToggleOperatorEvent`, changes the op list in memory
 * and writes the op file off the tick, and the handler sends the target's new commands and
 * abilities. `Custom` levels and their flag set have no counterpart here, so that request,
 * one from a non-operator, or one for a player who is not online, is answered by resending
 * the abilities the server holds so the requester's client reverts.
 */
export default class RequestPermissionsHandler implements InputLaneHandler<RequestPermissionsPacket> {
    public static PacketName = 'RequestPermissionsPacket';
    public readonly phases = ['play'] as const;
    public readonly lane = 'input';

    /** Applies the level through the op list, or resends the current abilities when refused. */
    public handle(packet: RequestPermissionsPacket, { session, log, services, step }: InputContext): undefined {
        const { name } = session.identity;
        const level = PlayerPermissionLevel[packet.playerPermissionLevel] ?? packet.playerPermissionLevel;
        const target = services.sessions.sessionOf(packet.targetPlayerUniqueId);

        if (!services.permissions.isOp(session.identity.uuid)) {
            log.debug(
                `${name} asked to set player ${packet.targetPlayerUniqueId} to permission level ${level} without being an operator`,
                'RequestPermissionsHandler/handle'
            );
            step.output(session.sendAbilities());
            return;
        }

        if (!target) {
            log.debug(
                `${name} asked to set player ${packet.targetPlayerUniqueId} to permission level ${level}, but no such player is online`,
                'RequestPermissionsHandler/handle'
            );
            return;
        }

        switch (packet.playerPermissionLevel) {
            case PlayerPermissionLevel.OPERATOR:
            case PlayerPermissionLevel.MEMBER:
            case PlayerPermissionLevel.VISITOR: {
                const told = services.permissions.setOpNow(
                    target,
                    packet.playerPermissionLevel === PlayerPermissionLevel.OPERATOR
                );
                if (told) step.output(told);
                return;
            }
            default:
                log.debug(
                    `${name} asked to set ${target.identity.name} to permission level ${level} (custom flags 0x${packet.customPermissionFlags.toString(16)}). Only Member and Operator are modeled, so the current abilities were sent back`,
                    'RequestPermissionsHandler/handle'
                );
                step.output(session.sendAbilities(target.shown()));
        }
    }
}
