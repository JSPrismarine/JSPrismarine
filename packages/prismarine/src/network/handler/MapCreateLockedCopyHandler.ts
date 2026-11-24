import type MapCreateLockedCopyPacket from '@jsprismarine/protocol/bedrock/packet/MapCreateLockedCopyPacket';
import type { SessionContext } from './HandlerContext';
import type { ConnectionLaneHandler } from './SessionHandler';

/**
 * A map locked at a cartography table.
 *
 * The request is recorded at debug level and dropped. Known gap: the server keeps explorer maps
 * (`Level.createMap`) but copies none, so the locked copy gets no saved data and no
 * `ClientboundMapItemDataPacket` is sent for the new id.
 */
export default class MapCreateLockedCopyHandler implements ConnectionLaneHandler<MapCreateLockedCopyPacket> {
    public static PacketName = 'MapCreateLockedCopyPacket';
    public readonly phases = ['play'] as const;
    public readonly lane = 'connection';

    /** Logs the map being copied and the id asked for. */
    public handle(packet: MapCreateLockedCopyPacket, { session, log }: SessionContext): void {
        log.debug(
            `${session.identity.name} locked map ${packet.originalMapId} as ${packet.newMapId}. Maps are not copied`
        );
    }
}
