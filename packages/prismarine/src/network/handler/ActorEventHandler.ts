import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import type ActorEventPacket from '../packet/ActorEventPacket';
import { ActorEvent } from '../packet/ActorEventPacket';
import type PacketHandler from './PacketHandler';

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
export default class ActorEventHandler implements PacketHandler<ActorEventPacket> {
    public static PacketName = 'ActorEventPacket';

    /** Relays an allowed event about the sender to the players tracking it, and drops the rest. */
    public async handle(packet: ActorEventPacket, server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();
        const logger = server.getLogger();

        if (packet.runtimeEntityId !== player.getRuntimeId()) {
            logger.verbose(
                `Dropped actor event ${packet.event} from ${player.getName()}: it names actor ${packet.runtimeEntityId}, not the sender`,
                'ActorEventHandler/handle'
            );
            return;
        }

        if (!CLIENT_EVENTS.has(packet.event)) {
            logger.verbose(
                `Dropped actor event ${packet.event} from ${player.getName()}: a client does not send it`,
                'ActorEventHandler/handle'
            );
            return;
        }

        await player.getWorld().sendActorEvent(player, packet.event, packet.data);
    }
}
