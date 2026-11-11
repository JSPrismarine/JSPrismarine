import type MapCreateLockedCopyPacket from '@jsprismarine/protocol/packet/MapCreateLockedCopyPacket';
import type { SessionContext } from './HandlerContext';
import type { ConnectionLaneHandler } from './SessionHandler';

/**
 * A map locked at a cartography table.
 *
 * The request is recorded at debug level and dropped. Known gap: the server stores no maps, so
 * there is nothing to copy and no `ClientboundMapItemDataPacket` to send for the new id.
 */
export default class MapCreateLockedCopyHandler implements ConnectionLaneHandler<MapCreateLockedCopyPacket> {
    public static PacketName = 'MapCreateLockedCopyPacket';
    public readonly takes = 'context';
    public readonly phases = ['play'] as const;
    public readonly lane = 'connection';

    /** Logs the map being copied and the id asked for. */
    public handle(packet: MapCreateLockedCopyPacket, { session, log }: SessionContext): void {
        log.debug(
            `${session.identity.name} locked map ${packet.originalMapId} as ${packet.newMapId}. The server stores no maps`,
            'MapCreateLockedCopyHandler/handle'
        );
    }
}
