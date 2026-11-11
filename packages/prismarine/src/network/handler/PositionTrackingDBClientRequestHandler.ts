import type PositionTrackingDBClientRequestPacket from '@jsprismarine/protocol/packet/PositionTrackingDBClientRequestPacket';
import { PositionTrackingDBClientRequestAction } from '@jsprismarine/protocol/packet/PositionTrackingDBClientRequestPacket';
import type { SessionContext } from './HandlerContext';
import type { ConnectionLaneHandler } from './SessionHandler';

/**
 * A lookup in the position tracking database.
 *
 * The request is recorded at debug level and dropped. Known gap: there is no position
 * tracking database, so no `PositionTrackingDBServerBroadcastPacket` goes back and a
 * lodestone compass keeps whichever needle the client drew last.
 */
export default class PositionTrackingDBClientRequestHandler implements ConnectionLaneHandler<PositionTrackingDBClientRequestPacket> {
    public static PacketName = 'PositionTrackingDBClientRequestPacket';
    public readonly phases = ['play'] as const;
    public readonly lane = 'connection';

    /**
     * Logs the tracking id the client asked about.
     *
     * `Query` is the only `Action` the docs list. Any other number is not a request this
     * server could ever answer, so it is logged as dropped rather than read as a query.
     */
    public handle(packet: PositionTrackingDBClientRequestPacket, { session, log }: SessionContext): void {
        const name = session.identity.name;

        if (packet.action !== PositionTrackingDBClientRequestAction.Query) {
            log.debug(
                `Dropped a position tracking request from ${name} with the unknown action ${packet.action}`,
                'PositionTrackingDBClientRequestHandler/handle'
            );
            return;
        }

        log.debug(
            `${name} asked for tracked position ${packet.id}. Position tracking is not modeled`,
            'PositionTrackingDBClientRequestHandler/handle'
        );
    }
}
