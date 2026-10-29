import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import type ResourcePacksReadyForValidationPacket from '../packet/ResourcePacksReadyForValidationPacket';
import type PacketHandler from './PacketHandler';

/**
 * The client reporting that its resource packs have loaded.
 *
 * The server offers no packs, so there is nothing to validate and nothing to send back: the
 * client carries on to `ResourcePackClientResponsePacket(Completed)` by itself, and
 * `ResourcePackClientResponseHandler` starts the join from there. Recorded at debug level
 * so a join log shows the step happened.
 */
export default class ResourcePacksReadyForValidationHandler implements PacketHandler<ResourcePacksReadyForValidationPacket> {
    public static PacketName = 'ResourcePacksReadyForValidationPacket';
    public readonly phases = ['resourcePacks'] as const;

    /** Logs the report; the packet has no fields to check and needs no answer. */
    public handle(_packet: ResourcePacksReadyForValidationPacket, server: Server, session: PlayerSession): void {
        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} finished loading its resource packs`,
                'ResourcePacksReadyForValidationHandler/handle'
            );
    }
}
