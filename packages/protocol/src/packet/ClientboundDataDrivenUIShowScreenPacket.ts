import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { clientboundDataDrivenUIShowScreenPacket } from '../wire/definitions/clientboundDataDrivenUIShowScreen';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { ClientboundDataDrivenUIShowScreenPayload } from '../wire/definitions/clientboundDataDrivenUIShowScreen';

/** The fields of a `ClientboundDataDrivenUIShowScreenPacket`, in wire order. */
export type ClientboundDataDrivenUIShowScreen = ClientboundDataDrivenUIShowScreenPayload;

/**
 * Tells the client to open a data-driven UI screen. The client answers with
 * `ServerboundDataDrivenScreenClosedPacket` once the screen goes away.
 *
 * Protocols 2193 and 2225 share one layout, in wire order: `ScreenId` as a string (a varuint32 byte length
 * followed by UTF-8), `FormId` as a little-endian uint32, then `DataInstanceId` as an
 * optional: one presence byte, followed by a little-endian uint32 when the byte is 0x01.
 *
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/clientbound-data-driven-uishow-screen-packet/
 */
export default class ClientboundDataDrivenUIShowScreenPacket extends NetworkPacket<ClientboundDataDrivenUIShowScreen> {
    public get id(): number {
        return PacketIdentifier.CLIENTBOUND_DATA_DRIVEN_UI_SHOW_SCREEN;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ClientboundDataDrivenUIShowScreen): void {
        layoutAt(clientboundDataDrivenUIShowScreenPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ClientboundDataDrivenUIShowScreen {
        return layoutAt(clientboundDataDrivenUIShowScreenPacket, this.codecProtocol).decode(stream);
    }
}
