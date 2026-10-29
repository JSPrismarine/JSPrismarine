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
 *
 * The answer, `ChunkRadiusUpdated`, is what opens the window a client accepts terrain in: the
 * first request is also what starts the spawn chunks, see `PlayerSession.setViewDistance`.
 */
export default class RequestChunkRadiusHandler implements PacketHandler<RequestChunkRadiusPacket> {
    public static PacketName = 'RequestChunkRadiusPacket';

    /** Grants a radius and records the exchange at debug level, since the join hinges on it. */
    public async handle(packet: RequestChunkRadiusPacket, server: Server, session: PlayerSession): Promise<void> {
        const limits = [packet.radius, server.getConfig().getViewDistance()];
        if (packet.maxRadius > 0) {
            limits.push(packet.maxRadius);
        }

        const granted = Math.max(1, Math.min(...limits));
        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} asked for a chunk radius of ${packet.radius} (max ${packet.maxRadius}), granted ${granted}`,
                'RequestChunkRadiusHandler/handle'
            );

        await session.setViewDistance(granted);
    }
}
