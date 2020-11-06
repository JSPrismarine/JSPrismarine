import type Player from '../../player/Player';
import type Prismarine from '../../Prismarine';
import type ClientCacheStatusPacket from '../packet/client-cache-status';
import Identifiers from '../Identifiers';

export default class ClientCacheStatusHandler {
    static NetID = Identifiers.ClientCacheStatusPacket;

    static handle(
        packet: ClientCacheStatusPacket,
        server: Prismarine,
        player: Player
    ) {
        player.cacheSupport = packet.enabled;
    }
}
