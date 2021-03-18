import type ClientCacheStatusPacket from '../packet/ClientCacheStatusPacket';
import Identifiers from '../Identifiers';
import PacketHandler from './PacketHandler';
import type Player from '../../player/Player';
import type Server from '../../Server';

export default class ClientCacheStatusHandler implements PacketHandler<ClientCacheStatusPacket> {
    public static NetID = Identifiers.ClientCacheStatusPacket;

    public async handle(packet: ClientCacheStatusPacket, server: Server, player: Player): Promise<void> {
        player.cacheSupport = packet.enabled;
    }
}
