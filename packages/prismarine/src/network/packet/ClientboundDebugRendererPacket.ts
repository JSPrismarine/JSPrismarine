import type { Vector3 } from '@jsprismarine/math';

import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * The strings the Type field carries.
 *
 * Mojang's page names the C++ enumerators `ClearDebugMarkers` and `AddDebugMarkerCube`; the
 * strings on the wire are the lowercase forms below, which is what gophertunnel and
 * PocketMine both read.
 */
export enum DebugRendererType {
    ClearDebugMarkers = 'cleardebugmarkers',
    AddDebugMarkerCube = 'adddebugmarkercube'
}

/** One labelled debug cube. */
export interface DebugMarkerData {
    /** Text shown at the marker. */
    text: string;
    /** Position the cube is drawn at. */
    position: Vector3;
    /** Color of the cube, an ARGB integer written as a signed int32 in little-endian byte order. */
    color: number;
    /** Duration in milliseconds the cube stays up, a uint64 in little-endian byte order. */
    duration: bigint;
}

/**
 * An order to draw a debug cube or to clear the debug cubes already drawn.
 *
 * Bound to the client.
 *
 * Wire order at protocol 2193: Type as a string (see {@link DebugRendererType}), then
 * DebugMarkerData as an optional: a presence byte, and when it is set, Text (string),
 * Position (three floats in little-endian byte order), Color (int32, little-endian, so an
 * ARGB integer lands on the wire as B, G, R, A), and duration (uint64, little-endian). The
 * presence byte is written for a clear as well, with no data behind it.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/clientbound-debug-renderer-packet/
 */
export default class ClientboundDebugRendererPacket extends DataPacket {
    public static NetID = Identifiers.ClientboundDebugRendererPacket;

    /** Type: the action to perform. */
    public type: string = DebugRendererType.ClearDebugMarkers;

    /** DebugMarkerData: the cube to add, or null for any other action. */
    public debugMarkerData: DebugMarkerData | null = null;

    /** Reads the action type and the optional marker data. */
    public decodePayload(): void {
        this.type = NetworkUtil.readString(this);
        this.debugMarkerData = this.readBoolean()
            ? {
                  text: NetworkUtil.readString(this),
                  position: NetworkUtil.readVector3(this),
                  color: this.readIntLE(),
                  duration: this.readUnsignedLongLE()
              }
            : null;
    }

    /** Writes the action type and the optional marker data. */
    public encodePayload(): void {
        NetworkUtil.writeString(this, this.type);

        this.writeBoolean(this.debugMarkerData !== null);
        if (this.debugMarkerData !== null) {
            NetworkUtil.writeString(this, this.debugMarkerData.text);
            NetworkUtil.writeVector3(this, this.debugMarkerData.position);
            this.writeIntLE(this.debugMarkerData.color);
            this.writeUnsignedLongLE(this.debugMarkerData.duration);
        }
    }
}
