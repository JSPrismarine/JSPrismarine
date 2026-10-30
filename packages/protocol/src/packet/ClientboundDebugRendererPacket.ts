import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import Vec3 from '../structure/Vec3';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The client-side debug renderer operation names sent as strings. */
export enum DebugRendererType {
    ClearDebugMarkers = 'cleardebugmarkers',
    AddDebugMarkerCube = 'adddebugmarkercube'
}

/** One labeled cube drawn by the client's debug renderer. */
export interface DebugMarkerData {
    /** Text shown at the marker. */
    text: string;
    /** Position where the cube is drawn. */
    position: Vec3;
    /** ARGB color, written as a little-endian signed int32. */
    color: number;
    /** Duration the cube remains visible, in milliseconds. */
    duration: bigint;
}

/** An instruction to add a debug marker or clear existing markers. */
export interface ClientboundDebugRenderer {
    /** Action string understood by the client. */
    type: string;
    /** Marker data for `adddebugmarkercube`, or `null` when the operation has no marker. */
    debugMarkerData: DebugMarkerData | null;
}

/**
 * Draws one debug cube on the client or clears the current debug markers.
 *
 * Protocol 2193 layout: `Type` (string), followed by optional `DebugMarkerData`. When
 * present, the marker contains `Text` (string), `Position` (three little-endian floats),
 * `Color` (little-endian int32), and `Duration` (little-endian uint64). The presence byte is
 * written for both operations.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/clientbound-debug-renderer-packet/
 */
export default class ClientboundDebugRendererPacket extends NetworkPacket<ClientboundDebugRenderer> {
    public get id(): number {
        return PacketIdentifier.CLIENTBOUND_DEBUG_RENDERER;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ClientboundDebugRenderer): void {
        stream.writeString(data.type);
        stream.writeBoolean(data.debugMarkerData !== null);
        if (data.debugMarkerData === null) return;

        stream.writeString(data.debugMarkerData.text);
        data.debugMarkerData.position.serialize(stream);
        stream.writeIntLE(data.debugMarkerData.color);
        stream.writeUnsignedLongLE(data.debugMarkerData.duration);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ClientboundDebugRenderer {
        const type = stream.readString();
        const debugMarkerData = stream.readBoolean()
            ? {
                  text: stream.readString(),
                  position: new Vec3(0, 0, 0),
                  color: 0,
                  duration: 0n
              }
            : null;
        if (debugMarkerData !== null) {
            debugMarkerData.position.deserialize(stream);
            debugMarkerData.color = stream.readIntLE();
            debugMarkerData.duration = stream.readUnsignedLongLE();
        }
        return { type, debugMarkerData };
    }
}
