import type Player from '../../player/Player';
import type Server from '../../Server';
import type RequestChunkRadiusPacket from '../packet/RequestChunkRadiusPacket';
import PlayStatusType from '../type/PlayStatusType';
import PacketHandler from './PacketHandler';

export default class RequestChunkRadiusHandler
    implements PacketHandler<RequestChunkRadiusPacket> {
    public handle(
        packet: RequestChunkRadiusPacket,
        server: Server,
        player: Player
    ): void {
        const maxViewDistance = server.getConfig().getViewDistance();
        const viewDistance =
            packet.radius >= maxViewDistance ? maxViewDistance : packet.radius;
        player.getConnection().setViewDistance(viewDistance);

        player.getConnection().sendNetworkChunkPublisher();

        player.getConnection().sendPlayStatus(PlayStatusType.PlayerSpawn);
    }
}
