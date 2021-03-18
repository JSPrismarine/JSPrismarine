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

        await player.getConnection().sendSettings();
        await player.getConnection().setViewDistance(viewDistance);
        await player.getConnection().sendNetworkChunkPublisher();
        await player.getConnection().sendPlayStatus(PlayStatusType.PlayerSpawn);
    }
}
