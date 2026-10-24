import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

/** Nothing. The packet arriving at all is the whole message. */
export type ClientboundCloseForm = Record<string, never>;

/**
 * Closes every server form on the client's UI stack and returns it to the HUD.
 *
 * Protocol 2193 layout: the packet header and no payload. The client acts on it only when a
 * server form (one opened by `ModalFormRequest` or `ServerSettingsResponse`) is on its stack;
 * inventories and other containers stay open.
 */
export default class ClientboundCloseFormPacket extends NetworkPacket<ClientboundCloseForm> {
    public get id(): number {
        return PacketIdentifier.CLIENTBOUND_CLOSE_FORM;
    }

    protected serializePayload(): void {
        // Deliberately empty.
    }

    protected deserializePayload(): ClientboundCloseForm {
        return {};
    }
}
