import Player from "../../player";
import Prismarine from "../../prismarine";
import Identifiers from "../identifiers";
import ActorFallPacket from "../packet/actor-fall";

export default class ActorFallHandler {
    static NetID = Identifiers.ActorFallPacket

    /**
     * @param {ActorFallPacket} packet
     * @param {Prismarine} _server 
     * @param {Player} player 
     */
    static handle(packet: ActorFallPacket, server: Prismarine, player: Player) {
        // TODO: handle
        server.getLogger().debug('STUB: ActorFallHandler');
    }
}
