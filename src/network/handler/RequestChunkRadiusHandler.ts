import type Player from '../../player/Player';
import type Prismarine from '../../Prismarine';
import type RequestChunkRadiusPacket from '../packet/RequestChunkRadiusPacket';
import PlayStatus from '../type/play-status';
import Identifiers from '../Identifiers';

export default class RequestChunkRadiusHandler {
    static NetID = Identifiers.RequestChunkRadiusPacket;

    static async handle(
        packet: RequestChunkRadiusPacket,
        server: Prismarine,
        player: Player
    ) {
        const maxViewDistance = server.getConfig().getViewDistance();
        const viewDistance =
            packet.radius >= maxViewDistance ? maxViewDistance : packet.radius;
        player.getConnection().setViewDistance(viewDistance);

        player.getConnection().sendNetworkChunkPublisher();

        player.getConnection().sendPlayStatus(PlayStatus.PlayerSpawn);
    }
}
