import PlayerScriptMessageEvent from '../../events/player/PlayerScriptMessageEvent';
import type { InputContext } from '../../player/context/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/**
 * A message from a client's scripts to the server's. It raises `playerScriptMessage`, which the
 * level's scripts hear as `world.afterEvents.messageReceive`, in the tick it arrived in.
 */
export default class ScriptMessageHandler implements IntentHandler<'scriptMessage'> {
    public static readonly Kind = 'scriptMessage';

    /** Raises the message as the server's `playerScriptMessage` event. */
    public handle({ id, value }: Intent<'scriptMessage'>, { session, services }: InputContext): undefined {
        services.events.post('playerScriptMessage', new PlayerScriptMessageEvent(session, id, value));
    }
}
