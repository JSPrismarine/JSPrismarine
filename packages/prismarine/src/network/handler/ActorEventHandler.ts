import type ActorEventPacket from '@jsprismarine/protocol/packet/ActorEventPacket';
import { ActorEvent } from '@jsprismarine/protocol/packet/ActorEventPacket';
import type { ShownActor } from '../../world/ShownActor';
import type { InputContext } from './HandlerContext';
import type { InputLaneHandler } from './SessionHandler';

/**
 * The events a vanilla client reports about its own player.
 *
 * `FEED` goes out when the player starts eating, with the item's network id as `Data`. The
 * other sixty events only travel from server to client.
 */
const CLIENT_EVENTS: ReadonlySet<ActorEvent> = new Set([ActorEvent.FEED]);

/**
 * A client reporting something that happened to its own player.
 *
 * A client may only speak for itself, and only with the events vanilla sends. An event that
 * names another actor, or one of the server-only events, is dropped: relaying it would let a
 * client play any animation on any entity it can see. An accepted event goes to the players
 * that have the sender on screen, so they see the eating animation too.
 *
 * A vanilla client echoes a `FEED` it was sent about another player back to the server, so
 * an event about another actor is a normal sight and is logged at verbose level.
 */
export default class ActorEventHandler implements InputLaneHandler<ActorEventPacket> {
    public static PacketName = 'ActorEventPacket';
    public readonly phases = ['play'] as const;
    // Relays to the players that see the sender, so it is an input though it writes nothing.
    public readonly lane = 'input';

    /** Relays an allowed event about the sender to the players tracking it, and drops the rest. */
    public handle(packet: ActorEventPacket, { session, log }: InputContext): undefined {
        const player: ShownActor | undefined = session.getActor();
        // Nobody sees a player whose entity is in no store, so there is nobody to relay to.
        if (player === undefined) return;

        if (packet.runtimeEntityId !== session.runtimeId) {
            log.verbose(
                `Dropped actor event ${packet.event} from ${session.identity.name}: it names actor ${packet.runtimeEntityId}, not the sender`,
                'ActorEventHandler/handle'
            );
            return;
        }

        if (!CLIENT_EVENTS.has(packet.event)) {
            log.verbose(
                `Dropped actor event ${packet.event} from ${session.identity.name}: a client does not send it`,
                'ActorEventHandler/handle'
            );
            return;
        }

        session.getWorld().sendActorEvent(player, packet.event, packet.data);
    }
}
