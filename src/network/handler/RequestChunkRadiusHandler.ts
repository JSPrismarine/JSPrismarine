import type Player from '../../player/Player';
import type Server from '../../Server';
import type RequestChunkRadiusPacket from '../packet/RequestChunkRadiusPacket';
import PlayStatusType from '../type/PlayStatusType';
import PacketHandler from './PacketHandler';

export default class RequestChunkRadiusHandler
    implements PacketHandler<RequestChunkRadiusPacket> {
    public async handle(
        packet: RequestChunkRadiusPacket,
        server: Server,
        player: Player
    ): Promise<void> {
        const maxViewDistance = server.getConfig().getViewDistance();
        const viewDistance =
            packet.radius >= maxViewDistance ? maxViewDistance : packet.radius;

        await player.getConnection().setViewDistance(viewDistance);
        await player.getConnection().sendNetworkChunkPublisher();
        await player.getConnection().sendPlayStatus(PlayStatusType.PlayerSpawn);
    }
}
