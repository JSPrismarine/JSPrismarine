import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { clientboundDataDrivenUICloseScreenPacket } from '../wire/definitions/clientboundDataDrivenUICloseScreen';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { ClientboundDataDrivenUICloseScreenPayload } from '../wire/definitions/clientboundDataDrivenUICloseScreen';

/** The fields of a `ClientboundDataDrivenUICloseScreenPacket`, in wire order. */
export type ClientboundDataDrivenUICloseScreen = ClientboundDataDrivenUICloseScreenPayload;

/**
 * Tells the client to close one data-driven UI screen, or all of them.
 *
 * Protocol 2193 and 2225 layout, which do not differ: `FormId` as an optional, one presence byte followed by a
 * little-endian uint32 when the byte is 0x01. A packet whose presence byte is 0x00 closes
 * every open data-driven screen.
 *
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/clientbound-data-driven-uiclose-screen-packet/
 */
export default class ClientboundDataDrivenUICloseScreenPacket extends NetworkPacket<ClientboundDataDrivenUICloseScreen> {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'ClientboundDataDrivenUICloseScreenPacket';
    }

    public get id(): number {
        return PacketIdentifier.CLIENTBOUND_DATA_DRIVEN_UI_CLOSE_SCREEN;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ClientboundDataDrivenUICloseScreen): void {
        layoutAt(clientboundDataDrivenUICloseScreenPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ClientboundDataDrivenUICloseScreen {
        return layoutAt(clientboundDataDrivenUICloseScreenPacket, this.codecProtocol).decode(stream);
    }
}
