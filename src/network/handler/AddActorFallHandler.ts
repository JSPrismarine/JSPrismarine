import type Player from "../../player/Player";
import type Prismarine from "../../Prismarine";
import type ActorFallPacket from "../packet/actor-fall";
import Identifiers from "../Identifiers";

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
