import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

/** Nothing. The packet arriving at all is the whole message. */
export type ResourcePacksReadyForValidation = Record<string, never>;

/**
 * The client telling the server it has finished loading every resource pack.
 *
 * Protocol 2193 layout: the packet header and no payload. The docs describe it as "used to
 * inform the server that the client has finished loading all resource packs"; it is
 * client-to-server and belongs to the resource pack exchange after `ResourcePackStack`.
 */
export default class ResourcePacksReadyForValidationPacket extends NetworkPacket<ResourcePacksReadyForValidation> {
    public get id(): number {
        return PacketIdentifier.RESOURCE_PACKS_READY_FOR_VALIDATION;
    }

    protected serializePayload(): void {
        // Deliberately empty.
    }

    protected deserializePayload(): ResourcePacksReadyForValidation {
        return {};
    }
}
