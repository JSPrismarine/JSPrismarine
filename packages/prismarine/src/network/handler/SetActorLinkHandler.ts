import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import type SetActorLinkPacket from '../packet/SetActorLinkPacket';
import type PacketHandler from './PacketHandler';

/**
 * A riding link a client reports.
 *
 * The link is recorded at debug level and dropped. Known gap: riding is not modeled, so the
 * server neither moves a passenger with its vehicle nor tells other players about the link.
 */
export default class SetActorLinkHandler implements PacketHandler<SetActorLinkPacket> {
    public static NetID = Identifiers.SetActorLinkPacket;

    /** Logs the two actors and the link type. */
    public handle(packet: SetActorLinkPacket, server: Server, session: PlayerSession): void {
        const { targetA, targetB, type } = packet.link;

        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} reported actor link type ${type} between ${targetA} and ${targetB}. Riding is not modeled`,
                'SetActorLinkHandler/handle'
            );
    }
}
