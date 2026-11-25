import type { InputContext } from '../../player/context/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/** The player started or stopped flying. */
export default class SetFlyingHandler implements IntentHandler<'setFlying'> {
    public static readonly Kind = 'setFlying';

    /**
     * Sets the flight through the session, which writes it before its first send and tells the
     * client its abilities either way: the new ones when the player may fly, the old ones when
     * it may not.
     */
    public handle({ flying }: Intent<'setFlying'>, { session, step }: InputContext): undefined {
        step.output(session.setFlying(flying));
    }
}
