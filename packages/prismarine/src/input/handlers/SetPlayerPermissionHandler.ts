import { PlayerPermissionLevel } from '@jsprismarine/minecraft';

import type { InputContext } from '../../player/context/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/**
 * An operator's request to change another player's permission level.
 *
 * The docs allow this from operators and hosts only. The server's permission model is the op
 * list, so `Operator` makes the target an op and `Member` or `Visitor` removes them;
 * `PermissionManager.setOpNow` runs `PlayerToggleOperatorEvent`, changes the op list in memory
 * and writes the op file off the tick, and the handler sends the target's new commands and
 * abilities. `Custom` levels and their flag set have no counterpart here, so that request, one
 * from a non-operator, or one for a player who is not online, is answered by resending the
 * abilities the server holds so the requester's client reverts.
 */
export default class SetPlayerPermissionHandler implements IntentHandler<'setPlayerPermission'> {
    public static readonly Kind = 'setPlayerPermission';

    /** Applies the level through the op list, or resends the current abilities when refused. */
    public handle(
        { target: targetId, level, customFlags }: Intent<'setPlayerPermission'>,
        { session, log, services, step }: InputContext
    ): undefined {
        const { name } = session.identity;
        const levelName = PlayerPermissionLevel[level] ?? level;
        const target = services.sessions.sessionOf(targetId);

        if (!services.permissions.isOp(session.identity.subject)) {
            log.debug(
                `${name} asked to set player ${targetId} to permission level ${levelName} without being an operator`
            );
            step.output(session.sendAbilities());
            return;
        }

        if (!target) {
            log.debug(
                `${name} asked to set player ${targetId} to permission level ${levelName}, but no such player is online`
            );
            return;
        }

        switch (level) {
            case PlayerPermissionLevel.OPERATOR:
            case PlayerPermissionLevel.MEMBER:
            case PlayerPermissionLevel.VISITOR: {
                const told = services.permissions.setOpNow(target, level === PlayerPermissionLevel.OPERATOR);
                if (told) step.output(told);
                return;
            }
            default:
                log.debug(
                    `${name} asked to set ${target.identity.name} to permission level ${levelName} (custom flags 0x${customFlags.toString(16)}). Only Member and Operator are modeled, so the current abilities were sent back`
                );
                step.output(session.sendAbilities(target.shown()));
        }
    }
}
