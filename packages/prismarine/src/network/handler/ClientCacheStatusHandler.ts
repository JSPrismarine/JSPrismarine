import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import type ClientCacheStatusPacket from '@jsprismarine/protocol/packet/ClientCacheStatusPacket';
import type PacketHandler from './PacketHandler';

/** The client saying whether it can keep a blob cache. */
export default class ClientCacheStatusHandler implements PacketHandler<ClientCacheStatusPacket> {
    public static PacketName = 'ClientCacheStatusPacket';
    public readonly phases = ['resourcePacks', 'play'] as const;

    /** Records whether chunk packets can use blob hashes for this session. */
    public async handle(packet: ClientCacheStatusPacket, server: Server, session: PlayerSession): Promise<void> {
        session.setClientCacheEnabled(packet.enabled);
        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} ${packet.enabled ? 'enabled' : 'disabled'} the blob cache`,
                'ClientCacheStatusHandler/handle'
            );
    }
}
