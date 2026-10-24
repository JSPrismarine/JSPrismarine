import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The fields of a `ClientboundDataDrivenUICloseScreenPacket`, in wire order. */
export interface ClientboundDataDrivenUICloseScreen {
    /** `FormId` of the one screen to close. Omit it to close every data-driven screen. */
    formId?: number;
}

/**
 * Tells the client to close one data-driven UI screen, or all of them.
 *
 * Protocol 2193 layout: `FormId` as an optional, one presence byte followed by a
 * little-endian uint32 when the byte is 0x01. A packet whose presence byte is 0x00 closes
 * every open data-driven screen.
 */
export default class ClientboundDataDrivenUICloseScreenPacket extends NetworkPacket<ClientboundDataDrivenUICloseScreen> {
    public get id(): number {
        return PacketIdentifier.CLIENTBOUND_DATA_DRIVEN_UI_CLOSE_SCREEN;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ClientboundDataDrivenUICloseScreen): void {
        stream.writeBoolean(data.formId !== undefined);
        if (data.formId !== undefined) {
            stream.writeUnsignedIntLE(data.formId);
        }
    }

    protected deserializePayload(stream: NetworkBinaryStream): ClientboundDataDrivenUICloseScreen {
        return stream.readBoolean() ? { formId: stream.readUnsignedIntLE() } : {};
    }
}
