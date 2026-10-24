import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

/** Nothing. The packet arriving at all is the whole message. */
export type ClientboundDataDrivenUIReload = Record<string, never>;

/**
 * Tells the client to reload its data-driven UI definitions.
 *
 * Protocol 2193 layout: nothing after the packet header. The schema declares no fields.
 */
export default class ClientboundDataDrivenUIReloadPacket extends NetworkPacket<ClientboundDataDrivenUIReload> {
    public get id(): number {
        return PacketIdentifier.CLIENTBOUND_DATA_DRIVEN_UI_RELOAD;
    }

    protected serializePayload(): void {
        // Deliberately empty.
    }

    protected deserializePayload(): ClientboundDataDrivenUIReload {
        return {};
    }
}
