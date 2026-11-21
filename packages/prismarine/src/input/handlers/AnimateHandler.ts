import { AnimateAction } from '@jsprismarine/protocol/bedrock/packet/AnimatePacket';

import PlayerSwingEvent from '../../events/player/PlayerSwingEvent';
import type { InputContext } from '../../network/handler/HandlerContext';
import type { Intent, PlayerAnimation } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/**
 * The world's animation occurrence carries Bedrock's action code, which replication relays as it
 * is. The occurrence takes an edition-neutral name once the Java presenter needs one.
 */
const ACTION_OF: Readonly<Record<PlayerAnimation, number>> = {
    swing: AnimateAction.Swing,
    wakeUp: AnimateAction.WakeUp,
    criticalHit: AnimateAction.CriticalHit,
    magicCriticalHit: AnimateAction.MagicCriticalHit
};

/**
 * The player animated itself and asks to have it shown to everyone else.
 *
 * The relay goes through the player's own world, and only to the clients that have them on
 * screen, which replication works out when the tick seals. A swing also raises the plugin event.
 */
export default class AnimateHandler implements IntentHandler<'animate'> {
    public static readonly Kind = 'animate';

    /** Logs the animation under the sender's runtime id, keeping the data and swing source. */
    public handle({ animation, data, swingSource }: Intent<'animate'>, { session, services }: InputContext): undefined {
        session.getWorld().relayAnimation({
            entity: session.runtimeId,
            action: ACTION_OF[animation],
            data,
            swingSource
        });
        if (animation === 'swing') {
            services.events.post('playerSwing', new PlayerSwingEvent(session, swingSource));
        }
    }
}
