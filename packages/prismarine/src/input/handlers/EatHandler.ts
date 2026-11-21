import { ActorEvent } from '@jsprismarine/protocol/bedrock/packet/ActorEventPacket';

import type { InputContext } from '../../network/handler/HandlerContext';
import type { ShownActor } from '../../world/ShownActor';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/**
 * The player started eating.
 *
 * The event goes to the players that have the sender on screen, so they see the eating
 * animation too. The world's actor event carries Bedrock's event code, which replication relays
 * as it is.
 */
export default class EatHandler implements IntentHandler<'eat'> {
    public static readonly Kind = 'eat';

    /** Relays the feed event about the sender to the players tracking it. */
    public handle({ item }: Intent<'eat'>, { session }: InputContext): undefined {
        const player: ShownActor | undefined = session.getActor();
        // Nobody sees a player whose entity is in no store, so there is nobody to relay to.
        if (player === undefined) return;

        session.getWorld().sendActorEvent(player, ActorEvent.FEED, item);
    }
}
