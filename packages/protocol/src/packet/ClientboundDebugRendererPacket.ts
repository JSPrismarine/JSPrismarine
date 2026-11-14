import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { clientboundDebugRendererPacket } from '../wire/definitions/clientboundDebugRenderer';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { ClientboundDebugRendererPayload } from '../wire/definitions/clientboundDebugRenderer';

/** The debug renderer action names the spec lists for `Type`, sent as strings. */
export enum DebugRendererType {
    Invalid = 'Invalid',
    ClearDebugMarkers = 'ClearDebugMarkers',
    AddDebugMarkerCube = 'AddDebugMarkerCube'
}

/** An instruction to add a debug marker or clear existing markers. */
export type ClientboundDebugRenderer = ClientboundDebugRendererPayload;

/** One labeled cube drawn by the client's debug renderer. */
export type DebugMarkerData = NonNullable<ClientboundDebugRendererPayload['debugMarkerData']>;

/**
 * Draws one debug cube on the client or clears the current debug markers.
 *
 * Protocol 2193 and 2225 layout (identical): `Type` (string), followed by optional `DebugMarkerData`. When
 * present, the marker contains `Text` (string), `Position` (three little-endian floats),
 * `Color` (little-endian int32), and `Duration` (little-endian uint64). The presence byte is
 * written for both operations.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/clientbound-debug-renderer-packet/
 */
export default class ClientboundDebugRendererPacket extends NetworkPacket<ClientboundDebugRendererPayload> {
    public get id(): number {
        return PacketIdentifier.CLIENTBOUND_DEBUG_RENDERER;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ClientboundDebugRendererPayload): void {
        layoutAt(clientboundDebugRendererPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ClientboundDebugRendererPayload {
        return layoutAt(clientboundDebugRendererPacket, this.codecProtocol).decode(stream);
    }
}
