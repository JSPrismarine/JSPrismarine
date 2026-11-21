import type { InputContext } from '../../network/handler/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/** A dead player pressed the respawn button on its death screen. */
export default class PressRespawnHandler implements IntentHandler<'pressRespawn'> {
    public static readonly Kind = 'pressRespawn';

    /**
     * Files the respawn. The respawn search reads chunks that may not be loaded, so the respawn is
     * a request that the input step with the search's answer applies.
     */
    public handle(_intent: Intent<'pressRespawn'>, { session }: InputContext): undefined {
        session.requestRespawn();
    }
}
