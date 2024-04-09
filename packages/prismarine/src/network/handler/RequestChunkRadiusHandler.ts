import Identifiers from '../Identifiers';
import { type PlayerSession } from '../../';
import type Server from '../../Server';
import type PacketHandler from './PacketHandler';
import type { PacketData } from '@jsprismarine/protocol';

export default class RequestChunkRadiusHandler implements PacketHandler<PacketData.RequestChunkRadius> {
    public static NetID = Identifiers.RequestChunkRadiusPacket;

    public async handle(data: PacketData.RequestChunkRadius, server: Server, session: PlayerSession): Promise<void> {
        const maxViewDistance = server.getConfig().getViewDistance();
        const viewDistance = data.chunkRadius >= maxViewDistance ? maxViewDistance : data.chunkRadius;

        // TODO: better management of max view distance

        session.setViewDistance(viewDistance);
    }
}
