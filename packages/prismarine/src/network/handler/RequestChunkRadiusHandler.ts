import Identifiers from '../Identifiers';
import type PacketHandler from './PacketHandler';
import type { PlayerSession } from '../../';
import type RequestChunkRadiusPacket from '../packet/RequestChunkRadiusPacket';
import type Server from '../../Server';

export default class RequestChunkRadiusHandler implements PacketHandler<RequestChunkRadiusPacket> {
    public static NetID = Identifiers.RequestChunkRadiusPacket;

    public async handle(packet: RequestChunkRadiusPacket, server: Server, session: PlayerSession): Promise<void> {
        const maxViewDistance = server.getConfig().getViewDistance();
        const viewDistance = packet.radius >= maxViewDistance ? maxViewDistance : packet.radius;

        await session.setViewDistance(viewDistance);
    }
}
