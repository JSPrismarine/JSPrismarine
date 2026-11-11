import { Gametype } from '@jsprismarine/minecraft';

import { CREATIVE_REACH, SURVIVAL_REACH } from '../../entity/Combat';
import type InteractPacket from '@jsprismarine/protocol/packet/InteractPacket';
import { InteractAction } from '@jsprismarine/protocol/packet/InteractPacket';
import type { InputContext } from './HandlerContext';
import type { InputLaneHandler } from './SessionHandler';

/**
 * The slack added to a player's reach when checking the actor they say they interacted with.
 *
 * Reach is measured from the player's feet to the actor's feet, and a tall actor is clicked
 * well above where it stands. One block covers that. The check bounds nonsense rather than
 * policing reach.
 */
const REACH_SLACK = 1;

/**
 * What a client did to an actor, or that it pressed the inventory button.
 *
 * Only `OpenInventory` does anything yet. The target it names has to be the sender's own
 * runtime id, which is what a client sends and what PocketMine checks; a packet naming anyone
 * else is dropped. `NpcOpen` is checked the way an attack is, by whether the client has been
 * shown the actor and whether it is within reach, and then recorded as unimplemented.
 * `InteractUpdate` arrives every time the crosshair crosses an actor, and
 * `StopRiding` has no vehicles to leave, so both are ignored. Nothing here
 * throws: a value no client sends is logged and dropped.
 */
export default class InteractHandler implements InputLaneHandler<InteractPacket> {
    public static PacketName = 'InteractPacket';
    public readonly takes = 'context';
    public readonly phases = ['play'] as const;
    // Input, not read: opening the inventory adds to the window table input handlers check.
    public readonly lane = 'input';

    public handle(packet: InteractPacket, { session, log, step }: InputContext): undefined {
        switch (packet.action) {
            case InteractAction.StopRiding:
            case InteractAction.InteractUpdate:
                return;

            case InteractAction.OpenInventory: {
                if (packet.target !== session.runtimeId) {
                    log.debug(
                        `Dropped an inventory open from ${session.identity.name}: it names actor ${packet.target}, not themselves`,
                        'InteractHandler/handle'
                    );
                    return;
                }

                // The window is on the session's table once this returns; what follows are sends.
                step.output(session.openMainInventory());
                return;
            }

            case InteractAction.NpcOpen: {
                const target = session.getWorld().getActor(packet.target);
                if (target === null || !session.tracks(packet.target)) {
                    log.debug(
                        `Dropped an NPC open from ${session.identity.name}: actor ${packet.target} is not one they have been shown`,
                        'InteractHandler/handle'
                    );
                    return;
                }

                const player = session.getPlayer();
                const reach = (player.gamemode === Gametype.CREATIVE ? CREATIVE_REACH : SURVIVAL_REACH) + REACH_SLACK;
                const distance = player.getPosition().distanceTo(target.getPosition());
                // Written so a NaN distance fails too.
                if (!(distance <= reach)) {
                    log.debug(
                        `Dropped an NPC open from ${session.identity.name}: actor ${packet.target} is ${distance.toFixed(1)} away`,
                        'InteractHandler/handle'
                    );
                    return;
                }

                log.debug(
                    `${session.identity.name} opened NPC ${packet.target}. NPC dialogue is not implemented`,
                    'InteractHandler/handle'
                );
                return;
            }

            default:
                log.verbose(
                    `Dropped interact action ${packet.action} from ${session.identity.name}: not one a client sends`,
                    'InteractHandler/handle'
                );
        }
    }
}
