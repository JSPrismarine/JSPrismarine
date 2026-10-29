import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import type SetActorLinkPacket from '../packet/SetActorLinkPacket';
import type PacketHandler from './PacketHandler';

/**
 * A riding link a client reports when its player mounts or dismounts something.
 *
 * The link must have the sender at one end: this server numbers an entity once, so the unique
 * ids in the link are runtime ids, and one of them has to be the player's own. A link between
 * two other actors is dropped. An accepted link is recorded at debug level and dropped as well.
 * Known gap: riding is not modeled, so the server neither moves a passenger with its vehicle
 * nor tells other players about the link.
 */
export default class SetActorLinkHandler implements PacketHandler<SetActorLinkPacket> {
    public static PacketName = 'SetActorLinkPacket';

    /** Logs the two actors and the link type when the sender is one of them. */
    public handle(packet: SetActorLinkPacket, server: Server, session: PlayerSession): void {
        const player = session.getPlayer();
        const { targetA, targetB, type } = packet.link;
        const self = player.getRuntimeId();

        if (targetA !== self && targetB !== self) {
            server
                .getLogger()
                .verbose(
                    `Dropped actor link type ${type} from ${player.getName()}: it joins ${targetA} and ${targetB}, neither of them the sender`,
                    'SetActorLinkHandler/handle'
                );
            return;
        }

        server
            .getLogger()
            .debug(
                `${player.getName()} reported actor link type ${type} between ${targetA} and ${targetB}. Riding is not modeled`,
                'SetActorLinkHandler/handle'
            );
    }
}
