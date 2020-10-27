<<<<<<< HEAD:src/network/handler/AddActorFallHandler.ts
import type Player from "../../player/Player";
import type Prismarine from "../../Prismarine";
import Identifiers from "../Identifiers";
import type ActorFallPacket from "../packet/actor-fall";
=======
import Player from "../../player";
import Prismarine from "../../Prismarine";
import Identifiers from "../Identifiers";
import ActorFallPacket from "../packet/actor-fall";
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e:src/network/handler/actor-fall-packet.ts

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
