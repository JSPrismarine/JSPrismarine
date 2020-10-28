import type Player from "../../player/Player";
import type Prismarine from "../../Prismarine";
import type RequestChunkRadiusPacket from "../packet/request-chunk-radius";
import PlayerSpawnEvent from "../../events/player/PlayerSpawnEvent";
import PlayStatus from "../type/play-status";
import Identifiers from "../Identifiers";

export default class RequestChunkRadiusHandler {
    static NetID = Identifiers.RequestChunkRadiusPacket

    /**
     * @param {RequestChunkRadiusPacket} packet 
     * @param {Prismarine} server
     * @param {Player} player 
     */
    static async handle(packet: RequestChunkRadiusPacket, server: Prismarine, player: Player) {
        const maxViewDistance = server.getConfig().getViewDistance();
        const viewDistance = (packet.radius >= maxViewDistance) ? maxViewDistance : packet.radius;
        player.getPlayerConnection().setViewDistance(viewDistance);

        player.getPlayerConnection().sendNetworkChunkPublisher();

        player.getPlayerConnection().sendPlayStatus(PlayStatus.PlayerSpawn);
    }
}
