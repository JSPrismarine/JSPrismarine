import Identifiers from '../Identifiers.js';
import PacketHandler from './PacketHandler.js';
import PlayStatusType from '../type/PlayStatusType.js';
import { PlayerSession } from '../../Prismarine.js';
import type RequestChunkRadiusPacket from '../packet/RequestChunkRadiusPacket.js';
import type Server from '../../Server.js';

export default class RequestChunkRadiusHandler implements PacketHandler<RequestChunkRadiusPacket> {
    public static NetID = Identifiers.RequestChunkRadiusPacket;

    public async handle(packet: RequestChunkRadiusPacket, server: Server, session: PlayerSession): Promise<void> {
        const maxViewDistance = server.getConfig().getViewDistance();
        const viewDistance = packet.radius >= maxViewDistance ? maxViewDistance : packet.radius;

        await session.setViewDistance(viewDistance);

        await session.sendNetworkChunkPublisher();
        // TODO: await session.needNewChunks(true);

        // Summon player(s)
        const player = session.getPlayer();
        await Promise.all(
            server
                .getSessionManager()
                .getAllPlayers()
                .filter((p) => !(p === player))
                .map(async (p) => {
                    await p.getNetworkSession().sendSpawn(player);
                    await session.sendSpawn(p);
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
        await session.sendPlayStatus(PlayStatusType.PlayerSpawn);
    }
}
