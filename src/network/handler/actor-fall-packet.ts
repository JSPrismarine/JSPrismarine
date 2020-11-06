import Player from '../../player/Player';
import Prismarine from '../../Prismarine';
import Identifiers from '../Identifiers';
import ActorFallPacket from '../packet/actor-fall';

export default class ActorFallHandler {
    static NetID = Identifiers.ActorFallPacket;

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
