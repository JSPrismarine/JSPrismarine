import type { RequestChunkRadiusPacket } from '@jsprismarine/protocol';
import type { InputContext } from './HandlerContext';
import type { InputLaneHandler } from './SessionHandler';

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
export default class RequestChunkRadiusHandler implements InputLaneHandler<RequestChunkRadiusPacket> {
    public static PacketName = 'RequestChunkRadiusPacket';
    public readonly phases = ['play'] as const;
    // Input: it sets the player's view distance, which decides the chunks the world keeps loaded.
    public readonly lane = 'input';

    /** Grants a radius and records the exchange at debug level, since the join hinges on it. */
    public handle(packet: RequestChunkRadiusPacket, { session, log, config, step }: InputContext): undefined {
        const request = packet.getPacketData();
        if (request === null) throw new Error('RequestChunkRadiusPacket has no payload');

        const limits = [request.radius, config.getViewDistance()];
        if (request.maxRadius > 0) {
            limits.push(request.maxRadius);
        }

        const granted = Math.max(1, Math.min(...limits));
        log.debug(
            `${session.identity.name} asked for a chunk radius of ${request.radius} (max ${request.maxRadius}), granted ${granted}`,
            'RequestChunkRadiusHandler/handle'
        );

        // The radius is set before the first wait. What follows it is the answer and the chunk
        // streaming the answer opens, which belongs to the session and runs outside the tick.
        step.output(session.setViewDistance(granted));
    }
}
