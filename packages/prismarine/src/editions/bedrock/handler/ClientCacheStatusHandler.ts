import type ClientCacheStatusPacket from '@jsprismarine/protocol/bedrock/packet/ClientCacheStatusPacket';
import type { SessionContext } from '../../../player/context/HandlerContext';
import type { ConnectionLaneHandler } from '../../../player/context/SessionHandler';
import { bedrockChunksOf } from '../bedrockChunksOf';

/** The client saying whether it can keep a blob cache. */
export default class ClientCacheStatusHandler implements ConnectionLaneHandler<ClientCacheStatusPacket> {
    public static PacketName = 'ClientCacheStatusPacket';
    public readonly phases = ['resourcePacks', 'play'] as const;
    public readonly lane = 'connection';

    /** Records whether chunk packets can use blob hashes for this session. */
    public async handle(packet: ClientCacheStatusPacket, { session, log }: SessionContext): Promise<void> {
        bedrockChunksOf(session).setClientCacheEnabled(packet.enabled);
        log.debug(`${session.identity.name} ${packet.enabled ? 'enabled' : 'disabled'} the blob cache`);
    }
}
