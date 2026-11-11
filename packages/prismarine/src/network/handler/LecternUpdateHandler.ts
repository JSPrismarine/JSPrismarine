import type LecternUpdatePacket from '@jsprismarine/protocol/packet/LecternUpdatePacket';
import BlockPosition from '../../world/BlockPosition';
import { blockTargetRejection } from './BlockTarget';
import type { SessionContext } from './HandlerContext';
import type { ReadLaneHandler } from './SessionHandler';

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
export default class LecternUpdateHandler implements ReadLaneHandler<LecternUpdatePacket> {
    public static PacketName = 'LecternUpdatePacket';
    public readonly takes = 'context';
    public readonly phases = ['play'] as const;
    public readonly lane = 'read';

    /** Checks the position names a lectern in reach, then logs the page and position. */
    public handle(packet: LecternUpdatePacket, { session, log }: SessionContext): void {
        const data = packet.getPacketData();
        if (data === null) throw new Error('Cannot handle a LecternUpdatePacket without decoded data');

        const position = new BlockPosition(data.position.x, data.position.y, data.position.z);
        const where = `${position.getX()}, ${position.getY()}, ${position.getZ()}`;

        const rejection = blockTargetRejection(session, position, LECTERNS);
        if (rejection !== null) {
            log.verbose(
                `Dropped a lectern update from ${session.identity.name} at ${where}: ${rejection}`,
                'LecternUpdateHandler/handle'
            );
            return;
        }

        log.debug(
            `${session.identity.name} turned the lectern at ${where} to page ${data.newPage} of ${data.totalPages}. Lectern pages are not stored`,
            'LecternUpdateHandler/handle'
        );
    }
}
