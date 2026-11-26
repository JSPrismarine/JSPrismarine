import type ResourcePacksReadyForValidationPacket from '@jsprismarine/protocol/bedrock/packet/ResourcePacksReadyForValidationPacket';
import type { SessionContext } from '../../../player/context/HandlerContext';
import type { ConnectionLaneHandler } from '../../../player/context/SessionHandler';

/**
 * The client reporting that its resource packs have loaded.
 *
 * The server has nothing to validate in the packs it sent and nothing to send back: the
 * client carries on to `ResourcePackClientResponsePacket(Completed)` by itself, and
 * `ResourcePackClientResponseHandler` starts the join from there. Recorded at debug level
 * so a join log shows the step happened.
 */
export default class ResourcePacksReadyForValidationHandler implements ConnectionLaneHandler<ResourcePacksReadyForValidationPacket> {
    public static PacketName = 'ResourcePacksReadyForValidationPacket';
    public readonly phases = ['resourcePacks'] as const;
    public readonly lane = 'connection';

    /** Logs the report; the packet has no fields to check and needs no answer. */
    public handle(_packet: ResourcePacksReadyForValidationPacket, { session, log }: SessionContext): void {
        log.debug(`${session.identity.name} finished loading its resource packs`);
    }
}
