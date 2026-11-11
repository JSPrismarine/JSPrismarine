import type ResourcePacksReadyForValidationPacket from '@jsprismarine/protocol/packet/ResourcePacksReadyForValidationPacket';
import type { SessionContext } from './HandlerContext';
import type { ConnectionLaneHandler } from './SessionHandler';

/**
 * The client reporting that its resource packs have loaded.
 *
 * The server offers no packs, so there is nothing to validate and nothing to send back: the
 * client carries on to `ResourcePackClientResponsePacket(Completed)` by itself, and
 * `ResourcePackClientResponseHandler` starts the join from there. Recorded at debug level
 * so a join log shows the step happened.
 */
export default class ResourcePacksReadyForValidationHandler implements ConnectionLaneHandler<ResourcePacksReadyForValidationPacket> {
    public static PacketName = 'ResourcePacksReadyForValidationPacket';
    public readonly takes = 'context';
    public readonly phases = ['resourcePacks'] as const;
    public readonly lane = 'connection';

    /** Logs the report; the packet has no fields to check and needs no answer. */
    public handle(_packet: ResourcePacksReadyForValidationPacket, { session, log }: SessionContext): void {
        log.debug(
            `${session.identity.name} finished loading its resource packs`,
            'ResourcePacksReadyForValidationHandler/handle'
        );
    }
}
