import type AnimatePacket from '@jsprismarine/protocol/packet/AnimatePacket';
import { AnimateAction } from '@jsprismarine/protocol/packet/AnimatePacket';
import type { InputContext } from './HandlerContext';
import type { InputLaneHandler } from './SessionHandler';

/**
 * The animations a client plays on itself and asks to have shown to everyone else.
 *
 * `NoAction` animates nothing, and a byte outside the enum is not a 2193 client's doing, so
 * neither is relayed.
 */
const CLIENT_ACTIONS: ReadonlySet<number> = new Set([
    AnimateAction.Swing,
    AnimateAction.WakeUp,
    AnimateAction.CriticalHit,
    AnimateAction.MagicCriticalHit
]);

/** Relays a client's animation to the players in its world that have it on screen. */
export default class AnimateHandler implements InputLaneHandler<AnimatePacket> {
    public static PacketName = 'AnimatePacket';
    public readonly phases = ['play'] as const;
    // Logs an occurrence that replication relays to the players that see the sender.
    public readonly lane = 'input';

    /**
     * Relays the animation under the sender's runtime id, keeping the action, data and swing
     * source the client sent. The sender and anyone not tracking it are skipped.
     *
     * A packet naming another actor, or an action no client sends, is logged at debug level
     * and dropped: a client animates itself, and relaying it as anyone else would let one
     * player make another swing.
     */
    public handle(packet: AnimatePacket, { session, log }: InputContext): undefined {
        if (packet.runtimeEntityId !== session.runtimeId) {
            log.debug(
                `Dropped animation ${packet.action} from ${session.identity.name}: it names actor ${packet.runtimeEntityId}, not themselves`,
                'AnimateHandler/handle'
            );
            return;
        }

        if (!CLIENT_ACTIONS.has(packet.action)) {
            log.debug(
                `Dropped animation ${packet.action} from ${session.identity.name}: not one a client sends`,
                'AnimateHandler/handle'
            );
            return;
        }

        // The player's own world, and only the clients that have them on screen, which
        // replication works out when the tick seals. This went through the session manager, so
        // an arm swing reached every player on the server - across worlds, and at any distance.
        session.getWorld().relayAnimation({
            entity: session.runtimeId,
            action: packet.action,
            data: packet.data,
            swingSource: packet.swingSource
        });
    }
}
