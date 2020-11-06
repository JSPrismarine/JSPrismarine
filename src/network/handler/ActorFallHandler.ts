import type Player from '../../player/Player';
import type Prismarine from '../../Prismarine';
import type ActorFallPacket from '../packet/ActorFallPacket';
import Identifiers from '../Identifiers';

export default class ActorFallHandler {
    static NetID = Identifiers.ActorFallPacket;

    static handle(
        packet: ActorFallPacket,
        server: Prismarine,
        player: Player
    ) {}
}
