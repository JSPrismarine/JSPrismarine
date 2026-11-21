import { Gametype } from '@jsprismarine/minecraft';

import { CREATIVE_REACH, SURVIVAL_REACH } from '../../entity/Combat';
import type { InputContext } from '../../network/handler/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/**
 * The slack added to a player's reach when checking the actor they say they interacted with.
 *
 * Reach is measured from the player's feet to the actor's feet, and a tall actor is clicked
 * well above where it stands. One block covers that. The check bounds nonsense rather than
 * policing reach.
 */
const REACH_SLACK = 1;

/**
 * The player opened an NPC's dialogue.
 *
 * The decoder already checked that the client has been shown the actor. This handler checks the
 * world: the actor has to exist and be within reach. NPC dialogue is not implemented, so an open
 * that passes is logged and nothing else happens.
 */
export default class OpenNpcHandler implements IntentHandler<'openNpc'> {
    public static readonly Kind = 'openNpc';

    /** Checks the actor's distance and records the open as unimplemented. */
    public handle({ target }: Intent<'openNpc'>, { session, log }: InputContext): undefined {
        const actor = session.getWorld().getActor(target);
        if (actor === null) {
            log.debug(`Dropped an NPC open from ${session.identity.name}: actor ${target} is not in their world`);
            return;
        }

        const player = session.getPlayer();
        const reach = (player.gamemode === Gametype.CREATIVE ? CREATIVE_REACH : SURVIVAL_REACH) + REACH_SLACK;
        const distance = player.getPosition().distanceTo(actor.getPosition());
        // Written so a NaN distance fails too.
        if (!(distance <= reach)) {
            log.debug(
                `Dropped an NPC open from ${session.identity.name}: actor ${target} is ${distance.toFixed(1)} away`
            );
            return;
        }

        log.debug(`${session.identity.name} opened NPC ${target}. NPC dialogue is not implemented`);
    }
}
