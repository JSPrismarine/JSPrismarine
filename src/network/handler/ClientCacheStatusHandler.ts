import type ClientCacheStatusPacket from '../packet/ClientCacheStatusPacket';
import PacketHandler from './PacketHandler';
import type Player from '../../player/Player';
import type Server from '../../Server';

export default class ClientCacheStatusHandler implements PacketHandler<ClientCacheStatusPacket> {
    public handle(packet: ClientCacheStatusPacket, server: Server, player: Player): void {
        player.cacheSupport = packet.enabled;
    }
}
