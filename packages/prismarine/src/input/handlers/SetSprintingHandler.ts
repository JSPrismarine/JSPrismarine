import type { InputContext } from '../../player/context/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/** The player started or stopped sprinting. */
export default class SetSprintingHandler implements IntentHandler<'setSprinting'> {
    public static readonly Kind = 'setSprinting';

    /** Sets the sprint through the session, which posts its event; it waits for nothing. */
    public handle({ sprinting }: Intent<'setSprinting'>, { session, step }: InputContext): undefined {
        step.output(session.setSprinting(sprinting));
    }
}
