import type { InputContext } from '../../player/context/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/**
 * The player reported the end credits finished.
 *
 * The server starts the credits through `PlayerSession.startCredits` when a player first leaves
 * the End, holding the resolved arrival; the finish completes that held world change. A finish
 * with no credits pending is logged at debug and dropped.
 */
export default class FinishCreditsHandler implements IntentHandler<'finishCredits'> {
    public static readonly Kind = 'finishCredits';

    /** Completes the held world change, which the next input step carries out, so nothing here waits. */
    public handle(_intent: Intent<'finishCredits'>, { session, log }: InputContext): undefined {
        if (session.completeCredits()) return;

        log.debug(`${session.identity.name} reported the end credits finished with none pending`);
    }
}
