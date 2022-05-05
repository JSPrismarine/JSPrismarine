import type ClientCacheStatusPacket from '../packet/ClientCacheStatusPacket';
import Identifiers from '../Identifiers';
import PacketHandler from './PacketHandler';
import { PlayerConnection } from '../../Prismarine';
import type Server from '../../Server';

export default class ClientCacheStatusHandler implements PacketHandler<ClientCacheStatusPacket> {
    public static NetID = Identifiers.ClientCacheStatusPacket;

    public async handle(packet: ClientCacheStatusPacket, _server: Server, connection: PlayerConnection): Promise<void> {
        connection.getPlayer().cacheSupport = packet.enabled;
    }
}
