import type Player from '../../player/Player';
import type Prismarine from '../../Prismarine';
import type ClientCacheStatusPacket from '../packet/ClientCacheStatusPacket';
import PacketHandler from './PacketHandler';

export default class ClientCacheStatusHandler
    implements PacketHandler<ClientCacheStatusPacket> {
    public handle(
        packet: ClientCacheStatusPacket,
        server: Prismarine,
        player: Player
    ): void {
        player.cacheSupport = packet.enabled;
    }
}
