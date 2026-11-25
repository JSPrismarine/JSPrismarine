import type { InputContext } from '../../player/context/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/** The player lay down in a bed or got out of one. */
export default class SetSleepingHandler implements IntentHandler<'setSleeping'> {
    public static readonly Kind = 'setSleeping';

    /** Sets whether the player sleeps. */
    public handle({ sleeping }: Intent<'setSleeping'>, { session }: InputContext): undefined {
        session.getPlayer().getComponents().set('movement.sleeping', sleeping);
    }
}
