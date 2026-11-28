import type { InputContext } from '../../player/context/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';
import { actorReachRefusal } from './entityReach';

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

        const refusal = actorReachRefusal(session.getPlayer(), actor.getPosition());
        if (refusal !== null) {
            log.debug(`Dropped an NPC open from ${session.identity.name}: actor ${target} is ${refusal}`);
            return;
        }

        log.debug(`${session.identity.name} opened NPC ${target}. NPC dialogue is not implemented`);
    }
}
