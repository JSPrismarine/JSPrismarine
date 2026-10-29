import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import type PositionTrackingDBClientRequestPacket from '../packet/PositionTrackingDBClientRequestPacket';
import { PositionTrackingDBClientRequestAction } from '../packet/PositionTrackingDBClientRequestPacket';
import type PacketHandler from './PacketHandler';

/**
 * A lookup in the position tracking database.
 *
 * The request is recorded at debug level and dropped. Known gap: there is no position
 * tracking database, so no `PositionTrackingDBServerBroadcastPacket` goes back and a
 * lodestone compass keeps whichever needle the client drew last.
 */
export default class PositionTrackingDBClientRequestHandler implements PacketHandler<PositionTrackingDBClientRequestPacket> {
    public static PacketName = 'PositionTrackingDBClientRequestPacket';

    /**
     * Logs the tracking id the client asked about.
     *
     * `Query` is the only `Action` the docs list. Any other number is not a request this
     * server could ever answer, so it is logged as dropped rather than read as a query.
     */
    public handle(packet: PositionTrackingDBClientRequestPacket, server: Server, session: PlayerSession): void {
        const name = session.getPlayer().getName();

        if (packet.action !== PositionTrackingDBClientRequestAction.Query) {
            server
                .getLogger()
                .debug(
                    `Dropped a position tracking request from ${name} with the unknown action ${packet.action}`,
                    'PositionTrackingDBClientRequestHandler/handle'
                );
            return;
        }

        server
            .getLogger()
            .debug(
                `${name} asked for tracked position ${packet.id}. Position tracking is not modeled`,
                'PositionTrackingDBClientRequestHandler/handle'
            );
    }
}
