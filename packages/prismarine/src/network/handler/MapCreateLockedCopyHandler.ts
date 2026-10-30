import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import type MapCreateLockedCopyPacket from '@jsprismarine/protocol/packet/MapCreateLockedCopyPacket';
import type PacketHandler from './PacketHandler';

/**
 * A map locked at a cartography table.
 *
 * The request is recorded at debug level and dropped. Known gap: the server stores no maps, so
 * there is nothing to copy and no `ClientboundMapItemDataPacket` to send for the new id.
 */
export default class MapCreateLockedCopyHandler implements PacketHandler<MapCreateLockedCopyPacket> {
    public static PacketName = 'MapCreateLockedCopyPacket';
    public readonly phases = ['play'] as const;

    /** Logs the map being copied and the id asked for. */
    public handle(packet: MapCreateLockedCopyPacket, server: Server, session: PlayerSession): void {
        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} locked map ${packet.originalMapId} as ${packet.newMapId}. The server stores no maps`,
                'MapCreateLockedCopyHandler/handle'
            );
    }
}
