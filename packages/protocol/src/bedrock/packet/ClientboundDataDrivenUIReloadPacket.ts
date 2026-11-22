import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

/** Nothing. The packet arriving at all is the whole message. */
export type ClientboundDataDrivenUIReload = Record<string, never>;

/**
 * Tells the client to reload its data-driven UI definitions.
 *
 * Protocol 2193 and 2225 layout: nothing after the packet header. The schema declares no fields.
 *
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/clientbound-data-driven-uireload-packet/
 */
export default class ClientboundDataDrivenUIReloadPacket extends NetworkPacket<ClientboundDataDrivenUIReload> {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'ClientboundDataDrivenUIReloadPacket';
    }

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
