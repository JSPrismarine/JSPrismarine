import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The fields of a `ClientboundDataDrivenUIShowScreenPacket`, in wire order. */
export interface ClientboundDataDrivenUIShowScreen {
    /** `ScreenId`: which data-driven screen to show, at most 500 characters. */
    screenId: string;
    /** `FormId`: the id of this instance of the form, which scripting uses to track it. */
    formId: number;
    /** `DataInstanceId`: the id of the data bound to this screen. Omit it when the screen has none. */
    dataInstanceId?: number;
}

/**
 * Tells the client to open a data-driven UI screen. The client answers with
 * `ServerboundDataDrivenScreenClosedPacket` once the screen goes away.
 *
 * Protocol 2193 layout, in wire order: `ScreenId` as a string (a varuint32 byte length
 * followed by UTF-8), `FormId` as a little-endian uint32, then `DataInstanceId` as an
 * optional: one presence byte, followed by a little-endian uint32 when the byte is 0x01.
 */
export default class ClientboundDataDrivenUIShowScreenPacket extends NetworkPacket<ClientboundDataDrivenUIShowScreen> {
    public get id(): number {
        return PacketIdentifier.CLIENTBOUND_DATA_DRIVEN_UI_SHOW_SCREEN;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ClientboundDataDrivenUIShowScreen): void {
        stream.writeString(data.screenId);
        stream.writeUnsignedIntLE(data.formId);

        stream.writeBoolean(data.dataInstanceId !== undefined);
        if (data.dataInstanceId !== undefined) {
            stream.writeUnsignedIntLE(data.dataInstanceId);
        }
    }

    protected deserializePayload(stream: NetworkBinaryStream): ClientboundDataDrivenUIShowScreen {
        const screenId = stream.readString();
        const formId = stream.readUnsignedIntLE();
        const dataInstance = stream.readBoolean() ? { dataInstanceId: stream.readUnsignedIntLE() } : {};

        return { screenId, formId, ...dataInstance };
    }
}
