import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import type PositionTrackingDBClientRequestPacket from '../packet/PositionTrackingDBClientRequestPacket';
import type PacketHandler from './PacketHandler';

/**
 * A lookup in the position tracking database.
 *
 * The request is recorded at debug level and dropped. Known gap: there is no position
 * tracking database, so no `PositionTrackingDBServerBroadcastPacket` goes back and a
 * lodestone compass keeps whichever needle the client drew last.
 */
export default class PositionTrackingDBClientRequestHandler implements PacketHandler<PositionTrackingDBClientRequestPacket> {
    public static NetID = Identifiers.PositionTrackingDBClientRequestPacket;

    /** Logs the tracking id the client asked about. */
    public handle(packet: PositionTrackingDBClientRequestPacket, server: Server, session: PlayerSession): void {
        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} asked for tracked position ${packet.id}. Position tracking is not modeled`,
                'PositionTrackingDBClientRequestHandler/handle'
            );
    }
}
