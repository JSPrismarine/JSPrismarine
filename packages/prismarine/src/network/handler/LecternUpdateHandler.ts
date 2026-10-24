import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import type LecternUpdatePacket from '../packet/LecternUpdatePacket';
import type PacketHandler from './PacketHandler';

/**
 * A lectern page turn.
 *
 * The turn is recorded at debug level and dropped. Known gap: the lectern block entity does
 * not store a page, so there is nothing to update or to broadcast to other viewers.
 */
export default class LecternUpdateHandler implements PacketHandler<LecternUpdatePacket> {
    public static NetID = Identifiers.LecternUpdatePacket;

    /** Logs the page and the lectern position. */
    public handle(packet: LecternUpdatePacket, server: Server, session: PlayerSession): void {
        const { position } = packet;

        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} turned the lectern at ${position.getX()}, ${position.getY()}, ${position.getZ()} to page ${packet.newPage} of ${packet.totalPages}. Lectern pages are not stored`,
                'LecternUpdateHandler/handle'
            );
    }
}
