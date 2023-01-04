import type ClientCacheStatusPacket from '../packet/ClientCacheStatusPacket.js';
import Identifiers from '../Identifiers.js';
import PacketHandler from './PacketHandler.js';
import PlayerSession from '../PlayerSession.js';
import type Server from '../../Server.js';

export default class ClientCacheStatusHandler implements PacketHandler<ClientCacheStatusPacket> {
    public static NetID = Identifiers.ClientCacheStatusPacket;

    public async handle(packet: ClientCacheStatusPacket, _server: Server, session: PlayerSession): Promise<void> {
        // TODO: cache is network related, not player
        session.getPlayer().cacheSupport = packet.enabled;
    }
}
