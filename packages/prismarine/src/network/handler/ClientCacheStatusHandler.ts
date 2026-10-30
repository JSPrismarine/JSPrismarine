import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import type ClientCacheStatusPacket from '@jsprismarine/protocol/packet/ClientCacheStatusPacket';
import type PacketHandler from './PacketHandler';

/**
 * The client saying whether it can keep a blob cache.
 *
 * Nothing to do. The server sends every chunk with the cache off, so the offer is noted
 * and declined by never taking it up. Handled all the same, because a registered packet
 * with no handler is an error per packet rather than a warning per packet.
 */
export default class ClientCacheStatusHandler implements PacketHandler<ClientCacheStatusPacket> {
    public static PacketName = 'ClientCacheStatusPacket';
    public readonly phases = ['resourcePacks', 'play'] as const;

    /** Records the offer at debug level and sends nothing back. */
    public async handle(packet: ClientCacheStatusPacket, server: Server, session: PlayerSession): Promise<void> {
        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} ${packet.enabled ? 'offered' : 'did not offer'} a blob cache. The server keeps it off`,
                'ClientCacheStatusHandler/handle'
            );
    }
}
