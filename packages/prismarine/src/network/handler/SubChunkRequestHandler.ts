import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import type SubChunkRequestPacket from '../packet/SubChunkRequestPacket';
import type PacketHandler from './PacketHandler';

/**
 * A sub chunk request.
 *
 * The server sends full chunks in `LevelChunkPacket` and never advertises sub chunk request
 * mode, so a client should not ask. A request that arrives anyway is recorded at debug level
 * and dropped; there is no `SubChunkPacket` to answer with.
 */
export default class SubChunkRequestHandler implements PacketHandler<SubChunkRequestPacket> {
    public static NetID = Identifiers.SubChunkRequestPacket;

    /** Logs the center and how many sub chunks were asked for. */
    public handle(packet: SubChunkRequestPacket, server: Server, session: PlayerSession): void {
        const { centerPos } = packet;

        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} requested ${packet.offsets.length} sub chunk(s) around ${centerPos.x}, ${centerPos.y}, ${centerPos.z} in dimension ${packet.dimensionType}. The server does not offer sub chunk requests`,
                'SubChunkRequestHandler/handle'
            );
    }
}
