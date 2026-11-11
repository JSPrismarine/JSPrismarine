import type SubChunkRequestPacket from '@jsprismarine/protocol/packet/SubChunkRequestPacket';
import type { SessionContext } from './HandlerContext';
import type { ReadLaneHandler } from './SessionHandler';

/** Answers the sub chunks a request-mode LevelChunk told the client to fetch. */
export default class SubChunkRequestHandler implements ReadLaneHandler<SubChunkRequestPacket> {
    public static PacketName = 'SubChunkRequestPacket';
    public readonly takes = 'context';
    public readonly phases = ['play'] as const;
    public readonly lane = 'read';

    /** Sends a result for every requested offset and logs the request summary. */
    public async handle(packet: SubChunkRequestPacket, { session, log }: SessionContext): Promise<void> {
        const { centerPos } = packet;
        const answered = await session.handleSubChunkRequest(packet);

        log.debug(
            `${session.identity.name} requested ${packet.offsets.length} sub chunk(s) around ${centerPos.x}, ${centerPos.y}, ${centerPos.z} in dimension ${packet.dimensionType}; answered ${answered}`,
            'SubChunkRequestHandler/handle'
        );
    }
}
