import type ClientCacheStatusPacket from '../packet/ClientCacheStatusPacket';
import Identifiers from '../Identifiers';
import PacketHandler from './PacketHandler';
import PlayerSession from '../PlayerSession';
import type Server from '../../Server';

export default class ClientCacheStatusHandler implements PacketHandler<ClientCacheStatusPacket> {
    public static NetID = Identifiers.ClientCacheStatusPacket;

    public async handle(packet: ClientCacheStatusPacket, _server: Server, session: PlayerSession): Promise<void> {
        // TODO: cache is network related, not player
        session.getPlayer().cacheSupport = packet.enabled;
    }
}
