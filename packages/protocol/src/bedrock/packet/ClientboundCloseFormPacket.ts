import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

/** Nothing. The packet arriving at all is the whole message. */
export type ClientboundCloseForm = Record<string, never>;

/**
 * Closes every server form on the client's UI stack and returns it to the HUD.
 *
 * Layout at protocols 2193 and 2225: the packet header and no payload. The client acts on it only when a
 * server form (one opened by `ModalFormRequest` or `ServerSettingsResponse`) is on its stack;
 * inventories and other containers stay open.
 *
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/clientbound-close-form-packet/
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
