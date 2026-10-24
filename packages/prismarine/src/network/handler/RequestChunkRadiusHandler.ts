import Identifiers from '../Identifiers';
import type PacketHandler from './PacketHandler';
import type { PlayerSession } from '../../';
import type RequestChunkRadiusPacket from '../packet/RequestChunkRadiusPacket';
import type Server from '../../Server';

/**
 * Answers a view distance request with the smallest radius every side can take.
 *
 * The grant is the least of the requested Chunk Radius, the client's Max ChunkRadius when it
 * stated one (zero means it did not), and the server's configured view distance, and never
 * below 1 so a request for 0 does not switch terrain off.
 */
export default class RequestChunkRadiusHandler implements PacketHandler<RequestChunkRadiusPacket> {
    public static NetID = Identifiers.RequestChunkRadiusPacket;

    public async handle(packet: RequestChunkRadiusPacket, server: Server, session: PlayerSession): Promise<void> {
        const limits = [packet.radius, server.getConfig().getViewDistance()];
        if (packet.maxRadius > 0) {
            limits.push(packet.maxRadius);
        }

        await session.setViewDistance(Math.max(1, Math.min(...limits)));
    }
}
