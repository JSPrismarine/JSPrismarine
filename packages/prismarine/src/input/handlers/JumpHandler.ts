import type { InputContext } from '../../player/context/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/** The player jumped, which tires it as a jump does. */
export default class JumpHandler implements IntentHandler<'jump'> {
    public static readonly Kind = 'jump';

    /** Records the jump on the player. */
    public handle(_jump: Intent<'jump'>, { session }: InputContext): undefined {
        session.inputs().playerJumped(session.getPlayer());
    }
}
