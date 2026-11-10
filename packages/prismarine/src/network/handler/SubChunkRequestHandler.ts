import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import type SubChunkRequestPacket from '@jsprismarine/protocol/packet/SubChunkRequestPacket';
import type PacketHandler from './PacketHandler';

/** Answers the sub chunks a request-mode LevelChunk told the client to fetch. */
export default class SubChunkRequestHandler implements PacketHandler<SubChunkRequestPacket> {
    public static PacketName = 'SubChunkRequestPacket';
    public readonly phases = ['play'] as const;
    public readonly lane = 'read';

    /** Sends a result for every requested offset and logs the request summary. */
    public async handle(packet: SubChunkRequestPacket, server: Server, session: PlayerSession): Promise<void> {
        const { centerPos } = packet;
        const answered = await session.handleSubChunkRequest(packet);

        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} requested ${packet.offsets.length} sub chunk(s) around ${centerPos.x}, ${centerPos.y}, ${centerPos.z} in dimension ${packet.dimensionType}; answered ${answered}`,
                'SubChunkRequestHandler/handle'
            );
    }
}
