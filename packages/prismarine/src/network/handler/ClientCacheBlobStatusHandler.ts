import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import type ClientCacheBlobStatusPacket from '../packet/ClientCacheBlobStatusPacket';
import type PacketHandler from './PacketHandler';

/**
 * The client's blob cache report.
 *
 * The server sends every chunk with the cache off, so it never marks a blob as cached and
 * has nothing to answer a miss with. The counts are recorded at debug level and dropped.
 */
export default class ClientCacheBlobStatusHandler implements PacketHandler<ClientCacheBlobStatusPacket> {
    public static NetID = Identifiers.ClientCacheBlobStatusPacket;

    /** Logs how many blobs the client has and lacks. */
    public handle(packet: ClientCacheBlobStatusPacket, server: Server, session: PlayerSession): void {
        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} holds ${packet.foundIds.length} cached blob(s) and is missing ${packet.missingIds.length}. The server keeps the cache off`,
                'ClientCacheBlobStatusHandler/handle'
            );
    }
}
