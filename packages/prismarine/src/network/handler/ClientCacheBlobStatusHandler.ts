import type ClientCacheBlobStatusPacket from '@jsprismarine/protocol/packet/ClientCacheBlobStatusPacket';
import type { SessionContext } from './HandlerContext';
import type { ConnectionLaneHandler } from './SessionHandler';

/** The client's report of cached and missing blob hashes. */
export default class ClientCacheBlobStatusHandler implements ConnectionLaneHandler<ClientCacheBlobStatusPacket> {
    public static PacketName = 'ClientCacheBlobStatusPacket';
    public readonly phases = ['resourcePacks', 'play'] as const;
    public readonly lane = 'connection';

    /** Applies acknowledgments and sends bytes for blob ids the client reports missing. */
    public async handle(packet: ClientCacheBlobStatusPacket, { session, log }: SessionContext): Promise<void> {
        const responded = await session.handleClientCacheBlobStatus(packet);
        log.debug(
            `${session.identity.name} holds ${packet.foundIds.length} cached blob(s) and is missing ${packet.missingIds.length}; sent ${responded}`,
            'ClientCacheBlobStatusHandler/handle'
        );
    }
}
