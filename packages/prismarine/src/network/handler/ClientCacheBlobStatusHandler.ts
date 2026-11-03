import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import type ClientCacheBlobStatusPacket from '@jsprismarine/protocol/packet/ClientCacheBlobStatusPacket';
import type PacketHandler from './PacketHandler';

/** The client's report of cached and missing blob hashes. */
export default class ClientCacheBlobStatusHandler implements PacketHandler<ClientCacheBlobStatusPacket> {
    public static PacketName = 'ClientCacheBlobStatusPacket';
    public readonly phases = ['resourcePacks', 'play'] as const;

    /** Applies acknowledgements and sends bytes for blob ids the client reports missing. */
    public async handle(packet: ClientCacheBlobStatusPacket, server: Server, session: PlayerSession): Promise<void> {
        const responded = await session.handleClientCacheBlobStatus(packet);
        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} holds ${packet.foundIds.length} cached blob(s) and is missing ${packet.missingIds.length}; sent ${responded}`,
                'ClientCacheBlobStatusHandler/handle'
            );
    }
}
