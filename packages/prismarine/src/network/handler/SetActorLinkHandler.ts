import type SetActorLinkPacket from '@jsprismarine/protocol/packet/SetActorLinkPacket';
import type { SessionContext } from './HandlerContext';
import type { ConnectionLaneHandler } from './SessionHandler';

/**
 * A riding link a client reports when its player mounts or dismounts something.
 *
 * The link must have the sender at one end: this server numbers an entity once, so the unique
 * ids in the link are runtime ids, and one of them has to be the player's own. A link between
 * two other actors is dropped. An accepted link is recorded at debug level and dropped as well.
 * Known gap: riding is not modeled, so the server neither moves a passenger with its vehicle
 * nor tells other players about the link.
 */
export default class SetActorLinkHandler implements ConnectionLaneHandler<SetActorLinkPacket> {
    public static PacketName = 'SetActorLinkPacket';
    public readonly phases = ['play'] as const;
    public readonly lane = 'connection';

    /** Logs the two actors and the link type when the sender is one of them. */
    public handle(packet: SetActorLinkPacket, { session, log }: SessionContext): void {
        const { targetA, targetB, type } = packet.link;
        const self = session.runtimeId;

        if (targetA !== self && targetB !== self) {
            log.verbose(
                `Dropped actor link type ${type} from ${session.identity.name}: it joins ${targetA} and ${targetB}, neither of them the sender`,
                'SetActorLinkHandler/handle'
            );
            return;
        }

        log.debug(
            `${session.identity.name} reported actor link type ${type} between ${targetA} and ${targetB}. Riding is not modeled`,
            'SetActorLinkHandler/handle'
        );
    }
}
