import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import type MapInfoRequestPacket from '../packet/MapInfoRequestPacket';
import type PacketHandler from './PacketHandler';

/**
 * A map data request.
 *
 * The request is recorded at debug level and dropped. Known gap: the server has no map
 * storage, so there is no `ClientBoundMapItemDataPacket` to answer with and the map item
 * stays blank on the client.
 */
export default class MapInfoRequestHandler implements PacketHandler<MapInfoRequestPacket> {
    public static PacketName = 'MapInfoRequestPacket';

    /** Logs the map id and how many pixels came with it. */
    public handle(packet: MapInfoRequestPacket, server: Server, session: PlayerSession): void {
        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} requested map ${packet.mapUniqueId} and offered ${packet.clientPixels.length} pixel(s). Maps are not stored`,
                'MapInfoRequestHandler/handle'
            );
    }
}
