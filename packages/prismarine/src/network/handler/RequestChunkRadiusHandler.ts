import Identifiers from '../Identifiers';
import PacketHandler from './PacketHandler';
import PlayStatusType from '../type/PlayStatusType';
import type Player from '../../player/Player';
import type RequestChunkRadiusPacket from '../packet/RequestChunkRadiusPacket';
import type Server from '../../Server';

export default class RequestChunkRadiusHandler implements PacketHandler<RequestChunkRadiusPacket> {
    public static NetID = Identifiers.RequestChunkRadiusPacket;

    public async handle(packet: RequestChunkRadiusPacket, server: Server, player: Player): Promise<void> {
        const maxViewDistance = server.getConfig().getViewDistance();
        const viewDistance = packet.radius >= maxViewDistance ? maxViewDistance : packet.radius;

        await player.getConnection().setViewDistance(viewDistance);

        await player.getConnection().sendNetworkChunkPublisher();
        await player.getConnection().needNewChunks(true);

        // Summon player(s)
        await Promise.all(
            server
                .getPlayerManager()
                .getOnlinePlayers()
                .filter((p) => !(p === player))
                .map(async (p) => {
                    await p.getConnection().sendSpawn(player);
                    await player.getConnection().sendSpawn(p);
                })
        );

        // Summon entities
        await Promise.all(
            player
                .getWorld()
                .getEntities()
                .filter((e) => !e.isPlayer())
                .map(async (entity) => entity.sendSpawn(player))
        );

        // todo: set health packet
        await player.getConnection().sendPlayStatus(PlayStatusType.PlayerSpawn);
    }
}
