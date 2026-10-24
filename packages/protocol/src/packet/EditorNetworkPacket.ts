import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The fields of an `EditorNetworkPacket`, in wire order. */
export interface EditorNetwork {
    /** `Route To Manager`: deliver the payload to the editor's network manager instead of the default receiver. */
    routeToManager: boolean;
    /** `Raw Variant Name`, the name of the `IEditorNetworkPayload` type that produced the data. */
    rawVariantName: string;
    /** `Raw Variant Data`, the payload serialized by that type. Opaque to the protocol. */
    rawVariantData: string;
}

/**
 * Carries an opaque Bedrock Editor payload between an editor client and an editor server.
 * The protocol does not interpret the payload; the named variant type on each side does.
 *
 * Protocol 2193 layout, in wire order: `Route To Manager` as one byte, then
 * `Raw Variant Name` and `Raw Variant Data` as strings, each a varuint32 byte length followed
 * by UTF-8.
 */
export default class EditorNetworkPacket extends NetworkPacket<EditorNetwork> {
    public get id(): number {
        return PacketIdentifier.EDITOR_NETWORK;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: EditorNetwork): void {
        stream.writeBoolean(data.routeToManager);
        stream.writeString(data.rawVariantName);
        stream.writeString(data.rawVariantData);
    }

    protected deserializePayload(stream: NetworkBinaryStream): EditorNetwork {
        return {
            routeToManager: stream.readBoolean(),
            rawVariantName: stream.readString(),
            rawVariantData: stream.readString()
        };
    }
}
