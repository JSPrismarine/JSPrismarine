import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import type ResourcePackChunkRequestPacket from '../packet/ResourcePackChunkRequestPacket';
import type PacketHandler from './PacketHandler';

/**
 * A request for a resource pack chunk.
 *
 * The server announces no downloadable packs, so a client has nothing to request. The
 * request is recorded at debug level; `ResourcePackChunkDataPacket` is not modeled yet, so
 * there is no reply.
 */
export default class ResourcePackChunkRequestHandler implements PacketHandler<ResourcePackChunkRequestPacket> {
    public static NetID = Identifiers.ResourcePackChunkRequestPacket;

    /** Logs the requested pack and chunk. */
    public handle(packet: ResourcePackChunkRequestPacket, server: Server, session: PlayerSession): void {
        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} requested chunk ${packet.chunk} of pack ${packet.resourceName}, which the server does not serve`,
                'ResourcePackChunkRequestHandler/handle'
            );
    }
}
