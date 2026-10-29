import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import type LecternUpdatePacket from '../packet/LecternUpdatePacket';
import { blockTargetRejection } from './BlockTarget';
import type PacketHandler from './PacketHandler';

/** The one block whose screen sends this packet. */
const LECTERNS: ReadonlySet<string> = new Set(['minecraft:lectern']);

/**
 * A lectern page turn.
 *
 * A turn whose position is not a lectern within reach in a loaded chunk is dropped at
 * verbose level. The rest are recorded at debug level and dropped too. Known gap: the
 * lectern block entity does not store a page, so there is nothing to update or to broadcast
 * to other viewers.
 */
export default class LecternUpdateHandler implements PacketHandler<LecternUpdatePacket> {
    public static PacketName = 'LecternUpdatePacket';
    public readonly phases = ['play'] as const;

    /** Checks the position names a lectern in reach, then logs the page and position. */
    public handle(packet: LecternUpdatePacket, server: Server, session: PlayerSession): void {
        const player = session.getPlayer();
        const { position } = packet;
        const where = `${position.getX()}, ${position.getY()}, ${position.getZ()}`;

        const rejection = blockTargetRejection(player, position, LECTERNS);
        if (rejection !== null) {
            server
                .getLogger()
                .verbose(
                    `Dropped a lectern update from ${player.getName()} at ${where}: ${rejection}`,
                    'LecternUpdateHandler/handle'
                );
            return;
        }

        server
            .getLogger()
            .debug(
                `${player.getName()} turned the lectern at ${where} to page ${packet.newPage} of ${packet.totalPages}. Lectern pages are not stored`,
                'LecternUpdateHandler/handle'
            );
    }
}
