import type ClientCacheStatusPacket from '@jsprismarine/protocol/packet/ClientCacheStatusPacket';
import type { SessionContext } from './HandlerContext';
import type { ConnectionLaneHandler } from './SessionHandler';

/** The client saying whether it can keep a blob cache. */
export default class ClientCacheStatusHandler implements ConnectionLaneHandler<ClientCacheStatusPacket> {
    public static PacketName = 'ClientCacheStatusPacket';
    public readonly takes = 'context';
    public readonly phases = ['resourcePacks', 'play'] as const;
    public readonly lane = 'connection';

    /** Records whether chunk packets can use blob hashes for this session. */
    public async handle(packet: ClientCacheStatusPacket, { session, log }: SessionContext): Promise<void> {
        session.setClientCacheEnabled(packet.enabled);
        log.debug(
            `${session.identity.name} ${packet.enabled ? 'enabled' : 'disabled'} the blob cache`,
            'ClientCacheStatusHandler/handle'
        );
    }
}
