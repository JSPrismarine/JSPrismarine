import type { SessionContext } from '../../player/context/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/**
 * The player middle-clicked an actor to take its spawn egg.
 *
 * A pick of an actor the player has not been shown is dropped at verbose level, and the rest are
 * recorded at debug level and dropped too. Known gap: there is no spawn egg item mapping to hand
 * back, and no server-initiated hotbar write to put it in.
 */
export default class PickEntityHandler implements IntentHandler<'pickEntity'> {
    public static readonly Kind = 'pickEntity';

    /** Checks the player sees the actor, then logs it. */
    public handle({ target, withData }: Intent<'pickEntity'>, { session, log }: SessionContext): void {
        if (!session.tracks(target)) {
            log.verbose(`Dropped a pick of actor ${target} from ${session.identity.name}: they have not been shown it`);
            return;
        }
        log.debug(
            `${session.identity.name} picked actor ${target}${withData ? ' with data' : ''}. Actor picking is not implemented`
        );
    }
}
